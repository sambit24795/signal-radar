import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { customFeedId } from '@radar/core';
import { schema } from '@radar/db';
import radarConfig from '../../../radar.config.js';
import { call, dbAvailable, setup, sign, signUp, type Json } from './helpers.js';

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>Space Weekly</title>
<item><title>Artemis slips</title><link>https://space.example/a</link></item>
<item><title>Starship flight 12</title><link>https://space.example/b</link></item>
<item><title>Comet spotted</title><link>https://space.example/c</link></item>
<item><title>Fourth story</title><link>https://space.example/d</link></item></channel></rss>`;

const PAGE = `<html><head><title>Fallback title</title>
<meta property="og:title" content="Xenia &amp; friends: a deep dive">
<meta name="description" content="Plain description"><meta property="og:description" content="Why emulation matters"></head><body>hi</body></html>`;

const GNEWS = `<rss version="2.0"><channel><item><title>Paris week opens - Vogue</title>
<link>https://news.google.com/rss/articles/p1</link><pubDate>Sun, 08 Nov 2026 01:00:00 GMT</pubDate></item></channel></rss>`;

const REDDIT_HOT = `<feed><entry><category term="fashion" label="r/fashion"/><title>OOTD thread</title>
<link href="https://www.reddit.com/r/fashion/comments/1/x/"/><updated>2026-11-09T03:00:00+00:00</updated></entry></feed>`;

// When set, the fake model answers with this text; otherwise it fails with a 500.
let modelReply: string | null = null;
// The request body the fake model last received (holds the system prompt).
let modelRequest = '';
const netFetch = async (url: string, init?: RequestInit): Promise<Response> => {
  const host = new URL(url).hostname;
  if (host === 'page.example') return new Response(PAGE);
  if (host === 'api.deepseek.com') {
    modelRequest = typeof init?.body === 'string' ? init.body : '';
    return modelReply
      ? new Response(JSON.stringify({ choices: [{ message: { content: modelReply } }] }))
      : new Response('boom', { status: 500 });
  }
  if (host === 'space.example') return new Response(RSS);
  if (host === 'news.google.com') return new Response(GNEWS);
  if (host === 'www.reddit.com') {
    if (url.includes('/subreddits/search.rss')) {
      return url.includes('q=down')
        ? new Response('', { status: 429 })
        : new Response(
            '<feed><entry><link href="https://www.reddit.com/r/fashion/"/></entry><entry><link href="https://www.reddit.com/r/streetwear/"/></entry><entry><link href="https://www.reddit.com/r/third/"/></entry></feed>',
          );
    }
    return new Response(REDDIT_HOT);
  }
  if (host === 'redir.example') {
    return new Response('', { status: 302, headers: { location: 'http://169.254.169.254/' } });
  }
  if (host === 'html.example') return new Response('<html><body>hi</body></html>');
  if (host === 'down.example') return new Response('', { status: 503 });
  throw new Error(`unexpected fetch ${url}`);
};
const netResolve = async (host: string) =>
  host === 'private.example' ? ['10.0.0.1'] : ['93.184.216.34'];

type Ctx = Awaited<ReturnType<typeof setup>>;

describe.skipIf(!dbAvailable)('api', () => {
  let ctx: Ctx;
  beforeAll(async () => {
    ctx = await setup({}, { fetch: netFetch, resolve: netResolve });
  });
  afterAll(async () => {
    await ctx?.close();
  });
  beforeEach(async () => {
    modelReply = null;
    await ctx.reset();
  });

  const expireTrial = (userId: string) =>
    ctx.db
      .update(schema.subscription)
      .set({ trialEndsAt: new Date(Date.now() - 1000) })
      .where(eq(schema.subscription.userId, userId));
  const proOf = async (app: TestApp, u: Awaited<ReturnType<typeof signUp>>) =>
    (((await (await call(app, '/api/me', { user: u })).json()) as Json).subscription as Json)
      .isPro as boolean;
  // A route that stays Pro-only (requirePro runs before the body is read).
  const feedsCheck = (app: TestApp, u: Awaited<ReturnType<typeof signUp>>) =>
    call(app, '/api/me/feeds/check', {
      method: 'POST',
      user: u,
      json: { url: 'https://a.example/rss' },
    });

  const seedQueue = async (userId: string, n = 1, prefix = 'a') => {
    const rows = Array.from({ length: n }, (_, i) => ({
      userId,
      url: `https://example.com/${prefix}${i}`,
      title: `Item ${prefix}${i}`,
      source: 'hn',
      score: i,
    }));
    return ctx.db.insert(schema.queueItem).values(rows).returning();
  };

  describe('basics', () => {
    it('serves /healthz and JSON 404s', async () => {
      const ok = await call(ctx.app, '/healthz');
      expect(await ok.json()).toEqual({ ok: true });
      const missing = await call(ctx.app, '/nope');
      expect(missing.status).toBe(404);
      expect(await missing.json()).toEqual({ error: 'not found' });
    });

    it('sends CORS headers for WEB_ORIGIN with credentials', async () => {
      const res = await ctx.app.request('/api/feed', {
        method: 'OPTIONS',
        headers: {
          origin: 'http://localhost:3000',
          'access-control-request-method': 'GET',
        },
      });
      expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
      expect(res.headers.get('access-control-allow-credentials')).toBe('true');
    });
  });

  describe('sign-up', () => {
    it('creates a config with the default niches and a 7-day Pro trial', async () => {
      const u = await signUp(ctx.app, 'ann@example.com');
      const [cfg] = await ctx.db
        .select()
        .from(schema.userConfig)
        .where(eq(schema.userConfig.userId, u.id));
      expect(cfg?.niches).toEqual(radarConfig.niches);
      expect(cfg?.topN).toBe(10);
      const [sub] = await ctx.db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.userId, u.id));
      expect(sub).toMatchObject({ plan: 'pro', status: 'trialing', provider: 'stub' });
      const days = (sub!.trialEndsAt!.getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(6.99);
      expect(days).toBeLessThan(7.01);
    });

    it('GET /api/me returns the user and plan', async () => {
      const u = await signUp(ctx.app, 'ann@example.com');
      const res = await call(ctx.app, '/api/me', { user: u });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Json;
      expect(body.user.email).toBe('ann@example.com');
      expect(body.subscription).toMatchObject({ plan: 'pro', status: 'trialing', isPro: true });
      expect(body.subscription.trialEndsAt).toBeTruthy();
    });
  });

  describe('auth required', () => {
    it.each([
      ['GET', '/api/me'],
      ['GET', '/api/me/config'],
      ['PUT', '/api/me/config'],
      ['GET', '/api/queue'],
      ['POST', '/api/queue/00000000-0000-4000-8000-000000000000/pick'],
      ['POST', '/api/push/subscribe'],
      ['DELETE', '/api/push/subscribe'],
      ['POST', '/api/dev/upgrade'],
      ['POST', '/api/billing/checkout'],
      ['POST', '/api/billing/cancel'],
    ])('%s %s -> 401 without a session', async (method, path) => {
      const res = await call(ctx.app, path, { method, json: method === 'GET' ? undefined : {} });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'authentication required' });
    });

    it('signs in with email and password', async () => {
      await signUp(ctx.app, 'ann@example.com');
      const res = await call(ctx.app, '/api/auth/sign-in/email', {
        method: 'POST',
        json: { email: 'ann@example.com', password: 'correct-horse-battery' },
      });
      expect(res.status).toBe(200);
      const bad = await call(ctx.app, '/api/auth/sign-in/email', {
        method: 'POST',
        json: { email: 'ann@example.com', password: 'wrong-password-123' },
      });
      expect(bad.status).toBe(401);
    });
  });

  describe('config', () => {
    it('round-trips PUT then GET and validates input', async () => {
      const u = await signUp(ctx.app, 'ann@example.com');
      const cfg = {
        niches: [{ id: 'ai', name: 'AI', keywords: ['llm', { term: 'agent', weight: 2 }] }],
        sources: ['hn', 'reddit'],
        topN: 5,
        telegramChatId: '123',
        notion: { token: 'secret_x', dbId: 'db1' },
      };
      const put = await call(ctx.app, '/api/me/config', { method: 'PUT', user: u, json: cfg });
      expect(put.status).toBe(200);
      const got = (await (await call(ctx.app, '/api/me/config', { user: u })).json()) as Json;
      expect(got.config).toMatchObject({
        sources: ['hn', 'reddit'],
        topN: 5,
        telegramChatId: '123',
      });
      expect(got.config.niches[0]).toMatchObject({ id: 'ai', weight: 1 });
      expect(got.config.notion).toEqual({ dbId: 'db1', hasToken: true });
      expect(JSON.stringify(got)).not.toContain('secret_x');
      expect(JSON.stringify(await put.json())).not.toContain('secret_x');

      const bad = await call(ctx.app, '/api/me/config', {
        method: 'PUT',
        user: u,
        json: { ...cfg, topN: 0 },
      });
      expect(bad.status).toBe(400);
      expect(((await bad.json()) as Json).error).toContain('topN');
    });

    it('round-trips the creator profile, keeps it when omitted and clears it with null', async () => {
      const u = await signUp(ctx.app, 'ann@example.com');
      const base = { niches: [], sources: [], topN: 5, telegramChatId: null, notion: null };
      const put = (json: unknown) =>
        call(ctx.app, '/api/me/config', { method: 'PUT', user: u, json });
      const creator = {
        makes: ['video', 'posts'],
        audience: '  junior web devs ',
        resources: 'a Mac, free tools only',
        tone: 'plain',
      };
      const saved = (await (await put({ ...base, creator })).json()) as Json;
      expect(saved.config.creator).toEqual({ ...creator, audience: 'junior web devs' });
      const got = (await (await call(ctx.app, '/api/me/config', { user: u })).json()) as Json;
      expect(got.config.creator.makes).toEqual(['video', 'posts']);
      await put(base);
      const kept = (await (await call(ctx.app, '/api/me/config', { user: u })).json()) as Json;
      expect(kept.config.creator.tone).toBe('plain');
      await put({ ...base, creator: null });
      const cleared = (await (await call(ctx.app, '/api/me/config', { user: u })).json()) as Json;
      expect(cleared.config.creator).toBeNull();
    });

    it('rejects an invalid creator profile with 400', async () => {
      const u = await signUp(ctx.app, 'ann@example.com');
      const base = { niches: [], sources: [], topN: 5, telegramChatId: null, notion: null };
      for (const creator of [
        { makes: ['tiktok'] },
        { makes: [], tone: 'angry' },
        { makes: [], audience: 'x'.repeat(81) },
        { makes: [], resources: 'x'.repeat(121) },
        { audience: 'no makes' },
      ]) {
        const res = await call(ctx.app, '/api/me/config', {
          method: 'PUT',
          user: u,
          json: { ...base, creator },
        });
        expect(res.status).toBe(400);
      }
    });

    it('stamps onboardedAt on the first save only', async () => {
      const u = await signUp(ctx.app, 'ann@example.com');
      const cfg = { niches: [], sources: [], topN: 5, telegramChatId: null, notion: null };
      const first = (await (await call(ctx.app, '/api/me/config', { user: u })).json()) as Json;
      expect(first.config.onboardedAt).toBeNull();
      const a = (await (
        await call(ctx.app, '/api/me/config', { method: 'PUT', user: u, json: cfg })
      ).json()) as Json;
      expect(a.config.onboardedAt).toBeTruthy();
      const b = (await (
        await call(ctx.app, '/api/me/config', { method: 'PUT', user: u, json: { ...cfg, topN: 6 } })
      ).json()) as Json;
      expect(b.config.onboardedAt).toBe(a.config.onboardedAt);
    });

    it('keeps the stored Notion token when none is sent, and requires one the first time', async () => {
      const u = await signUp(ctx.app, 'ann@example.com');
      const base = { niches: [], sources: [], topN: 5, telegramChatId: null };
      const first = await call(ctx.app, '/api/me/config', {
        method: 'PUT',
        user: u,
        json: { ...base, notion: { dbId: 'db1' } },
      });
      expect(first.status).toBe(400);
      await call(ctx.app, '/api/me/config', {
        method: 'PUT',
        user: u,
        json: { ...base, notion: { token: 'secret_x', dbId: 'db1' } },
      });
      const again = await call(ctx.app, '/api/me/config', {
        method: 'PUT',
        user: u,
        json: { ...base, notion: { dbId: 'db2' } },
      });
      expect(((await again.json()) as Json).config.notion).toEqual({ dbId: 'db2', hasToken: true });
      const [row] = await ctx.db
        .select()
        .from(schema.userConfig)
        .where(eq(schema.userConfig.userId, u.id));
      expect(row?.notion).toEqual({ token: 'secret_x', dbId: 'db2' });
      const cleared = await call(ctx.app, '/api/me/config', {
        method: 'PUT',
        user: u,
        json: { ...base, notion: null },
      });
      expect(((await cleared.json()) as Json).config.notion).toBeNull();
    });

    it('rejects non-JSON bodies with 400', async () => {
      const u = await signUp(ctx.app, 'ann@example.com');
      const res = await ctx.app.request('/api/me/config', {
        method: 'PUT',
        headers: { cookie: u.cookie, 'content-type': 'application/json' },
        body: '{nope',
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid JSON body' });
    });
  });

  describe('topic sources', () => {
    const fashion = {
      id: 'custom-1',
      name: 'Fashion',
      keywords: ['fashion'],
      sources: [
        { type: 'news', query: 'Fashion' },
        { type: 'reddit', sub: 'fashion' },
      ],
    };
    const put = (u: Awaited<ReturnType<typeof signUp>>, niches: unknown[]) =>
      call(ctx.app, '/api/me/config', {
        method: 'PUT',
        user: u,
        json: { niches, sources: [], topN: 5, notion: null },
      });

    it('stores sources with the topic and returns them', async () => {
      const u = await signUp(ctx.app, 'ts1@example.com');
      expect((await put(u, [fashion])).status).toBe(200);
      const got = (await (await call(ctx.app, '/api/me/config', { user: u })).json()) as Json;
      expect(got.config.niches[0].sources).toEqual(fashion.sources);
      // Removing the topic removes its sources.
      await put(u, []);
      const gone = (await (await call(ctx.app, '/api/me/config', { user: u })).json()) as Json;
      expect(gone.config.niches).toEqual([]);
    });

    it('rejects sources that are not a news search or a subreddit name', async () => {
      const u = await signUp(ctx.app, 'ts2@example.com');
      for (const bad of [
        { type: 'rss', url: 'http://169.254.169.254/' },
        { type: 'reddit', sub: '../etc' },
        { type: 'news', query: '' },
      ]) {
        const res = await put(u, [{ ...fashion, sources: [bad] }]);
        expect(res.status).toBe(400);
      }
      const four = Array.from({ length: 4 }, (_, i) => ({ type: 'reddit', sub: `sub${i}x` }));
      expect((await put(u, [{ ...fashion, sources: four }])).status).toBe(400);
    });

    it('suggests up to two subreddits and says when Reddit would not answer', async () => {
      const ok = (await (
        await call(ctx.app, '/api/topics/sources', { method: 'POST', json: { name: 'Fashion' } })
      ).json()) as Json;
      expect(ok).toEqual({
        reddit: [
          { type: 'reddit', sub: 'fashion' },
          { type: 'reddit', sub: 'streetwear' },
        ],
        available: true,
      });
      expect(
        (await call(ctx.app, '/api/topics/sources', { method: 'POST', json: { name: '' } })).status,
      ).toBe(400);
    });

    it('serves live items per source and rejects a free-form source', async () => {
      const res = await call(ctx.app, '/api/topics/feed', {
        method: 'POST',
        json: { sources: fashion.sources },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Json;
      expect(body.failed).toEqual([]);
      const titles = body.results.flatMap((r: Json) => r.items.map((i: Json) => i.title)).sort();
      expect(titles).toEqual(['OOTD thread', 'Paris week opens']);
      const bad = await call(ctx.app, '/api/topics/feed', {
        method: 'POST',
        json: { sources: [{ type: 'rss', url: 'http://localhost/' }] },
      });
      expect(bad.status).toBe(400);
    });
  });

  describe('custom feeds', () => {
    const feedId = (url: string) => customFeedId(url);
    const baseCfg = { niches: [], sources: [], topN: 5, telegramChatId: null, notion: null };
    const put = (u: Awaited<ReturnType<typeof signUp>>, customFeeds?: unknown) =>
      call(ctx.app, '/api/me/config', {
        method: 'PUT',
        user: u,
        json: customFeeds === undefined ? baseCfg : { ...baseCfg, customFeeds },
      });
    const check = (u: Awaited<ReturnType<typeof signUp>> | undefined, url: string) =>
      call(ctx.app, '/api/me/feeds/check', {
        method: 'POST',
        ...(u ? { user: u } : {}),
        json: { url },
      });

    it('check returns title, count and a 3-title sample', async () => {
      const u = await signUp(ctx.app, 'ann@example.com');
      const res = await check(u, 'https://space.example/rss');
      expect(res.status).toBe(200);
      const body = (await res.json()) as Json;
      expect(body).toMatchObject({
        id: feedId('https://space.example/rss'),
        url: 'https://space.example/rss',
        title: 'Space Weekly',
        itemCount: 4,
        sample: ['Artemis slips', 'Starship flight 12', 'Comet spotted'],
      });
    });

    it('check prepends https:// to a bare host', async () => {
      const u = await signUp(ctx.app, 'ann@example.com');
      const body = (await (await check(u, 'space.example/rss')).json()) as Json;
      expect(body.url).toBe('https://space.example/rss');
    });

    it('check needs auth and Pro', async () => {
      expect((await check(undefined, 'https://space.example/rss')).status).toBe(401);
      const u = await signUp(ctx.app, 'ann@example.com');
      await ctx.db
        .update(schema.subscription)
        .set({ status: 'none', trialEndsAt: null })
        .where(eq(schema.subscription.userId, u.id));
      expect((await check(u, 'https://space.example/rss')).status).toBe(402);
    });

    it('check rejects unsafe or unreadable URLs with a clear 400', async () => {
      const u = await signUp(ctx.app, 'ann@example.com');
      for (const url of [
        'ftp://space.example/rss',
        'http://127.0.0.1/rss',
        'http://169.254.169.254/latest',
        'http://[::1]/rss',
        'https://private.example/rss',
        'https://redir.example/rss',
        'https://html.example/page',
        'https://down.example/rss',
      ]) {
        const res = await check(u, url);
        expect(res.status, url).toBe(400);
        expect(((await res.json()) as Json).error, url).toBeTruthy();
      }
    });

    it('saves valid feeds and keeps them when customFeeds is omitted', async () => {
      const u = await signUp(ctx.app, 'ann@example.com');
      const url = 'https://space.example/rss';
      const feeds = [{ id: feedId(url), url, title: 'Space Weekly' }];
      const res = await put(u, feeds);
      expect(res.status).toBe(200);
      expect(((await res.json()) as Json).config.customFeeds).toEqual(feeds);
      const kept = (await (await put(u)).json()) as Json;
      expect(kept.config.customFeeds).toEqual(feeds);
      const cleared = (await (await put(u, [])).json()) as Json;
      expect(cleared.config.customFeeds).toEqual([]);
    });

    it('assigns the id when the client omits it', async () => {
      const u = await signUp(ctx.app, 'ann@example.com');
      const url = 'https://space.example/rss';
      const res = await put(u, [{ url, title: 'Space Weekly' }]);
      expect(res.status).toBe(200);
      expect(((await res.json()) as Json).config.customFeeds).toEqual([
        { id: feedId(url), url, title: 'Space Weekly' },
      ]);
    });

    it('validates url, id, duplicates and the max of 15', async () => {
      const u = await signUp(ctx.app, 'ann@example.com');
      const mk = (url: string) => ({ id: feedId(url), url, title: 't' });
      const many = Array.from({ length: 16 }, (_, i) => mk(`https://f${i}.example/rss`));
      const cases: [string, unknown][] = [
        ['url', [mk('http://10.0.0.1/rss')]],
        ['url', [mk('ftp://a.example/rss')]],
        ['url', [mk('not a url')]],
        ['id', [{ id: 'custom:deadbeef00', url: 'https://a.example/rss', title: 't' }]],
        ['duplicate', [mk('https://a.example/rss'), mk('https://a.example/rss')]],
        ['customFeeds', many],
        ['title', [{ ...mk('https://a.example/rss'), title: '' }]],
      ];
      for (const [needle, feeds] of cases) {
        const res = await put(u, feeds);
        expect(res.status, needle).toBe(400);
        expect(((await res.json()) as Json).error).toContain(needle);
      }
      expect((await put(u, many.slice(0, 15))).status).toBe(200);
    });

    it('402s saving feeds without Pro, but still allows clearing them', async () => {
      const u = await signUp(ctx.app, 'ann@example.com');
      await ctx.db
        .update(schema.subscription)
        .set({ status: 'none', trialEndsAt: null })
        .where(eq(schema.subscription.userId, u.id));
      const url = 'https://space.example/rss';
      expect((await put(u, [{ id: feedId(url), url, title: 'x' }])).status).toBe(402);
      expect((await put(u, [])).status).toBe(200);
    });
  });

  describe('queue', () => {
    it('lists only the owner rows (isolation)', async () => {
      const a = await signUp(ctx.app, 'a@example.com');
      const b = await signUp(ctx.app, 'b@example.com');
      await seedQueue(a.id, 2, 'a');
      await seedQueue(b.id, 1, 'b');
      const resA = (await (await call(ctx.app, '/api/queue', { user: a })).json()) as Json;
      const resB = (await (await call(ctx.app, '/api/queue', { user: b })).json()) as Json;
      expect(resA.items).toHaveLength(2);
      expect(resB.items).toHaveLength(1);
      expect(resB.items[0].url).toBe('https://example.com/b0');
    });

    it('returns summary, why and effort', async () => {
      const a = await signUp(ctx.app, 'a@example.com');
      await ctx.db.insert(schema.queueItem).values([
        {
          userId: a.id,
          url: 'https://example.com/x',
          title: 'X',
          source: 'hn',
          summary: 'S.',
          why: 'W',
          effort: 'M',
        },
        { userId: a.id, url: 'https://example.com/y', title: 'Y', source: 'hn' },
      ]);
      const res = (await (await call(ctx.app, '/api/queue', { user: a })).json()) as Json;
      const byTitle = Object.fromEntries(res.items.map((i: Json) => [i.title, i]));
      expect(byTitle.X).toMatchObject({ summary: 'S.', why: 'W', effort: 'M' });
      expect(byTitle.Y).toMatchObject({ summary: null, why: null, effort: null });
    });

    it("cannot pick, skip or reset another user's item", async () => {
      const a = await signUp(ctx.app, 'a@example.com');
      const b = await signUp(ctx.app, 'b@example.com');
      const [item] = await seedQueue(a.id);
      for (const action of ['pick', 'skip', 'reset']) {
        const res = await call(ctx.app, `/api/queue/${item!.id}/${action}`, {
          method: 'POST',
          user: b,
        });
        expect(res.status).toBe(404);
      }
      const [row] = await ctx.db
        .select()
        .from(schema.queueItem)
        .where(eq(schema.queueItem.id, item!.id));
      expect(row?.status).toBe('new');
    });

    it('picks, skips and resets with status filtering', async () => {
      const u = await signUp(ctx.app, 'a@example.com');
      const [one, two] = await seedQueue(u.id, 2);
      const pick = await call(ctx.app, `/api/queue/${one!.id}/pick`, { method: 'POST', user: u });
      expect(pick.status).toBe(200);
      const picked = ((await pick.json()) as Json).item;
      expect(picked.status).toBe('picked');
      expect(picked.decidedAt).toBeTruthy();
      await call(ctx.app, `/api/queue/${two!.id}/skip`, { method: 'POST', user: u });

      const list = async (status: string) =>
        ((await (await call(ctx.app, `/api/queue?status=${status}`, { user: u })).json()) as Json)
          .items;
      expect(await list('new')).toHaveLength(0);
      expect(await list('picked')).toHaveLength(1);
      expect(await list('skipped')).toHaveLength(1);

      const reset = await call(ctx.app, `/api/queue/${one!.id}/reset`, { method: 'POST', user: u });
      const back = ((await reset.json()) as Json).item;
      expect(back.status).toBe('new');
      expect(back.decidedAt).toBeNull();
      expect(await list('new')).toHaveLength(1);
    });

    it('404s on malformed ids and 400s on bad status or cursor', async () => {
      const u = await signUp(ctx.app, 'a@example.com');
      expect(
        (await call(ctx.app, '/api/queue/not-a-uuid/pick', { method: 'POST', user: u })).status,
      ).toBe(404);
      expect((await call(ctx.app, '/api/queue?status=bogus', { user: u })).status).toBe(400);
      expect((await call(ctx.app, '/api/queue?cursor=garbage', { user: u })).status).toBe(400);
    });

    it('paginates with a cursor without gaps or duplicates', async () => {
      const u = await signUp(ctx.app, 'a@example.com');
      // distinct created_at values so ordering spans several pages
      const rows = Array.from({ length: 45 }, (_, i) => ({
        userId: u.id,
        url: `https://example.com/p${i}`,
        title: `P${i}`,
        source: 'hn',
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
      }));
      await ctx.db.insert(schema.queueItem).values(rows);
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const url: string = `/api/queue${cursor ? `?cursor=${cursor}` : ''}`;
        const body = (await (await call(ctx.app, url, { user: u })).json()) as Json;
        seen.push(...body.items.map((i: Json) => i.url));
        cursor = body.nextCursor;
        pages++;
      } while (cursor);
      expect(pages).toBe(3);
      expect(seen).toHaveLength(45);
      expect(new Set(seen).size).toBe(45);
      expect(seen[0]).toBe('https://example.com/p44');
    });
  });

  describe('add to Ideas (POST /api/queue)', () => {
    const add = (u: Awaited<ReturnType<typeof signUp>> | undefined, json: unknown) =>
      call(ctx.app, '/api/queue', { method: 'POST', ...(u ? { user: u } : {}), json });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('adds with a title and no page fetch, into New', async () => {
      const u = await signUp(ctx.app, 'a@example.com');
      const res = await add(u, {
        url: 'https://example.com/post?utm_source=x',
        title: 'My find',
        snippet: 'A short note about the find.',
        source: 'Newsletter',
      });
      expect(res.status).toBe(201);
      const { item } = (await res.json()) as Json;
      expect(item).toMatchObject({
        url: 'https://example.com/post',
        title: 'My find',
        source: 'Newsletter',
        status: 'new',
        addedByUser: true,
        summary: 'A short note about the find.',
      });
      expect(item.decidedAt).toBeNull();
      const fresh = (await (
        await call(ctx.app, '/api/queue?status=new', { user: u })
      ).json()) as Json;
      expect(fresh.items).toHaveLength(1);
    });

    it('reads og:title and og:description when only a URL is given', async () => {
      const u = await signUp(ctx.app, 'a@example.com');
      const res = await add(u, { url: 'https://page.example/article' });
      expect(res.status).toBe(201);
      const { item } = (await res.json()) as Json;
      expect(item).toMatchObject({
        title: 'Xenia & friends: a deep dive',
        summary: 'Why emulation matters',
        source: 'Added by you',
        status: 'new',
      });
    });

    it('rejects private and malformed URLs with 400', async () => {
      const u = await signUp(ctx.app, 'a@example.com');
      for (const url of [
        'http://127.0.0.1/x',
        'http://localhost/x',
        'ftp://example.com/x',
        'nope',
      ]) {
        expect((await add(u, { url, title: 't' })).status).toBe(400);
      }
      // resolves to a private address: blocked by the pinned fetch, not the syntax check
      expect((await add(u, { url: 'https://private.example/x' })).status).toBe(400);
      expect(await ctx.db.select().from(schema.queueItem)).toHaveLength(0);
    });

    it('falls back to the snippet summary when the model fails', async () => {
      vi.stubEnv('DEEPSEEK_API_KEY', 'sk-test');
      const u = await signUp(ctx.app, 'a@example.com');
      const res = await add(u, {
        url: 'https://example.com/ai',
        title: 'AI path',
        snippet: 'Fallback text.',
      });
      expect(res.status).toBe(201);
      const { item } = (await res.json()) as Json;
      expect(item).toMatchObject({ summary: 'Fallback text.', effort: null, hook: null });
    });

    it('brings a skipped duplicate back to New and returns 200', async () => {
      const u = await signUp(ctx.app, 'a@example.com');
      const [row] = await seedQueue(u.id, 1, 'dup');
      await ctx.db
        .update(schema.queueItem)
        .set({ status: 'skipped' })
        .where(eq(schema.queueItem.id, row!.id));
      const res = await add(u, { url: row!.url, title: 'again' });
      expect(res.status).toBe(200);
      const { item } = (await res.json()) as Json;
      expect(item).toMatchObject({ id: row!.id, status: 'new', addedByUser: false });
      expect(await ctx.db.select().from(schema.queueItem)).toHaveLength(1);
    });

    it('leaves a picked duplicate where it is', async () => {
      const u = await signUp(ctx.app, 'a@example.com');
      const [row] = await seedQueue(u.id, 1, 'kept');
      await ctx.db
        .update(schema.queueItem)
        .set({ status: 'picked' })
        .where(eq(schema.queueItem.id, row!.id));
      const res = await add(u, { url: row!.url, title: 'again' });
      expect(res.status).toBe(200);
      expect(((await res.json()) as Json).item).toMatchObject({ id: row!.id, status: 'picked' });
    });

    it('caps adds at 30 per rolling 24 hours with 429', async () => {
      const u = await signUp(ctx.app, 'a@example.com');
      await ctx.db.insert(schema.queueItem).values(
        Array.from({ length: 30 }, (_, i) => ({
          userId: u.id,
          url: `https://example.com/cap${i}`,
          title: `cap ${i}`,
          source: 'Added by you',
          status: 'picked' as const,
          addedByUser: true,
        })),
      );
      const res = await add(u, { url: 'https://example.com/one-more', title: 'x' });
      expect(res.status).toBe(429);
      expect(((await res.json()) as Json).error).toMatch(/30 items a day/);
      // a duplicate is still fine, and adds older than 24h stop counting
      expect((await add(u, { url: 'https://example.com/cap0', title: 'x' })).status).toBe(200);
      await ctx.db
        .update(schema.queueItem)
        .set({ createdAt: new Date(Date.now() - 25 * 3600_000) });
      expect((await add(u, { url: 'https://example.com/one-more', title: 'x' })).status).toBe(201);
    });

    it('requires sign-in (401) but not Pro', async () => {
      expect((await add(undefined, { url: 'https://example.com/a', title: 't' })).status).toBe(401);
      const u = await signUp(ctx.app, 'a@example.com');
      await expireTrial(u.id);
      expect((await add(u, { url: 'https://example.com/a', title: 't' })).status).toBe(201);
    });

    it('caps free accounts at 10 adds a day and never calls the model', async () => {
      vi.stubEnv('DEEPSEEK_API_KEY', 'sk-test');
      const u = await signUp(ctx.app, 'a@example.com');
      await expireTrial(u.id);
      await ctx.db.insert(schema.queueItem).values(
        Array.from({ length: 10 }, (_, i) => ({
          userId: u.id,
          url: `https://example.com/free${i}`,
          title: `free ${i}`,
          source: 'Added by you',
          status: 'picked' as const,
          addedByUser: true,
        })),
      );
      const res = await add(u, { url: 'https://example.com/one-more', title: 'x' });
      expect(res.status).toBe(429);
      expect(((await res.json()) as Json).error).toMatch(/10 items a day.*Pro raises that to 30/);
      // duplicates are still fine, Pro keeps its higher cap
      expect((await add(u, { url: 'https://example.com/free0', title: 'x' })).status).toBe(200);
      await ctx.db
        .update(schema.subscription)
        .set({ status: 'active' })
        .where(eq(schema.subscription.userId, u.id));
      expect((await add(u, { url: 'https://example.com/one-more', title: 'x' })).status).toBe(201);
    });
  });

  describe('write a brief (POST /api/queue/:id/brief)', () => {
    const brief = (u: Awaited<ReturnType<typeof signUp>> | undefined, id: string) =>
      call(ctx.app, `/api/queue/${id}/brief`, { method: 'POST', ...(u ? { user: u } : {}) });
    const reply = JSON.stringify({
      score: 77,
      why: 'Fits your niche.',
      summary: 'A tight summary of the piece.',
      hook: 'The one line that opens the video',
      angle: 'Why this matters now',
      title: 'A draft title',
      format: 'short',
      effort: 'S',
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('returns 402 for a free account and leaves the row alone', async () => {
      vi.stubEnv('DEEPSEEK_API_KEY', 'sk-test');
      modelReply = reply;
      const u = await signUp(ctx.app, 'a@example.com');
      const [row] = await seedQueue(u.id);
      await expireTrial(u.id);
      const res = await brief(u, row!.id);
      expect(res.status).toBe(402);
      expect(((await res.json()) as Json).error).toMatch(/pro/i);
      const [after] = await ctx.db.select().from(schema.queueItem);
      expect(after!.hook).toBeNull();
    });

    it("returns 404 for another user's item and for a bad id", async () => {
      vi.stubEnv('DEEPSEEK_API_KEY', 'sk-test');
      modelReply = reply;
      const a = await signUp(ctx.app, 'a@example.com');
      const b = await signUp(ctx.app, 'b@example.com');
      const [row] = await seedQueue(a.id);
      expect((await brief(b, row!.id)).status).toBe(404);
      expect((await brief(b, 'nope')).status).toBe(404);
      expect((await brief(undefined, row!.id)).status).toBe(401);
    });

    it('fills the brief fields from the model', async () => {
      vi.stubEnv('DEEPSEEK_API_KEY', 'sk-test');
      modelReply = reply;
      const u = await signUp(ctx.app, 'a@example.com');
      const [row] = await seedQueue(u.id);
      const res = await brief(u, row!.id);
      expect(res.status).toBe(200);
      const { item } = (await res.json()) as Json;
      expect(item).toMatchObject({
        id: row!.id,
        hook: 'The one line that opens the video',
        angle: 'Why this matters now',
        titleDraft: 'A draft title',
        summary: 'A tight summary of the piece.',
        why: 'Fits your niche.',
        format: 'short',
        effort: 'S',
        score: 77,
        reasons: ['Fits your niche.'],
      });
      const [after] = await ctx.db.select().from(schema.queueItem);
      expect(after!.hook).toBe('The one line that opens the video');
    });

    it("puts the user's creator profile in the system prompt", async () => {
      vi.stubEnv('DEEPSEEK_API_KEY', 'sk-test');
      modelReply = reply;
      const u = await signUp(ctx.app, 'a@example.com');
      await ctx.db
        .update(schema.userConfig)
        .set({
          creator: {
            makes: ['podcast'],
            audience: 'indie game devs',
            resources: 'a Steam Deck and a Mac',
            tone: 'playful',
          },
        })
        .where(eq(schema.userConfig.userId, u.id));
      const [row] = await seedQueue(u.id);
      expect((await brief(u, row!.id)).status).toBe(200);
      const sent = JSON.parse(modelRequest) as { messages: { role: string; content: string }[] };
      const system = sent.messages.find((m) => m.role === 'system')!.content;
      expect(system).toContain('Podcast');
      expect(system).toContain('indie game devs');
      expect(system).toContain('a Steam Deck and a Mac');
      expect(system).toContain('playful');
    });

    it('returns 502 and leaves the row unchanged when the model fails', async () => {
      vi.stubEnv('DEEPSEEK_API_KEY', 'sk-test');
      const u = await signUp(ctx.app, 'a@example.com');
      const [row] = await seedQueue(u.id);
      const res = await brief(u, row!.id);
      expect(res.status).toBe(502);
      expect(((await res.json()) as Json).error).toBe('Could not write the brief. Try again.');
      const [after] = await ctx.db.select().from(schema.queueItem);
      expect(after).toEqual(row);
    });

    it('returns 503 when no model key is configured', async () => {
      vi.stubEnv('DEEPSEEK_API_KEY', '');
      const u = await signUp(ctx.app, 'a@example.com');
      const [row] = await seedQueue(u.id);
      const res = await brief(u, row!.id);
      expect(res.status).toBe(503);
    });
  });

  describe('Pro gate', () => {
    it('keeps the queue open to free accounts, but Pro routes return 402 once the trial has expired', async () => {
      const u = await signUp(ctx.app, 'a@example.com');
      expect(await proOf(ctx.app, u)).toBe(true);

      await expireTrial(u.id);
      expect((await call(ctx.app, '/api/queue', { user: u })).status).toBe(200);
      const gated = await feedsCheck(ctx.app, u);
      expect(gated.status).toBe(402);
      expect(((await gated.json()) as Json).error).toMatch(/pro/i);
      expect(await proOf(ctx.app, u)).toBe(false);

      await ctx.db
        .update(schema.subscription)
        .set({ status: 'active' })
        .where(eq(schema.subscription.userId, u.id));
      expect(await proOf(ctx.app, u)).toBe(true);
    });

    it('requires sign-in for the queue', async () => {
      expect((await call(ctx.app, '/api/queue')).status).toBe(401);
    });

    it('treats canceled, past_due and none as free', async () => {
      const u = await signUp(ctx.app, 'a@example.com');
      for (const status of ['canceled', 'past_due', 'none'] as const) {
        await ctx.db
          .update(schema.subscription)
          .set({ status })
          .where(eq(schema.subscription.userId, u.id));
        expect(await proOf(ctx.app, u)).toBe(false);
      }
    });

    it('counts active only while currentPeriodEnd is unset (legacy) or in the future', async () => {
      const u = await signUp(ctx.app, 'a@example.com');
      const setSub = (currentPeriodEnd: Date | null) =>
        ctx.db
          .update(schema.subscription)
          .set({ status: 'active', plan: 'pro', trialEndsAt: null, currentPeriodEnd })
          .where(eq(schema.subscription.userId, u.id));

      await setSub(null);
      expect(await proOf(ctx.app, u)).toBe(true);

      await setSub(new Date(Date.now() + 86_400_000));
      expect(await proOf(ctx.app, u)).toBe(true);

      await setSub(new Date(Date.now() - 1000));
      expect(await proOf(ctx.app, u)).toBe(false);
    });

    it('POST /api/dev/upgrade makes the caller pro/active outside production', async () => {
      const u = await signUp(ctx.app, 'a@example.com');
      await ctx.db
        .update(schema.subscription)
        .set({ status: 'none', plan: 'free', trialEndsAt: null })
        .where(eq(schema.subscription.userId, u.id));
      expect(await proOf(ctx.app, u)).toBe(false);
      const up = await call(ctx.app, '/api/dev/upgrade', { method: 'POST', user: u });
      expect(up.status).toBe(200);
      expect(await proOf(ctx.app, u)).toBe(true);
    });

    it('does not mount /api/dev/upgrade in production', async () => {
      const prod = await setup({ NODE_ENV: 'production' });
      try {
        const res = await call(prod.app, '/api/dev/upgrade', { method: 'POST' });
        expect(res.status).toBe(404);
      } finally {
        await prod.close();
      }
    });
  });

  describe('billing (stub)', () => {
    const subOf = async (id: string) =>
      (
        await ctx.db.select().from(schema.subscription).where(eq(schema.subscription.userId, id))
      )[0];

    it('checkout upgrades to pro/active and works in production', async () => {
      const prod = await setup({ NODE_ENV: 'production' });
      try {
        const u = await signUp(prod.app, 'a@example.com');
        await prod.db
          .update(schema.subscription)
          .set({ status: 'none', plan: 'free', trialEndsAt: null })
          .where(eq(schema.subscription.userId, u.id));
        expect(await proOf(prod.app, u)).toBe(false);
        const res = await call(prod.app, '/api/billing/checkout', { method: 'POST', user: u });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ url: null, upgraded: true });
        expect(await proOf(prod.app, u)).toBe(true);
      } finally {
        await prod.close();
      }
    });

    it('refuses the free stub checkout in production once Razorpay is set up', async () => {
      const prod = await setup({
        NODE_ENV: 'production',
        RAZORPAY_KEY_ID: 'rzp_test_x',
        RAZORPAY_KEY_SECRET: 'secret',
      });
      try {
        const u = await signUp(prod.app, 'b@example.com');
        const res = await call(prod.app, '/api/billing/checkout', { method: 'POST', user: u });
        expect(res.status).toBe(501);
      } finally {
        await prod.close();
      }
    });

    it('checkout returns 501 for the lemonsqueezy provider', async () => {
      const ls = await setup({ PAYMENTS_PROVIDER: 'lemonsqueezy' });
      try {
        const u = await signUp(ls.app, 'a@example.com');
        const res = await call(ls.app, '/api/billing/checkout', { method: 'POST', user: u });
        expect(res.status).toBe(501);
      } finally {
        await ls.close();
      }
    });

    it('cancel keeps access until currentPeriodEnd, then gates', async () => {
      const u = await signUp(ctx.app, 'a@example.com');
      await call(ctx.app, '/api/billing/checkout', { method: 'POST', user: u });
      const res = await call(ctx.app, '/api/billing/cancel', { method: 'POST', user: u });
      expect(res.status).toBe(200);
      expect(await subOf(u.id)).toMatchObject({ plan: 'pro', status: 'canceled' });
      const me = (await (await call(ctx.app, '/api/me', { user: u })).json()) as Json;
      expect(me.subscription).toMatchObject({ status: 'canceled', isPro: true });
      expect(await proOf(ctx.app, u)).toBe(true);

      await ctx.db
        .update(schema.subscription)
        .set({ currentPeriodEnd: new Date(Date.now() - 1000) })
        .where(eq(schema.subscription.userId, u.id));
      expect(await proOf(ctx.app, u)).toBe(false);
      const me2 = (await (await call(ctx.app, '/api/me', { user: u })).json()) as Json;
      expect(me2.subscription.isPro).toBe(false);
    });

    it('cancel 409s without an active subscription', async () => {
      const u = await signUp(ctx.app, 'a@example.com');
      const res = await call(ctx.app, '/api/billing/cancel', { method: 'POST', user: u });
      expect(res.status).toBe(409);
    });
  });

  describe('lemonsqueezy webhook', () => {
    const payload = (
      event: string,
      userId: string | undefined,
      attrs: Record<string, unknown> = {},
    ) =>
      JSON.stringify({
        meta: { event_name: event, custom_data: userId ? { user_id: userId } : {} },
        data: { id: '987', attributes: { status: 'active', customer_id: 555, ...attrs } },
      });
    const post = (body: string, signature?: string) =>
      ctx.app.request('/api/webhooks/lemonsqueezy', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(signature ? { 'x-signature': signature } : {}),
        },
        body,
      });

    it('rejects missing or wrong signatures', async () => {
      const u = await signUp(ctx.app, 'a@example.com');
      const body = payload('subscription_created', u.id);
      expect((await post(body)).status).toBe(401);
      expect((await post(body, 'deadbeef')).status).toBe(401);
      expect((await post(body, sign(body, 'another-secret'))).status).toBe(401);
      const [sub] = await ctx.db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.userId, u.id));
      expect(sub?.provider).toBe('stub');
    });

    it('upserts the subscription on subscription_created', async () => {
      const u = await signUp(ctx.app, 'a@example.com');
      const body = payload('subscription_created', u.id, { renews_at: '2030-01-01T00:00:00.000Z' });
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      const [sub] = await ctx.db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.userId, u.id));
      expect(sub).toMatchObject({
        plan: 'pro',
        status: 'active',
        provider: 'lemonsqueezy',
        providerCustomerId: '555',
        providerSubscriptionId: '987',
      });
      expect(sub?.currentPeriodEnd?.toISOString()).toBe('2030-01-01T00:00:00.000Z');
      expect(await ctx.db.select().from(schema.subscription)).toHaveLength(1);
    });

    it('creates a subscription row when none exists', async () => {
      const u = await signUp(ctx.app, 'a@example.com');
      await ctx.db.delete(schema.subscription).where(eq(schema.subscription.userId, u.id));
      const body = payload('subscription_updated', u.id, {
        status: 'on_trial',
        trial_ends_at: '2030-02-01T00:00:00Z',
      });
      expect((await post(body, sign(body))).status).toBe(200);
      const [sub] = await ctx.db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.userId, u.id));
      expect(sub).toMatchObject({ plan: 'pro', status: 'trialing' });
    });

    it('downgrades on cancelled and expired', async () => {
      const u = await signUp(ctx.app, 'a@example.com');
      for (const event of ['subscription_cancelled', 'subscription_expired']) {
        const body = payload(event, u.id, {
          status: event === 'subscription_cancelled' ? 'cancelled' : 'expired',
          ends_at: '2030-01-01T00:00:00Z',
        });
        expect((await post(body, sign(body))).status).toBe(200);
        const [sub] = await ctx.db
          .select()
          .from(schema.subscription)
          .where(eq(schema.subscription.userId, u.id));
        expect(sub).toMatchObject({ plan: 'free', status: 'canceled' });
      }
      expect(await proOf(ctx.app, u)).toBe(false);
    });

    it('400s without a user id, 404s for an unknown user, ignores other events', async () => {
      const noUser = payload('subscription_created', undefined);
      expect((await post(noUser, sign(noUser))).status).toBe(400);
      const ghost = payload('subscription_created', 'no-such-user');
      expect((await post(ghost, sign(ghost))).status).toBe(404);
      const other = payload('order_created', 'whoever');
      const res = await post(other, sign(other));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, ignored: true });
    });
  });

  describe('feed', () => {
    const feedRows = [
      {
        url: 'https://e.com/1',
        title: 'One',
        source: 'hn',
        sourceType: 'hn',
        publishedAt: new Date('2026-05-01'),
        keywordScore: 3,
        nicheIds: ['ai'],
      },
      {
        url: 'https://e.com/2',
        title: 'Two',
        source: 'r/x',
        sourceType: 'reddit',
        publishedAt: new Date('2026-05-03'),
        keywordScore: 1,
        nicheIds: ['gaming'],
      },
      {
        url: 'https://e.com/3',
        title: 'Three',
        source: 'hn',
        sourceType: 'hn',
        publishedAt: new Date('2026-05-02'),
        keywordScore: 9,
        nicheIds: ['ai', 'gaming'],
      },
    ];

    it('is public and returns newest first', async () => {
      await ctx.db.insert(schema.feedItem).values(feedRows);
      const res = await call(ctx.app, '/api/feed');
      expect(res.status).toBe(200);
      const body = (await res.json()) as Json;
      expect(body.items.map((i: Json) => i.title)).toEqual(['Two', 'Three', 'One']);
    });

    it('filters by niche and honours limit', async () => {
      await ctx.db.insert(schema.feedItem).values(feedRows);
      const ai = (await (await call(ctx.app, '/api/feed?niche=ai')).json()) as Json;
      expect(ai.items.map((i: Json) => i.title)).toEqual(['Three', 'One']);
      const one = (await (await call(ctx.app, '/api/feed?limit=1')).json()) as Json;
      expect(one.items).toHaveLength(1);
      expect((await call(ctx.app, '/api/feed?limit=0')).status).toBe(400);
    });

    it('allows up to 500 items and sets a 5 minute public cache header', async () => {
      const res = await call(ctx.app, '/api/feed?limit=500');
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('public, max-age=300');
      expect((await call(ctx.app, '/api/feed?limit=501')).status).toBe(400);
    });

    it('serves default sources from radar.config.ts and no niches', async () => {
      const res = await call(ctx.app, '/api/feed/defaults');
      expect(res.status).toBe(200);
      const body = (await res.json()) as Json;
      expect(body.niches).toEqual([]);
      expect(body.sources).toContainEqual({ id: 'hn', name: 'Hacker News', type: 'hn' });
      expect(body.sources).toContainEqual({ id: 'reddit', name: 'Reddit', type: 'reddit' });
      for (const s of body.sources) expect(Object.keys(s).sort()).toEqual(['id', 'name', 'type']);
    });
  });

  describe('push subscriptions', () => {
    const sub = { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'k1', auth: 'a1' } };

    it('subscribes (idempotently) and unsubscribes by endpoint', async () => {
      const u = await signUp(ctx.app, 'a@example.com');
      expect(
        (await call(ctx.app, '/api/push/subscribe', { method: 'POST', user: u, json: sub })).status,
      ).toBe(201);
      const again = { ...sub, keys: { p256dh: 'k2', auth: 'a2' } };
      expect(
        (await call(ctx.app, '/api/push/subscribe', { method: 'POST', user: u, json: again }))
          .status,
      ).toBe(201);
      const rows = await ctx.db.select().from(schema.pushSubscription);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.keys).toEqual({ p256dh: 'k2', auth: 'a2' });

      const del = await call(ctx.app, '/api/push/subscribe', {
        method: 'DELETE',
        user: u,
        json: { endpoint: sub.endpoint },
      });
      expect(del.status).toBe(200);
      expect(await ctx.db.select().from(schema.pushSubscription)).toHaveLength(0);
    });

    it("does not delete another user's subscription and validates the body", async () => {
      const a = await signUp(ctx.app, 'a@example.com');
      const b = await signUp(ctx.app, 'b@example.com');
      await call(ctx.app, '/api/push/subscribe', { method: 'POST', user: a, json: sub });
      await call(ctx.app, '/api/push/subscribe', {
        method: 'DELETE',
        user: b,
        json: { endpoint: sub.endpoint },
      });
      expect(await ctx.db.select().from(schema.pushSubscription)).toHaveLength(1);
      const bad = await call(ctx.app, '/api/push/subscribe', {
        method: 'POST',
        user: a,
        json: { endpoint: 'nope' },
      });
      expect(bad.status).toBe(400);
    });
  });

  it('cascades user deletion to every per-user table', async () => {
    const u = await signUp(ctx.app, 'a@example.com');
    await seedQueue(u.id);
    await ctx.db.insert(schema.seen).values({ userId: u.id, url: 'https://e.com/x' });
    await ctx.db.delete(schema.user).where(eq(schema.user.id, u.id));
    expect(await ctx.db.select().from(schema.queueItem)).toHaveLength(0);
    expect(await ctx.db.select().from(schema.seen)).toHaveLength(0);
    expect(await ctx.db.select().from(schema.subscription)).toHaveLength(0);
    expect(await ctx.db.select().from(schema.userConfig)).toHaveLength(0);
  });
});
