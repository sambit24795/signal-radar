import { describe, expect, it, vi } from 'vitest';
import { searchAll } from '../src/search.js';
import {
  createYoutubeSearch,
  parseYoutubeSearch,
  parseYoutubeStats,
  quotaDay,
  withStats,
  YOUTUBE_CACHE_MAX,
  YOUTUBE_CACHE_MS,
  YOUTUBE_DAILY_BUDGET,
} from '../src/youtube.js';

const KEY = 'AIza-secret-test-key';
const NOW = new Date('2026-11-10T12:00:00Z');
const SINCE = new Date('2025-11-10T12:00:00Z');

const SEARCH = {
  items: [
    {
      id: { kind: 'youtube#video', videoId: 'vid1' },
      snippet: {
        title: 'Fall outfits &amp; layering',
        description: 'Five looks',
        channelTitle: 'Style Notes',
        publishedAt: '2026-11-07T10:00:00Z',
        thumbnails: { medium: { url: 'https://i.ytimg.com/vi/vid1/mqdefault.jpg' } },
      },
    },
    {
      id: { kind: 'youtube#channel', channelId: 'ch' },
      snippet: { title: 'not a video' },
    },
    {
      id: { videoId: 'vid2' },
      snippet: {
        title: 'Thrift haul',
        channelTitle: 'Second Hand',
        publishedAt: '2026-10-01T00:00:00Z',
      },
    },
  ],
};
const VIDEOS = {
  items: [
    { id: 'vid1', statistics: { viewCount: '120000', likeCount: '4000', commentCount: '90' } },
    { id: 'vid2', statistics: { viewCount: '500' } },
  ],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const quotaBody = { error: { code: 403, errors: [{ reason: 'quotaExceeded' }] } };

/** A fetch that answers the two API paths and records every URL. */
function api(over: { search?: () => Response; videos?: () => Response } = {}) {
  const calls: string[] = [];
  const fn = vi.fn(async (url: string) => {
    calls.push(url);
    const u = new URL(url);
    if (u.pathname.endsWith('/search')) return over.search?.() ?? json(SEARCH);
    if (u.pathname.endsWith('/videos')) return over.videos?.() ?? json(VIDEOS);
    throw new Error(`unexpected ${url}`);
  });
  return { fn, calls };
}

describe('YouTube parsing', () => {
  it('maps search hits to video items and drops non-videos', () => {
    const items = parseYoutubeSearch(SEARCH);
    expect(items.map((i) => i.videoId)).toEqual(['vid1', 'vid2']);
    expect(items[0]).toMatchObject({
      url: 'https://www.youtube.com/watch?v=vid1',
      title: 'Fall outfits &amp; layering',
      author: 'Style Notes',
      sourceName: 'Style Notes',
      publishedAt: '2026-11-07T10:00:00Z',
      media: { type: 'video', thumbnail: 'https://i.ytimg.com/vi/vid1/mqdefault.jpg' },
    });
    expect(items[1]!.media).toEqual({ type: 'video' });
  });

  it('reads view, like and comment counts, which arrive as strings', () => {
    const stats = parseYoutubeStats(VIDEOS);
    expect(stats.get('vid1')).toEqual({ views: 120000, likes: 4000, comments: 90 });
    expect(stats.get('vid2')).toEqual({ views: 500 });
  });

  it('survives junk', () => {
    expect(parseYoutubeSearch(null)).toEqual([]);
    expect(parseYoutubeSearch({ items: 'x' })).toEqual([]);
    expect(parseYoutubeStats({ items: [{ statistics: {} }, 5] }).size).toBe(0);
  });

  it('joins counts onto items without leaking the video id', () => {
    const [a, b] = withStats(parseYoutubeSearch(SEARCH), parseYoutubeStats(VIDEOS));
    expect(a).toMatchObject({ views: 120000, points: 4000, comments: 90 });
    expect(b).toMatchObject({ views: 500 });
    expect(a).not.toHaveProperty('videoId');
  });
});

describe('YouTube source choice', () => {
  it('with a key, calls search then videos with the documented parameters', async () => {
    const { fn, calls } = api();
    const yt = createYoutubeSearch(() => {});
    const items = await yt.search('Fall Outfits', fn, KEY, SINCE, NOW);
    expect(items).toHaveLength(2);
    expect(items![0]).toMatchObject({ views: 120000 });
    const s = new URL(calls[0]!);
    expect(s.origin + s.pathname).toBe('https://www.googleapis.com/youtube/v3/search');
    expect(Object.fromEntries(s.searchParams)).toEqual({
      part: 'snippet',
      type: 'video',
      q: 'Fall Outfits',
      maxResults: '15',
      order: 'relevance',
      publishedAfter: '2025-11-10T12:00:00Z',
      key: KEY,
    });
    const v = new URL(calls[1]!);
    expect(v.pathname).toBe('/youtube/v3/videos');
    expect(v.searchParams.get('part')).toBe('statistics');
    expect(v.searchParams.get('id')).toBe('vid1,vid2');
  });

  it('without a key is absent and never calls fetch', async () => {
    const { fn } = api();
    const log = vi.fn();
    const yt = createYoutubeSearch(log);
    expect(await yt.search('x', fn, undefined, SINCE, NOW)).toBeNull();
    expect(await yt.search('y', fn, undefined, SINCE, NOW)).toBeNull();
    expect(fn).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1); // one line, not one per search
    expect(log.mock.calls[0]![0]).toContain('no YOUTUBE_API_KEY');
  });

  it('keeps the videos when only the statistics call fails', async () => {
    const { fn } = api({ videos: () => new Response('', { status: 500 }) });
    const items = await createYoutubeSearch(() => {}).search('x', fn, KEY, SINCE, NOW);
    expect(items!.map((i) => i.title)).toHaveLength(2);
    expect(items![0]).not.toHaveProperty('views');
  });

  it('treats an API error as absent, with a log line that has no key in it', async () => {
    const { fn } = api({ search: () => new Response('nope', { status: 500 }) });
    const log = vi.fn();
    expect(await createYoutubeSearch(log).search('x', fn, KEY, SINCE, NOW)).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]![0]).not.toContain(KEY);
  });

  it('stays switched off after quotaExceeded until midnight Pacific', async () => {
    let quota = true;
    const { fn } = api({ search: () => (quota ? json(quotaBody, 403) : json(SEARCH)) });
    const log = vi.fn();
    const yt = createYoutubeSearch(log);
    expect(await yt.search('a', fn, KEY, SINCE, NOW)).toBeNull();
    expect(fn).toHaveBeenCalledTimes(1);
    quota = false; // the API would answer again, but we must not ask
    expect(await yt.search('b', fn, KEY, SINCE, new Date(NOW.getTime() + 3_600_000))).toBeNull();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]![0]).toContain('quota');

    // 2026-11-10 12:00Z is 04:00 Pacific; midnight Pacific is 08:00Z the next day.
    expect(quotaDay(NOW)).toBe('2026-11-10');
    const after = new Date('2026-11-11T08:01:00Z');
    expect(quotaDay(after)).toBe('2026-11-11');
    expect((await yt.search('c', fn, KEY, SINCE, after))!.length).toBe(2);
  });

  it('does not lock on an ordinary 403', async () => {
    const { fn } = api({
      search: () => json({ error: { errors: [{ reason: 'forbidden' }] } }, 403),
    });
    const yt = createYoutubeSearch(() => {});
    await yt.search('a', fn, KEY, SINCE, NOW);
    await yt.search('b', fn, KEY, SINCE, NOW);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('YouTube cache and budget', () => {
  it('serves a repeat search, however it is spelled, without calling fetch', async () => {
    const { fn } = api();
    const yt = createYoutubeSearch(() => {});
    const first = await yt.search('Fall  outfits', fn, KEY, SINCE, NOW);
    expect(fn).toHaveBeenCalledTimes(2);
    const later = new Date(NOW.getTime() + YOUTUBE_CACHE_MS - 1000);
    expect(await yt.search(' fall outfits ', fn, KEY, SINCE, later)).toEqual(first);
    expect(fn).toHaveBeenCalledTimes(2);
    // After an hour it asks again.
    await yt.search('fall outfits', fn, KEY, SINCE, new Date(NOW.getTime() + YOUTUBE_CACHE_MS + 1));
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('keeps at most 500 queries, dropping the least recently used', async () => {
    expect(YOUTUBE_CACHE_MAX).toBe(500);
    const { fn } = api({ search: () => json({ items: [] }) });
    const yt = createYoutubeSearch(() => {}, { cacheMax: 5, budget: 1e9 });
    for (let i = 0; i < 5; i++) await yt.search(`q${i}`, fn, KEY, SINCE, NOW);
    const calls = fn.mock.calls.length;
    await yt.search('q0', fn, KEY, SINCE, NOW); // hit, and now the most recent
    expect(fn.mock.calls.length).toBe(calls);
    await yt.search('extra', fn, KEY, SINCE, NOW); // evicts q1, not q0
    const before = fn.mock.calls.length;
    await yt.search('q0', fn, KEY, SINCE, NOW);
    expect(fn.mock.calls.length).toBe(before);
    await yt.search('q1', fn, KEY, SINCE, NOW);
    expect(fn.mock.calls.length).toBe(before + 1);
  });

  it('stops calling the API at the daily budget, then resumes the next Pacific day', async () => {
    const { fn } = api({ search: () => json({ items: [] }) });
    const log = vi.fn();
    const yt = createYoutubeSearch(log);
    // Empty results cost 100 each (no statistics call): 90 searches reach exactly 9,000.
    const allowed = YOUTUBE_DAILY_BUDGET / 100;
    for (let i = 0; i < allowed; i++) {
      expect(await yt.search(`budget ${i}`, fn, KEY, SINCE, NOW)).toEqual([]);
    }
    expect(fn).toHaveBeenCalledTimes(allowed);
    expect(await yt.search('one more', fn, KEY, SINCE, NOW)).toBeNull();
    expect(fn).toHaveBeenCalledTimes(allowed);
    expect(log.mock.calls.at(-1)![0]).toContain('budget');
    // A cached query still answers while the budget is spent.
    expect(await yt.search('budget 0', fn, KEY, SINCE, NOW)).toEqual([]);
    const tomorrow = new Date('2026-11-11T09:00:00Z');
    expect(await yt.search('one more', fn, KEY, SINCE, tomorrow)).toEqual([]);
  });

  it('counts the statistics call too', async () => {
    const { fn } = api();
    const yt = createYoutubeSearch(() => {});
    // 101 units per search with results: the 90th would pass 9,000.
    let answered = 0;
    for (let i = 0; i < 100; i++) {
      if ((await yt.search(`s${i}`, fn, KEY, SINCE, NOW)) !== null) answered++;
    }
    expect(answered).toBe(89);
  });
});

describe('YouTube in searchAll', () => {
  const others = async (url: string) => {
    const host = new URL(url).hostname;
    if (host === 'www.googleapis.com') {
      return new Response(JSON.stringify(url.includes('/search') ? SEARCH : VIDEOS));
    }
    if (host === 'news.google.com')
      return new Response('<rss version="2.0"><channel></channel></rss>');
    return new Response(JSON.stringify({ hits: [], items: [] }));
  };

  it('adds YouTube items with views, and lists it as answered, when a key is set', async () => {
    const { items, answered, failed } = await searchAll('fall outfits', {
      fetch: others,
      env: { YOUTUBE_API_KEY: KEY },
      sources: ['youtube'],
      now: new Date('2026-11-10T12:00:00Z'),
    });
    expect(failed).toEqual([]);
    expect(answered).toEqual(['youtube']);
    const v = items.find((i) => i.url.endsWith('vid1'))!;
    expect(v).toMatchObject({
      source: 'Style Notes',
      sourceKind: 'youtube',
      title: 'Fall outfits & layering',
      media: { type: 'video' },
      momentum: { views: 120000, points: 4000, comments: 90 },
    });
    expect(v.momentum.perHour).toBeGreaterThan(0);
    // The key is used to call the API and goes nowhere else.
    expect(JSON.stringify({ items, answered, failed })).not.toContain(KEY);
  });

  it('leaves YouTube out of answered, silently, when there is no key', async () => {
    const fetchFn = vi.fn(others);
    const { answered, failed } = await searchAll('fall outfits', {
      fetch: fetchFn,
      env: {},
      sources: ['news', 'youtube'],
    });
    expect(answered).toEqual(['news']);
    expect(failed).toEqual([]);
    expect(fetchFn.mock.calls.every(([u]) => !String(u).includes('googleapis'))).toBe(true);
  });
});
