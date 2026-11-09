import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@radar/db';
import { call, dbAvailable, setup, signUp, type Json } from './helpers.js';

const PARA =
  'The city council voted on Tuesday to approve a new bike lane network covering forty kilometres, funded by a transport levy that will run for six years. ';
const ARTICLE = `<html><head><title>Bike lanes approved</title></head><body><nav>Home About</nav>
<article><h1>Bike lanes approved</h1>${`<p>${PARA}</p>`.repeat(6)}</article></body></html>`;
const SHORT =
  '<html><head><title>Hi</title></head><body><article><p>Too short.</p></article></body></html>';

const REPLY = JSON.stringify({
  tldr: 'The council approved a 40 km bike lane network.',
  points: ['Funded by a six-year levy', 'Voted Tuesday', 'Covers forty kilometres'],
});

let pageFetches = 0;
let aiCalls = 0;
let aiBody = REPLY;
const netFetch = async (url: string): Promise<Response> => {
  const host = new URL(url).hostname;
  if (host === 'api.deepseek.com') {
    aiCalls++;
    return new Response(JSON.stringify({ choices: [{ message: { content: aiBody } }] }));
  }
  pageFetches++;
  if (host === 'article.example') return new Response(ARTICLE);
  if (host === 'short.example') return new Response(SHORT);
  if (host === 'gone.example') return new Response('', { status: 404 });
  if (host === 'down.example') return new Response('', { status: 503 });
  if (host === 'busy.example') return new Response('', { status: 429 });
  throw new Error(`unexpected fetch ${url}`);
};
const netResolve = async (host: string) =>
  host === 'private.example' ? ['10.0.0.1'] : ['93.184.216.34'];

describe.skipIf(!dbAvailable)('summarize (POST /api/summarize)', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => {
    ctx = await setup({}, { fetch: netFetch, resolve: netResolve });
  });
  afterAll(async () => {
    await ctx?.close();
  });
  beforeEach(async () => {
    await ctx.reset();
    vi.stubEnv('DEEPSEEK_API_KEY', 'sk-test');
    pageFetches = 0;
    aiCalls = 0;
    aiBody = REPLY;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const summarize = (u: Awaited<ReturnType<typeof signUp>> | undefined, url: string) =>
    call(ctx.app, '/api/summarize', { method: 'POST', ...(u ? { user: u } : {}), json: { url } });

  it('summarizes an article, then serves the cache without fetching or calling the model', async () => {
    const u = await signUp(ctx.app, 'a@example.com');
    const first = await summarize(u, 'https://article.example/post?utm_source=x');
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      url: 'https://article.example/post',
      status: 'ok',
      tldr: 'The council approved a 40 km bike lane network.',
      points: ['Funded by a six-year levy', 'Voted Tuesday', 'Covers forty kilometres'],
      cached: false,
    });
    expect([pageFetches, aiCalls]).toEqual([1, 1]);

    // the cache is shared: another user gets it without any new work
    const b = await signUp(ctx.app, 'b@example.com');
    const second = (await (await summarize(b, 'https://article.example/post')).json()) as Json;
    expect(second).toMatchObject({ status: 'ok', cached: true });
    expect([pageFetches, aiCalls]).toEqual([1, 1]);
  });

  it('returns and caches unreadable for short pages, 4xx pages and YouTube', async () => {
    const u = await signUp(ctx.app, 'a@example.com');
    for (const url of [
      'https://short.example/a',
      'https://gone.example/a',
      'https://www.youtube.com/watch?v=abc',
    ]) {
      const res = (await (await summarize(u, url)).json()) as Json;
      expect(res).toMatchObject({ status: 'unreadable', cached: false });
      expect(res.tldr).toBeUndefined();
      expect(((await (await summarize(u, url)).json()) as Json).cached).toBe(true);
    }
    expect(aiCalls).toBe(0);
    expect(pageFetches).toBe(2);
  });

  it('does not cache transient failures (429, 5xx, bad model reply)', async () => {
    const u = await signUp(ctx.app, 'a@example.com');
    expect((await summarize(u, 'https://down.example/a')).status).toBe(502);
    expect((await summarize(u, 'https://busy.example/a')).status).toBe(502);
    aiBody = 'not json';
    expect((await summarize(u, 'https://article.example/a')).status).toBe(502);
    expect(await ctx.db.select().from(schema.pageSummary)).toHaveLength(0);
  });

  it('rejects private, malformed and blocked URLs with 400', async () => {
    const u = await signUp(ctx.app, 'a@example.com');
    for (const url of [
      'http://127.0.0.1/x',
      'ftp://example.com/x',
      'nope',
      'https://private.example/x',
    ]) {
      expect((await summarize(u, url)).status).toBe(400);
    }
    expect(aiCalls).toBe(0);
  });

  it('caps new summaries at 100 per user per 24 h (429), cached hits still work', async () => {
    const u = await signUp(ctx.app, 'a@example.com');
    await ctx.db.insert(schema.pageSummary).values(
      Array.from({ length: 100 }, (_, i) => ({
        url: `https://old.example/${i}`,
        status: 'unreadable' as const,
        model: 'm',
        requestedBy: u.id,
      })),
    );
    expect((await summarize(u, 'https://article.example/new')).status).toBe(429);
    expect(((await (await summarize(u, 'https://old.example/1')).json()) as Json).cached).toBe(
      true,
    );
    // rows older than 24 h fall out of the window
    await ctx.db
      .update(schema.pageSummary)
      .set({ createdAt: new Date(Date.now() - 25 * 3600 * 1000) })
      .where(eq(schema.pageSummary.requestedBy, u.id));
    expect((await summarize(u, 'https://article.example/new')).status).toBe(200);
  });

  it('503s when no model is configured', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', '');
    const u = await signUp(ctx.app, 'a@example.com');
    expect((await summarize(u, 'https://article.example/a')).status).toBe(503);
  });

  it('requires sign-in (401) and Pro (402)', async () => {
    expect((await summarize(undefined, 'https://article.example/a')).status).toBe(401);
    const u = await signUp(ctx.app, 'a@example.com');
    await ctx.db
      .update(schema.subscription)
      .set({ trialEndsAt: new Date(Date.now() - 1000) })
      .where(eq(schema.subscription.userId, u.id));
    expect((await summarize(u, 'https://article.example/a')).status).toBe(402);
  });
});
