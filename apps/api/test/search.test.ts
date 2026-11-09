import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLimiter } from '../src/routes/search.js';
import { dbAvailable, setup } from './helpers.js';

let calls = 0;
const netFetch = async (url: string) => {
  calls++;
  const host = new URL(url).hostname;
  if (host === 'hn.algolia.com') {
    return new Response(
      JSON.stringify({
        hits: [
          {
            objectID: '1',
            title: 'Rust news',
            url: 'https://ex.com/a',
            points: 10,
            created_at_i: 1_700_000_000,
          },
        ],
      }),
    );
  }
  return new Response('', { status: 500 });
};

describe('createLimiter', () => {
  it('allows the budget, refuses beyond it, and refills over time', () => {
    let t = 0;
    const allow = createLimiter(3, () => t);
    expect([allow('a'), allow('a'), allow('a'), allow('a')]).toEqual([true, true, true, false]);
    expect(allow('b')).toBe(true);
    t = 21_000;
    expect(allow('a')).toBe(true);
  });
});

describe.skipIf(!dbAvailable)('search (GET /api/search)', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => {
    ctx = await setup({}, { fetch: netFetch });
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('is public, survives failing sources, caches repeats and validates q', async () => {
    const res = await ctx.app.request('/api/search?q=rust');
    const body = (await res.json()) as {
      items: { title: string }[];
      failed: string[];
      cached: boolean;
    };
    expect(res.status).toBe(200);
    expect(body.items.map((i) => i.title)).toContain('Rust news');
    expect(body.failed).toEqual(expect.arrayContaining(['news', 'github']));
    expect(body.cached).toBe(false);
    const before = calls;
    const again = (await (await ctx.app.request('/api/search?q=RUST')).json()) as {
      cached: boolean;
    };
    expect(again.cached).toBe(true);
    expect(calls).toBe(before);
    expect((await ctx.app.request('/api/search?q=a')).status).toBe(400);
    expect((await ctx.app.request('/api/search')).status).toBe(400);
  });

  it('rate limits one IP to 30 a minute (429)', async () => {
    const hit = (n: number) =>
      ctx.app.request(`/api/search?q=topic${n}`, { headers: { 'x-forwarded-for': '9.9.9.9' } });
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) statuses.push((await hit(i)).status);
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
  });
});
