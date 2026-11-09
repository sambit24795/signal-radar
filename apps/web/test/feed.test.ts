import { describe, expect, it } from 'vitest';
import { fetchDefaults, fetchFeed, rowToItem, type FeedRow, type FetchFn } from '../src/lib/feed';

const row = (over: Partial<FeedRow> = {}): FeedRow => ({
  url: 'https://e.com/a',
  title: 'Claude ships agents',
  source: 'Hacker News',
  sourceType: 'hn',
  publishedAt: '2026-11-09T05:00:00.000Z',
  fetchedAt: '2026-11-09T06:00:00.000Z',
  meta: {
    snippet: 'snip',
    author: 'pg',
    tags: ['ai'],
    momentum: { points: 120, comments: 30, perHour: 12.5 },
    media: { type: 'article' },
  },
  keywordScore: 20,
  nicheIds: ['ai'],
  ...over,
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('rowToItem', () => {
  it('maps a full row to a core Item', () => {
    expect(rowToItem(row())).toEqual({
      id: 'https://e.com/a',
      url: 'https://e.com/a',
      title: 'Claude ships agents',
      snippet: 'snip',
      source: 'Hacker News',
      sourceKind: 'hn',
      author: 'pg',
      publishedAt: '2026-11-09T05:00:00.000Z',
      momentum: { points: 120, comments: 30, perHour: 12.5 },
      tags: ['ai'],
      media: { type: 'article' },
    });
  });

  it('fills defaults for sparse meta and a missing date', () => {
    const item = rowToItem(row({ sourceType: 'github', publishedAt: null, meta: {} }))!;
    expect(item.snippet).toBe('');
    expect(item.tags).toEqual([]);
    expect(item.momentum).toEqual({ perHour: 0 });
    expect(item.media).toEqual({ type: 'repo' });
    expect(item).not.toHaveProperty('publishedAt');
    expect(item).not.toHaveProperty('author');
  });

  it('drops rows with an unknown source type or no title', () => {
    expect(rowToItem(row({ sourceType: 'tiktok' }))).toBeNull();
    expect(rowToItem(row({ title: '' }))).toBeNull();
  });
});

describe('fetchFeed', () => {
  it('requests the feed with the limit and returns mapped items plus the newest fetchedAt', async () => {
    const urls: string[] = [];
    const fetchFn: FetchFn = async (url) => {
      urls.push(url);
      return json({
        items: [
          row(),
          row({ url: 'https://e.com/b', fetchedAt: '2026-11-09T07:00:00.000Z' }),
          row({ url: 'https://e.com/c', sourceType: 'bogus' }),
        ],
      });
    };
    const feed = await fetchFeed(fetchFn, 200);
    expect(urls).toEqual(['/api/feed?limit=200']);
    expect(feed.items.map((i) => i.url)).toEqual(['https://e.com/a', 'https://e.com/b']);
    expect(feed.updatedAt).toBe('2026-11-09T07:00:00.000Z');
  });

  it('has a null updatedAt for an empty feed and throws on HTTP errors', async () => {
    expect(await fetchFeed(async () => json({ items: [] }))).toEqual({
      items: [],
      updatedAt: null,
    });
    await expect(fetchFeed(async () => json({ error: 'x' }, 500))).rejects.toThrow('500');
  });
});

describe('fetchDefaults', () => {
  it('returns the API payload', async () => {
    const payload = { niches: [], sources: [{ id: 'hn', name: 'Hacker News', type: 'hn' }] };
    const urls: string[] = [];
    const out = await fetchDefaults(async (url) => (urls.push(url), json(payload)));
    expect(urls).toEqual(['/api/feed/defaults']);
    expect(out).toEqual(payload);
  });
});
