import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defineConfig, runRadar } from '../src/index.js';
import { NOW, fixture, niches, res, routedFetch } from './helpers.js';
import { fakeNotion } from './fakeNotion.js';

const config = defineConfig({
  niches,
  sources: [
    { type: 'rss', name: 'GamingOnLinux', url: 'https://gol.test/feed', alwaysInclude: true },
  ],
  provider: 'deepseek',
  topN: 4,
  digest: { top: 2 },
});

const env = {
  DEEPSEEK_API_KEY: 'dk',
  NOTION_TOKEN: 'nt',
  NOTION_DB_ID: 'db',
  TELEGRAM_BOT_TOKEN: 'tb',
  TELEGRAM_CHAT_ID: '1',
};

const reply = (n: number) =>
  JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify({
            score: 90 - n,
            why: 'w',
            summary: 's',
            hook: 'h',
            angle: 'a',
            title: 't',
            format: 'short',
            effort: 'S',
          }),
        },
      },
    ],
  });

function routes() {
  let n = 0;
  return routedFetch({
    'gol.test': () => res(fixture('gol.xml')),
    'api.deepseek.com': () => res(reply(n++)),
    'api.telegram.org': () => res('{"ok":true}'),
  });
}

let dir = '';
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = '';
});

describe('runRadar', () => {
  it('scores, upserts, sends the digest and saves the seen store', async () => {
    dir = await mkdtemp(join(tmpdir(), 'radar-'));
    const fetch = routes();
    const notion = fakeNotion();
    const out = await runRadar(config, { dataDir: dir, env, fetch, notion, now: NOW });

    expect(out.provider).toBe('deepseek');
    expect(out.items).toHaveLength(4);
    expect(out.notion?.created).toBe(4);
    expect(out.digestSent).toBe(true);
    expect(fetch.calls.filter((u) => u.includes('telegram'))).toHaveLength(1);
    expect(notion.calls.filter((c) => c.method === 'pages.create')).toHaveLength(4);
    // feedback queries (Picked, Skipped) happen before scoring
    expect(notion.calls.filter((c) => c.method === 'dataSources.query').length).toBeGreaterThan(2);

    const seen = JSON.parse(await readFile(join(dir, 'seen.json'), 'utf8')) as {
      entries: Record<string, string>;
    };
    expect(Object.keys(seen.entries)).toHaveLength(4);
    expect(existsSync(join(dir, 'feed.json'))).toBe(true);
  });

  it('does not mark items seen when their Notion upsert fails', async () => {
    dir = await mkdtemp(join(tmpdir(), 'radar-'));
    const notion = fakeNotion();
    const create = notion.pages.create;
    let k = 0;
    notion.pages.create = async (a) => {
      if (k++ === 0) throw new Error('boom');
      return create(a);
    };
    const out = await runRadar(config, { dataDir: dir, env, fetch: routes(), notion, now: NOW });
    expect(out.notion?.failed).toHaveLength(1);
    expect(out.seenMarked).toBe(3);
  });

  it('--dry writes nothing and makes no Notion or Telegram calls, but still scores', async () => {
    dir = await mkdtemp(join(tmpdir(), 'radar-'));
    const fetch = routes();
    const notion = fakeNotion();
    const out = await runRadar(config, { dataDir: dir, dry: true, env, fetch, notion, now: NOW });
    expect(out.items[0]?.ai?.score).toBeGreaterThan(0);
    expect(notion.calls).toHaveLength(0);
    expect(fetch.calls.some((u) => u.includes('telegram'))).toBe(false);
    expect(existsSync(join(dir, 'seen.json'))).toBe(false);
    expect(existsSync(join(dir, 'feed.json'))).toBe(false);
  });

  it('falls back to none with warnings when no keys are set, and still saves seen', async () => {
    dir = await mkdtemp(join(tmpdir(), 'radar-'));
    const fetch = routes();
    const out = await runRadar(config, { dataDir: dir, env: {}, fetch, now: NOW });
    expect(out.provider).toBe('none');
    expect(out.items.every((i) => !i.ai)).toBe(true);
    expect(out.notion).toBeUndefined();
    expect(out.digestSent).toBe(false);
    expect(out.warnings.some((w) => /DEEPSEEK_API_KEY/.test(w))).toBe(true);
    expect(out.warnings.some((w) => /NOTION_TOKEN/.test(w))).toBe(true);
    expect(fetch.calls.every((u) => u.includes('gol.test'))).toBe(true);
    expect(existsSync(join(dir, 'seen.json'))).toBe(true);
  });

  it('leaves unscorable items unseen', async () => {
    dir = await mkdtemp(join(tmpdir(), 'radar-'));
    const fetch = routedFetch({
      'gol.test': () => res(fixture('gol.xml')),
      'api.deepseek.com': () => res('nope', 500),
    });
    const out = await runRadar(config, {
      dataDir: dir,
      env: { DEEPSEEK_API_KEY: 'k' },
      fetch,
      now: NOW,
    });
    expect(out.items).toHaveLength(0);
    expect(out.scoringFailed).toBe(4);
    expect(out.seenMarked).toBe(0);
  });
});
