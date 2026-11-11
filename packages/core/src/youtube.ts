import type { FetchFn } from './http.js';
import type { RawItem } from './schema.js';

/**
 * YouTube Data API v3 search. The free tier is 10,000 units a day for everyone: a search costs 100
 * and the statistics call 1, so this keeps a cache, a daily budget and a quota lock to stay under it.
 * RSSHub has no YouTube search route, so when the API cannot answer, YouTube is simply absent.
 */

const API = 'https://www.googleapis.com/youtube/v3';
const SEARCH_COST = 100;
const VIDEOS_COST = 1;
/** Stop here, not at 10,000, so other uses of the same key keep a margin. */
export const YOUTUBE_DAILY_BUDGET = 9000;
export const YOUTUBE_CACHE_MS = 60 * 60 * 1000;
export const YOUTUBE_CACHE_MAX = 500;
const MAX_RESULTS = 15;

type Json = Record<string, unknown>;
const obj = (v: unknown): Json =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const count = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

interface Stats {
  views?: number;
  likes?: number;
  comments?: number;
}

/** `search` response to items without statistics. Entries without a video id are dropped. */
export function parseYoutubeSearch(json: unknown): (RawItem & { videoId: string })[] {
  const out: (RawItem & { videoId: string })[] = [];
  for (const it of (obj(json)['items'] as unknown[] | undefined) ?? []) {
    const row = obj(it);
    const videoId = str(obj(row['id'])['videoId']);
    const sn = obj(row['snippet']);
    const title = str(sn['title']);
    if (!videoId || !title) continue;
    const thumbs = obj(sn['thumbnails']);
    const thumb = str(obj(thumbs['medium'])['url']) ?? str(obj(thumbs['default'])['url']);
    const channel = str(sn['channelTitle']);
    out.push({
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title,
      snippet: str(sn['description']) ?? '',
      ...(channel ? { author: channel, sourceName: channel } : {}),
      ...(str(sn['publishedAt']) ? { publishedAt: str(sn['publishedAt'])! } : {}),
      media: { type: 'video', ...(thumb ? { thumbnail: thumb } : {}) },
    });
  }
  return out;
}

/** `videos?part=statistics` response to a map of video id to counts. */
export function parseYoutubeStats(json: unknown): Map<string, Stats> {
  const out = new Map<string, Stats>();
  for (const it of (obj(json)['items'] as unknown[] | undefined) ?? []) {
    const row = obj(it);
    const id = str(row['id']);
    if (!id) continue;
    const st = obj(row['statistics']);
    const views = count(st['viewCount']);
    const likes = count(st['likeCount']);
    const comments = count(st['commentCount']);
    out.set(id, {
      ...(views !== undefined ? { views } : {}),
      ...(likes !== undefined ? { likes } : {}),
      ...(comments !== undefined ? { comments } : {}),
    });
  }
  return out;
}

/** Joins counts onto the parsed videos: likes act as points, views drive "rising". */
export function withStats(
  items: (RawItem & { videoId: string })[],
  stats: Map<string, Stats>,
): RawItem[] {
  return items.map(({ videoId, ...raw }) => {
    const s = stats.get(videoId);
    return {
      ...raw,
      ...(s?.views !== undefined ? { views: s.views } : {}),
      ...(s?.likes !== undefined ? { points: s.likes } : {}),
      ...(s?.comments !== undefined ? { comments: s.comments } : {}),
    };
  });
}

const PACIFIC = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' });
/** The quota resets at midnight Pacific; this is the Pacific calendar day, so a new value means a reset. */
export const quotaDay = (now: Date): string => PACIFIC.format(now);

const normalize = (q: string) => q.toLowerCase().normalize('NFKD').replace(/\s+/g, ' ').trim();

class QuotaError extends Error {}

export interface YoutubeSearch {
  /** Null when YouTube cannot answer right now (no key, budget or quota used up, or the API failed). */
  search(
    q: string,
    fetchFn: FetchFn,
    key: string | undefined,
    since: Date,
    now: Date,
  ): Promise<RawItem[] | null>;
}

/** One instance holds the cache, the day's unit count and the quota lock. */
export function createYoutubeSearch(
  log: (msg: string) => void = console.warn,
  limits: { cacheMax?: number; budget?: number } = {},
): YoutubeSearch {
  const cacheMax = limits.cacheMax ?? YOUTUBE_CACHE_MAX;
  const budget = limits.budget ?? YOUTUBE_DAILY_BUDGET;
  const cache = new Map<string, { at: number; items: RawItem[] }>();
  let day = '';
  let used = 0;
  let lockedDay = '';
  let lastReason = '';

  const skip = (reason: string): null => {
    // One line per change of reason, not one per search.
    if (reason !== lastReason)
      log(`youtube search skipped: ${reason}; no RSSHub search route exists`);
    lastReason = reason;
    return null;
  };

  async function call(
    fetchFn: FetchFn,
    path: string,
    params: Json,
    cost: number,
  ): Promise<unknown> {
    used += cost;
    const qs = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)] as [string, string]),
    );
    // Errors carry the status and reason only: the URL holds the key.
    const res = await fetchFn(`${API}/${path}?${qs.toString()}`, {
      headers: { accept: 'application/json' },
    });
    if (!res.ok) {
      let reason = '';
      try {
        const err = obj(obj(JSON.parse(await res.text()))['error']);
        reason = str(obj((err['errors'] as unknown[] | undefined)?.[0])['reason']) ?? '';
      } catch {
        /* not JSON */
      }
      if (res.status === 403 && /quotaExceeded|dailyLimitExceeded/.test(reason)) {
        throw new QuotaError(reason);
      }
      throw new Error(`HTTP ${res.status}${reason ? ` ${reason}` : ''}`);
    }
    return JSON.parse(await res.text()) as unknown;
  }

  return {
    async search(q, fetchFn, key, since, now) {
      if (!key) return skip('no YOUTUBE_API_KEY');
      const today = quotaDay(now);
      if (today !== day) {
        day = today;
        used = 0;
      }
      const cacheKey = normalize(q);
      const hit = cache.get(cacheKey);
      if (hit && now.getTime() - hit.at < YOUTUBE_CACHE_MS) {
        cache.delete(cacheKey);
        cache.set(cacheKey, hit); // most recently used last
        return hit.items;
      }
      if (lockedDay === today) return skip('quota exceeded until midnight Pacific');
      if (used + SEARCH_COST > budget) return skip('daily budget reached');

      let items: RawItem[];
      try {
        const found = parseYoutubeSearch(
          await call(
            fetchFn,
            'search',
            {
              part: 'snippet',
              type: 'video',
              q,
              maxResults: MAX_RESULTS,
              order: 'relevance',
              publishedAfter: since.toISOString().replace(/\.\d{3}Z$/, 'Z'),
              key,
            },
            SEARCH_COST,
          ),
        );
        let stats = new Map<string, Stats>();
        if (found.length > 0) {
          try {
            stats = parseYoutubeStats(
              await call(
                fetchFn,
                'videos',
                { part: 'statistics', id: found.map((f) => f.videoId).join(','), key },
                VIDEOS_COST,
              ),
            );
          } catch (e) {
            // The videos still show, just without counts.
            if (e instanceof QuotaError) lockedDay = today;
          }
        }
        items = withStats(found, stats);
      } catch (e) {
        if (e instanceof QuotaError) {
          lockedDay = today;
          return skip('quota exceeded until midnight Pacific');
        }
        return skip(`API error (${e instanceof Error ? e.message : 'unknown'})`);
      }

      lastReason = '';
      cache.delete(cacheKey);
      cache.set(cacheKey, { at: now.getTime(), items });
      while (cache.size > cacheMax) cache.delete(cache.keys().next().value!);
      return items;
    },
  };
}
