import { describe, expect, it } from 'vitest';
import { formatDigest, sendDigest } from '../src/digest/telegram.js';
import type { Enriched } from '../src/score/types.js';
import { res } from './helpers.js';

const item: Enriched = {
  id: 'a',
  url: 'https://example.com/a?x=1&y="2"',
  title: 'Raw <title>',
  snippet: '',
  source: 'HN',
  sourceKind: 'hn',
  momentum: { perHour: 1 },
  tags: [],
  media: { type: 'article' },
  keywordScore: 1,
  score: 10,
  niches: [],
  ai: {
    score: 88.4,
    why: 'w',
    hook: 'Hook <b>',
    angle: 'a',
    title: 'Nice & title',
    format: 'short',
    effort: 'S',
  },
};

describe('telegram digest', () => {
  it('formats title, score, hook and link with HTML escaped', () => {
    const t = formatDigest([item], 3);
    expect(t).toContain('3 new');
    expect(t).toContain('<b>Nice &amp; title</b> (88)');
    expect(t).toContain('Hook &lt;b&gt;');
    expect(t).toContain('href="https://example.com/a?x=1&amp;y=&quot;2&quot;"');
  });

  it('skips quietly without credentials', async () => {
    let called = false;
    const f = async () => {
      called = true;
      return res('{}');
    };
    expect(await sendDigest(f, {}, [item], 1)).toBe(false);
    expect(await sendDigest(f, { TELEGRAM_BOT_TOKEN: 't' }, [item], 1)).toBe(false);
    expect(called).toBe(false);
  });

  it('posts to the Bot API and hides the token in errors', async () => {
    let seen: { url: string; body: Record<string, unknown> } | undefined;
    const ok = async (url: string, init?: RequestInit) => {
      seen = { url, body: JSON.parse(init?.body as string) as Record<string, unknown> };
      return res('{"ok":true}');
    };
    const env = { TELEGRAM_BOT_TOKEN: 'SECRET', TELEGRAM_CHAT_ID: '42' };
    expect(await sendDigest(ok, env, [item], 1)).toBe(true);
    expect(seen?.url).toBe('https://api.telegram.org/botSECRET/sendMessage');
    expect(seen?.body).toMatchObject({ chat_id: '42', parse_mode: 'HTML' });

    await expect(sendDigest(async () => res('no', 401), env, [item], 1)).rejects.toThrow(
      /^telegram HTTP 401$/,
    );
  });
});
