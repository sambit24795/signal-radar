import { mapLimit } from './concurrency.js';
import { getText, HttpError, type FetchFn } from './http.js';
import { normalizeItem } from './normalize.js';
import type { Item, RawItem, TopicSource } from './schema.js';
import { parseGoogleNews } from './search.js';
import { parseRedditRss } from './sources/reddit.js';
import {
  googleNewsUrl,
  pickSubreddits,
  redditHotUrl,
  redditSearchUrl,
  topicSourceKey,
} from './topicSources.js';

const FETCH_CONCURRENCY = 4;
const PER_SOURCE_ITEMS = 25;
/** Subreddits per request. Keyless Reddit allows about one request a minute, so they travel together (r/a+b+c). */
const SUBS_PER_REQUEST = 15;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Raw items from one news search. Throws on a network or HTTP failure. */
export async function fetchNewsSource(query: string, fetchFn: FetchFn): Promise<RawItem[]> {
  return parseGoogleNews(await getText(fetchFn, googleNewsUrl(query)));
}

/** Hot posts of several subreddits in one request, grouped by lower-cased subreddit. */
export async function fetchSubreddits(
  subs: readonly string[],
  fetchFn: FetchFn,
  retryOn429 = false,
): Promise<Map<string, RawItem[]>> {
  const url = redditHotUrl(subs, Math.min(100, 25 * subs.length));
  let xml: string;
  try {
    xml = await getText(fetchFn, url);
  } catch (e) {
    if (!retryOn429 || !(e instanceof HttpError) || e.status !== 429) throw e;
    await sleep(Math.min(e.retryAfterSec ?? 10, 40) * 1000);
    xml = await getText(fetchFn, url);
  }
  const out = new Map(subs.map((s) => [s.toLowerCase(), [] as RawItem[]]));
  for (const raw of parseRedditRss(xml, [...subs])) {
    const sub = /^r\/(.+)$/.exec(raw.sourceName ?? '')?.[1]?.toLowerCase();
    if (sub) out.get(sub)?.push(raw);
  }
  return out;
}

/** Normalized items of one topic source (news: publisher as source, reddit: r/sub). */
export function topicSourceItems(s: TopicSource, raws: RawItem[], now: Date): Item[] {
  const meta =
    s.type === 'news'
      ? { name: 'Google News', kind: 'rss' as const }
      : { name: `r/${s.sub}`, kind: 'reddit' as const };
  return raws.slice(0, PER_SOURCE_ITEMS).flatMap((r) => normalizeItem(r, meta, now) ?? []);
}

export interface TopicFetchResult {
  /** Items per source key. A source that failed is absent. */
  items: Map<string, Item[]>;
  failed: string[];
}

export interface TopicFetchOptions {
  warn?: (m: string) => void;
  /** Wait out one Reddit rate limit (batch runs); live requests give up instead. */
  retryOn429?: boolean;
}

/** Fetches each distinct source once. A failing source is reported, never fatal. */
export async function fetchTopicSources(
  sources: readonly TopicSource[],
  fetchFn: FetchFn,
  now: Date,
  opts: TopicFetchOptions = {},
): Promise<TopicFetchResult> {
  const warn = opts.warn ?? (() => {});
  const distinct = new Map<string, TopicSource>();
  for (const s of sources) distinct.set(topicSourceKey(s), s);
  const items = new Map<string, Item[]>();
  const failed: string[] = [];

  const news = [...distinct].filter(([, s]) => s.type === 'news');
  await mapLimit(news, FETCH_CONCURRENCY, async ([key, s]) => {
    try {
      const raws = await fetchNewsSource(
        (s as Extract<TopicSource, { type: 'news' }>).query,
        fetchFn,
      );
      items.set(key, topicSourceItems(s, raws, now));
    } catch (e) {
      failed.push(key);
      warn(`topic source ${key}: ${(e as Error).message}`);
    }
  });

  const subs = [...distinct.values()].flatMap((s) => (s.type === 'reddit' ? [s] : []));
  for (let i = 0; i < subs.length; i += SUBS_PER_REQUEST) {
    const chunk = subs.slice(i, i + SUBS_PER_REQUEST);
    try {
      const bySub = await fetchSubreddits(
        chunk.map((s) => s.sub),
        fetchFn,
        opts.retryOn429,
      );
      for (const s of chunk) {
        items.set(
          topicSourceKey(s),
          topicSourceItems(s, bySub.get(s.sub.toLowerCase()) ?? [], now),
        );
      }
    } catch (e) {
      for (const s of chunk) failed.push(topicSourceKey(s));
      warn(`topic sources reddit: ${(e as Error).message}`);
    }
  }
  return { items, failed };
}

/** Up to two subreddits matching a topic name, from Reddit's keyless subreddit search feed. */
export async function findSubreddits(name: string, fetchFn: FetchFn): Promise<TopicSource[]> {
  return pickSubreddits(await getText(fetchFn, redditSearchUrl(name)));
}
