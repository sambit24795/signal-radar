import { dedupe } from './dedupe.js';
import { getJson, getText, type FetchFn } from './http.js';
import { normalizeItem } from './normalize.js';
import type { Item, RawItem, SourceKind } from './schema.js';
import { parseDevto } from './sources/devto.js';
import { parseGithub } from './sources/github.js';
import { parseHn } from './sources/hn.js';
import { parseFeed } from './sources/rss.js';
import { createYoutubeSearch } from './youtube.js';

/** Live sources the search can reach. YouTube only answers when YOUTUBE_API_KEY is set. */
export const SEARCH_SOURCES = ['hn', 'news', 'github', 'devto', 'youtube'] as const;
export type SearchSource = (typeof SEARCH_SOURCES)[number];

export const SEARCH_TIMEOUT_MS = 6000;
export const SEARCH_RESULT_LIMIT = 40;
/** Each source's own best hits, so one chatty source cannot crowd out the rest. */
const PER_SOURCE_LIMIT = 15;

export interface SearchOptions {
  fetch: FetchFn;
  now?: Date;
  /** Narrow the fan-out; default is every source. */
  sources?: readonly SearchSource[];
  env?: Record<string, string | undefined>;
}

export interface SearchResult {
  items: Item[];
  /** Sources that errored or timed out; the rest still answered. */
  failed: SearchSource[];
  /** Sources that returned an answer, even an empty one. A source that cannot run is in neither list. */
  answered: SearchSource[];
}

interface Searcher {
  name: string;
  kind: SourceKind;
  /** Null (or a promise of null) when the source cannot answer this query. */
  run(
    q: string,
    fetchFn: FetchFn,
    env: Record<string, string | undefined>,
    now: Date,
  ): Promise<RawItem[] | null> | null;
}

const enc = encodeURIComponent;

/** Search only reaches back this far: older hits are rarely what someone typing a topic wants. */
export const SEARCH_WINDOW_DAYS = 365;
const DAY_MS = 86_400_000;
const windowStart = (now: Date) => new Date(now.getTime() - SEARCH_WINDOW_DAYS * DAY_MS);

/** Google News titles end in " - Publisher"; split it off so the publisher becomes the source. */
export function parseGoogleNews(xml: string): RawItem[] {
  return parseFeed(xml, { mediaType: 'article' }).map((it) => {
    const m = /^(.*\S)\s+-\s+([^-]{2,60})$/.exec(it.title);
    return m
      ? { ...it, title: m[1]!, sourceName: m[2]!.trim(), snippet: '' }
      : { ...it, snippet: '' };
  });
}

// Shared across requests: it holds the cache, the daily unit count and the quota lock.
const youtube = createYoutubeSearch();

const SEARCHERS: Record<SearchSource, Searcher> = {
  hn: {
    name: 'Hacker News',
    kind: 'hn',
    run: async (q, f, _env, now) =>
      parseHn(
        await getJson(
          f,
          `https://hn.algolia.com/api/v1/search?query=${enc(q)}&tags=story&hitsPerPage=30` +
            `&numericFilters=${enc(`created_at_i>${Math.floor(windowStart(now).getTime() / 1000)}`)}`,
        ),
      ),
  },
  news: {
    name: 'News',
    kind: 'rss',
    run: async (q, f) =>
      parseGoogleNews(
        await getText(
          f,
          `https://news.google.com/rss/search?q=${enc(q)}&hl=en-US&gl=US&ceid=US:en`,
        ),
      ),
  },
  github: {
    name: 'GitHub',
    kind: 'github',
    // Best match among repos pushed in the window. Sorting by `updated` surfaces empty one-day repos.
    run: async (q, f, env, now) => {
      const since = windowStart(now).toISOString().slice(0, 10);
      const json = await getJson(
        f,
        `https://api.github.com/search/repositories?q=${enc(`${q} pushed:>${since}`)}&per_page=20`,
        {
          accept: 'application/vnd.github+json',
          ...(env['GITHUB_TOKEN'] ? { authorization: `Bearer ${env['GITHUB_TOKEN']}` } : {}),
        },
      );
      // Age a repo by its last push, not by the day it was created.
      const pushed = new Map(
        ((json as { items?: { html_url: string; pushed_at?: string }[] }).items ?? []).map((r) => [
          r.html_url,
          r.pushed_at,
        ]),
      );
      return parseGithub(json).map((r) => {
        const at = pushed.get(r.url);
        return at ? { ...r, publishedAt: at } : r;
      });
    },
  },
  devto: {
    name: 'DEV Community',
    kind: 'devto',
    // DEV only searches by tag, which needs a single word.
    run: (q, f) => {
      const tag = q.toLowerCase();
      if (!/^[a-z0-9]{2,40}$/.test(tag)) return null;
      return getJson(f, `https://dev.to/api/articles?tag=${enc(tag)}&per_page=20`).then(parseDevto);
    },
  },
  youtube: {
    name: 'YouTube',
    kind: 'youtube',
    // Data API only: the key stays on the server and the quota is shared by every user.
    run: (q, f, env, now) => youtube.search(q, f, env['YOUTUBE_API_KEY'], windowStart(now), now),
  },
};

const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

export function queryTokens(q: string): string[] {
  return [
    ...new Set(
      fold(q)
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 1),
    ),
  ];
}

/** Keyword relevance of an item to the query plus a small momentum boost. Higher is better. */
export function relevance(item: Item, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const title = fold(item.title);
  const rest = fold(`${item.snippet} ${item.tags.join(' ')}`);
  let hit = 0;
  for (const t of tokens) {
    if (title.includes(t)) hit += 3;
    else if (rest.includes(t)) hit += 1;
  }
  const momentum = item.momentum.points ?? item.momentum.stars ?? item.momentum.views ?? 0;
  return (hit / (tokens.length * 3)) * 10 + Math.log10(1 + momentum);
}

/** Weight 1 for something published now, 0.5 a month ago, 0.14 after six months. Undated counts as six months. */
export function recency(item: Pick<Item, 'publishedAt'>, now: Date): number {
  const t = item.publishedAt ? Date.parse(item.publishedAt) : NaN;
  const days = Number.isNaN(t) ? 180 : Math.max(0, (now.getTime() - t) / DAY_MS);
  return 1 / (1 + days / 30);
}

/** Merged order: relevance times recency, so a fresh news item beats a stale high-score one. */
export function rankResults(items: Item[], tokens: string[], now: Date): Item[] {
  const score = new Map<Item, number>();
  for (const it of items) score.set(it, relevance(it, tokens) * recency(it, now));
  return [...items].sort((a, b) => (score.get(b) ?? 0) - (score.get(a) ?? 0));
}

/** Search several live sources at once. A source that fails or times out is reported, not fatal. */
export async function searchAll(q: string, o: SearchOptions): Promise<SearchResult> {
  const now = o.now ?? new Date();
  const env = o.env ?? {};
  const names = o.sources?.length ? o.sources : SEARCH_SOURCES;
  const fetchFn: FetchFn = (url, init) =>
    o.fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(SEARCH_TIMEOUT_MS) });

  const failed: SearchSource[] = [];
  const answered: SearchSource[] = [];
  const settled = await Promise.all(
    names.map(async (name) => {
      const s = SEARCHERS[name];
      try {
        const raws = await s.run(q, fetchFn, env, now);
        if (!raws) return [];
        answered.push(name);
        return raws
          .slice(0, PER_SOURCE_LIMIT)
          .flatMap((r) => normalizeItem(r, { name: s.name, kind: s.kind }, now) ?? []);
      } catch {
        failed.push(name);
        return [];
      }
    }),
  );

  const tokens = queryTokens(q);
  const { items } = dedupe(rankResults(settled.flat(), tokens, now));
  return {
    items: items.slice(0, SEARCH_RESULT_LIMIT),
    failed,
    answered: names.filter((n) => answered.includes(n)),
  };
}
