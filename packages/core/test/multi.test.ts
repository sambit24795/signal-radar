import { describe, expect, it } from 'vitest';
import {
  defineConfig,
  type PushSender,
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
  const deletedSubs: string[] = [];
  const cleared: string[] = [];
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
    deletePushSubscriptions: async (endpoints) => {
      deletedSubs.push(...endpoints);
    },
    clearTelegram: async (id) => {
      cleared.push(id);
    },
  };
  return { store, feed, seen, queue, deletedSubs, cleared };
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

  describe('web push and telegram cleanup', () => {
    const subA = { endpoint: 'https://push.test/a', keys: { p256dh: 'p', auth: 'a' } };
    const subB = { endpoint: 'https://push.test/b', keys: { p256dh: 'p', auth: 'a' } };

    it('sends one push per subscription when items were queued, and counts them', async () => {
      const sent: { endpoint: string; payload: string; ttl: number }[] = [];
      const push: PushSender = async (sub, payload, o) => {
        sent.push({ endpoint: sub.endpoint, payload, ttl: o.ttl });
      };
      const m = memoryStore([user('ann', { pushSubscriptions: [subA, subB] }), user('bob')]);
      const out = await runForUsers(config, m.store, { env, fetch: routes(), now: NOW, push });
      expect(out.users.map((u) => u.pushSent)).toEqual([2, 0]);
      expect(sent.map((x) => x.endpoint)).toEqual([subA.endpoint, subB.endpoint]);
      expect(JSON.parse(sent[0]?.payload ?? '{}')).toMatchObject({
        title: '3 new in your queue',
        url: '/queue',
        tag: 'queue',
      });
      expect(sent[0]?.ttl).toBe(43200);
    });

    it('sends nothing when the run queued nothing new', async () => {
      let calls = 0;
      const push: PushSender = async () => {
        calls++;
      };
      const m = memoryStore([user('ann', { pushSubscriptions: [subA] })]);
      await runForUsers(config, m.store, { env, fetch: routes(), now: NOW, push });
      expect(calls).toBe(1);
      const again = await runForUsers(config, m.store, { env, fetch: routes(), now: NOW, push });
      expect(again.users[0]).toMatchObject({ queued: 0, pushSent: 0 });
      expect(calls).toBe(1);
    });

    it('is disabled without a sender or VAPID env, with no warnings', async () => {
      const m = memoryStore([user('ann', { pushSubscriptions: [subA] })]);
      const out = await runForUsers(config, m.store, { env, fetch: routes(), now: NOW });
      expect(out.users[0]).toMatchObject({ queued: 3, pushSent: 0 });
      expect(out.warnings.filter((w) => w.startsWith('ann'))).toEqual([]);
    });

    it('deletes gone subscriptions and warns on other failures without failing the user', async () => {
      const push: PushSender = async (sub) => {
        const err = Object.assign(new Error('x'), {
          statusCode: sub.endpoint === subA.endpoint ? 410 : 500,
        });
        throw err;
      };
      const m = memoryStore([user('ann', { pushSubscriptions: [subA, subB] })]);
      const out = await runForUsers(config, m.store, { env, fetch: routes(), now: NOW, push });
      expect(m.deletedSubs).toEqual([subA.endpoint]);
      expect(out.users[0]).toMatchObject({ queued: 3, pushSent: 0 });
      expect(out.users[0]?.error).toBeUndefined();
      expect(out.warnings.some((w) => w.includes('push HTTP 500'))).toBe(true);
      expect(out.warnings.join()).not.toContain('push.test');
    });

    it('clears the telegram chat id when the bot was blocked (403)', async () => {
      const f = routedFetch({
        'gol.test': () => res(fixture('gol.xml')),
        'other.test': () => res('', 500),
        'api.deepseek.com': () => res(reply(0)),
        'api.telegram.org': () => res('{"ok":false}', 403),
      });
      const m = memoryStore([
        user('ann', { telegramChatId: '42' }),
        user('bob', { telegramChatId: '43' }),
      ]);
      const out = await runForUsers(config, m.store, { env, fetch: f, now: NOW });
      expect(m.cleared).toEqual(['ann', 'bob']);
      expect(out.users[0]?.digestSent).toBe(false);
      expect(out.warnings.join()).not.toContain('tb');
    });

    it('keeps the chat id on other telegram errors', async () => {
      const f = routedFetch({
        'gol.test': () => res(fixture('gol.xml')),
        'other.test': () => res('', 500),
        'api.deepseek.com': () => res(reply(0)),
        'api.telegram.org': () => res('{"ok":false}', 500),
      });
      const m = memoryStore([user('ann', { telegramChatId: '42' })]);
      await runForUsers(config, m.store, { env, fetch: f, now: NOW });
      expect(m.cleared).toEqual([]);
    });
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

  describe('custom feeds', () => {
    const nvidia: RadarUser['niches'] = [
      { id: 'ai', name: 'AI', weight: 1, keywords: ['nvidia', 'steam frame'] },
    ];
    const feedOf = (id: string, host: string) => ({
      id: `custom:${id}`,
      url: `https://${host}/rss`,
      title: `${host} feed`,
    });
    const publicDns = async () => ['93.184.216.34'];

    it('fetches each custom url once and routes items only to the owners', async () => {
      const fetch = routedFetch({
        'verge.example': () => res(fixture('verge.xml')),
        'broken.example': () => res('', 500),
        'gol.test': () => res(fixture('gol.xml')),
        'other.test': () => res('', 500),
        'api.deepseek.com': () => res(reply(0)),
        'api.telegram.org': () => res('{"ok":true}'),
      });
      const mine = feedOf('verge', 'verge.example');
      const m = memoryStore([
        user('ann'),
        user('bob', { niches: nvidia, customFeeds: [mine] }),
        user('cat', { niches: nvidia, customFeeds: [mine, feedOf('bad', 'broken.example')] }),
        user('dan', { niches: nvidia }),
      ]);
      const out = await runForUsers(config, m.store, {
        env,
        fetch,
        now: NOW,
        resolve: publicDns,
      });

      expect(fetch.calls.filter((u) => u.includes('verge.example'))).toHaveLength(1);
      const nvidiaTitles = (id: string) =>
        (m.queue.get(id) ?? []).filter((i) => /Nvidia/.test(i.title));
      expect(nvidiaTitles('bob').length).toBeGreaterThan(0);
      expect(nvidiaTitles('cat')).toHaveLength(nvidiaTitles('bob').length);
      expect(nvidiaTitles('bob')[0]?.source).toBe('verge.example feed');
      expect(nvidiaTitles('ann')).toHaveLength(0);
      expect(nvidiaTitles('dan')).toHaveLength(0);
      // never in the public feed
      expect(m.feed.some((i) => /Nvidia/.test(i.title))).toBe(false);
      // a broken custom feed is logged and does not stop anyone
      expect(out.warnings.some((w) => w.includes('broken.example'))).toBe(true);
      expect(out.users.every((u) => !u.error)).toBe(true);
    });

    it('refuses custom feeds that resolve to private addresses', async () => {
      const fetch = routedFetch({
        'evil.example': () => res(fixture('verge.xml')),
        'gol.test': () => res(fixture('gol.xml')),
        'other.test': () => res('', 500),
        'api.deepseek.com': () => res(reply(0)),
      });
      const m = memoryStore([
        user('bob', { niches: nvidia, customFeeds: [feedOf('e', 'evil.example')] }),
      ]);
      const out = await runForUsers(config, m.store, {
        env,
        fetch,
        now: NOW,
        resolve: async () => ['10.0.0.5'],
      });
      expect(fetch.calls.some((u) => u.includes('evil.example'))).toBe(false);
      expect(out.warnings.some((w) => w.includes('evil.example'))).toBe(true);
      expect((m.queue.get('bob') ?? []).some((i) => /Nvidia/.test(i.title))).toBe(false);
    });
  });
});
