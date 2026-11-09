import { describe, expect, it } from 'vitest';
import {
  defineConfig,
  emptyFeedback,
  runForUsers,
  type Enriched,
  type RadarStore,
  type RadarUser,
  type ScoredItem,
} from '../src/index.js';
import { NOW, fixture, niches, res, routedFetch } from './helpers.js';
import { fakeNotion } from './fakeNotion.js';

const config = defineConfig({
  niches,
  sources: [
    { id: 'gol', type: 'rss', name: 'GamingOnLinux', url: 'https://gol.test/feed' },
    { id: 'other', type: 'rss', name: 'Other', url: 'https://other.test/feed' },
  ],
  provider: 'deepseek',
  topN: 4,
  digest: { top: 2 },
});

const env = { DEEPSEEK_API_KEY: 'dk', TELEGRAM_BOT_TOKEN: 'tb', TELEGRAM_CHAT_ID: 'global' };

const reply = (n: number, format = 'short') =>
  JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify({
            score: 90 - n,
            why: 'w',
            hook: 'h',
            angle: 'a',
            title: 't',
            format,
            effort: 'S',
          }),
        },
      },
    ],
  });

const steam: RadarUser['niches'] = [
  { id: 'steam', name: 'Steam', weight: 1, keywords: ['steam frame', 'steamos'] },
];

const proton: RadarUser['niches'] = [
  { id: 'epic', name: 'Epic', weight: 1, keywords: ['epic games', 'roguefort'] },
];

function routes(format = 'short') {
  let n = 0;
  return routedFetch({
    'gol.test': () => res(fixture('gol.xml')),
    'other.test': () => res('', 500),
    'api.deepseek.com': () => res(reply(n++, format)),
    'api.telegram.org': () => res('{"ok":true}'),
  });
}

const user = (id: string, extra: Partial<RadarUser> = {}): RadarUser => ({
  id,
  email: `${id}@example.com`,
  niches: steam,
  sources: [],
  topN: 3,
  ...extra,
});

function memoryStore(users: RadarUser[], failFor: string[] = []) {
  const feed: ScoredItem[] = [];
  const seen = new Map<string, Set<string>>();
  const queue = new Map<string, Enriched[]>();
  const store: RadarStore = {
    listProUsers: async () => users,
    upsertFeed: async (items) => {
      feed.push(...items);
      return items.length;
    },
    seenUrls: async (id, urls) => new Set(urls.filter((u) => seen.get(id)?.has(u))),
    feedback: async () => emptyFeedback(),
    insertQueue: async (id, items) => {
      if (failFor.includes(id)) throw new Error('db down');
      const rows = queue.get(id) ?? [];
      const have = new Set(rows.map((r) => r.url));
      const fresh = items.filter((i) => !have.has(i.url));
      queue.set(id, [...rows, ...fresh]);
      return fresh.length;
    },
    markSeen: async (id, urls) => {
      const s = seen.get(id) ?? new Set();
      for (const u of urls) s.add(u);
      seen.set(id, s);
    },
  };
  return { store, feed, seen, queue };
}

describe('runForUsers', () => {
  it('fetches once, writes the shared feed and queues per user with their own niches', async () => {
    const fetch = routes();
    const m = memoryStore([
      user('ann', { telegramChatId: '42' }),
      user('bob', { niches: proton }),
      user('empty', { niches: [] }),
    ]);
    const out = await runForUsers(config, m.store, { env, fetch, now: NOW });

    expect(fetch.calls.filter((u) => u.includes('gol.test'))).toHaveLength(1);
    expect(out.feedRows).toBe(m.feed.length);
    expect(out.users.map((u) => u.userId)).toEqual(['ann', 'bob']);
    // ann follows Steam topics only: the 3 Steam Frame / SteamOS articles
    expect(
      m.queue
        .get('ann')
        ?.map((i) => i.title)
        .every((t) => /Steam/.test(t)),
    ).toBe(true);
    expect(m.queue.get('ann')).toHaveLength(3);
    expect(m.queue.get('bob')).toHaveLength(2);
    expect(m.seen.get('ann')?.size).toBe(3);
    expect(m.queue.has('empty')).toBe(false);
    expect(out.users[0]).toMatchObject({ queued: 3, seenMarked: 3, digestSent: true });
  });

  it('sends Telegram only to users with a chat id, using their chat id', async () => {
    const fetch = routes();
    const bodies: string[] = [];
    const wrapped = Object.assign(
      async (url: string, init?: RequestInit) => {
        if (url.includes('telegram')) bodies.push(String(init?.body));
        return fetch(url, init);
      },
      { calls: fetch.calls },
    );
    const m = memoryStore([user('ann', { telegramChatId: '42' }), user('bob')]);
    const out = await runForUsers(config, m.store, { env, fetch: wrapped, now: NOW });
    expect(bodies).toHaveLength(1);
    expect(JSON.parse(bodies[0] ?? '{}')).toMatchObject({ chat_id: '42' });
    expect(out.users.map((u) => u.digestSent)).toEqual([true, false]);
  });

  it('drops urls the user has seen, so a second run queues nothing new', async () => {
    const m = memoryStore([user('ann')]);
    const first = await runForUsers(config, m.store, { env, fetch: routes(), now: NOW });
    const second = await runForUsers(config, m.store, { env, fetch: routes(), now: NOW });
    expect(first.users[0]?.queued).toBe(3);
    expect(second.users[0]).toMatchObject({ candidates: 0, queued: 0 });
  });

  it('honours the user source selection', async () => {
    const m = memoryStore([user('ann', { sources: ['other'] })]);
    const out = await runForUsers(config, m.store, { env, fetch: routes(), now: NOW });
    expect(out.users[0]?.candidates).toBe(0);
  });

  it('isolates one failing user from the others', async () => {
    const m = memoryStore([user('bad'), user('good')], ['bad']);
    const out = await runForUsers(config, m.store, { env, fetch: routes(), now: NOW });
    expect(out.users[0]?.error).toBe('db down');
    expect(out.users[0]?.seenMarked).toBe(0);
    expect(m.seen.has('bad')).toBe(false);
    expect(out.users[1]).toMatchObject({ queued: 3, seenMarked: 3 });
    expect(out.warnings.some((w) => w.includes('bad@example.com'))).toBe(true);
  });

  it('leaves unscorable items unseen and skips "skip" verdicts from the queue', async () => {
    const failing = routedFetch({
      'gol.test': () => res(fixture('gol.xml')),
      'other.test': () => res('', 500),
      'api.deepseek.com': () => res('nope', 500),
    });
    const a = memoryStore([user('ann')]);
    const out1 = await runForUsers(config, a.store, { env, fetch: failing, now: NOW });
    expect(out1.users[0]).toMatchObject({ scoringFailed: 3, queued: 0, seenMarked: 0 });

    const b = memoryStore([user('ann')]);
    const out2 = await runForUsers(config, b.store, { env, fetch: routes('skip'), now: NOW });
    expect(out2.users[0]).toMatchObject({ scored: 3, queued: 0, seenMarked: 3 });
  });

  it('keeps a failing Notion item unseen and does not stop the user', async () => {
    const notion = fakeNotion();
    const create = notion.pages.create;
    let k = 0;
    notion.pages.create = async (a) => {
      if (k++ === 0) throw new Error('boom');
      return create(a);
    };
    const m = memoryStore([user('ann', { notion: { token: 'nt', dbId: 'db' } })]);
    const out = await runForUsers(config, m.store, {
      env,
      fetch: routes(),
      notion: () => notion,
      now: NOW,
    });
    expect(out.users[0]?.notion).toMatchObject({ created: 2, failed: 1 });
    expect(out.users[0]).toMatchObject({ queued: 3, seenMarked: 2 });
  });

  it('works with the none provider (keyword rank, no LLM calls)', async () => {
    const fetch = routes();
    const m = memoryStore([user('ann')]);
    const out = await runForUsers({ ...config, provider: 'none' }, m.store, {
      env: {},
      fetch,
      now: NOW,
    });
    expect(out.provider).toBe('none');
    expect(out.users[0]).toMatchObject({ queued: 3, seenMarked: 3, digestSent: false });
    expect(fetch.calls.some((u) => u.includes('deepseek'))).toBe(false);
    expect(m.queue.get('ann')?.every((i) => !i.ai)).toBe(true);
  });
});
