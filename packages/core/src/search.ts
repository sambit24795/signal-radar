import { dedupe } from './dedupe.js';
import { getJson, getText, type FetchFn } from './http.js';
import { normalizeItem } from './normalize.js';
import type { Item, RawItem, SourceKind } from './schema.js';
import { parseDevto } from './sources/devto.js';
import { parseGithub } from './sources/github.js';
import { parseHn } from './sources/hn.js';
import { parseFeed } from './sources/rss.js';

/** Keyless live sources the search can reach. */
export const SEARCH_SOURCES = ['hn', 'news', 'github', 'devto'] as const;
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
}

interface Searcher {
  name: string;
  kind: SourceKind;
  /** Null when the source cannot answer this query. */
  run(
    q: string,
    fetchFn: FetchFn,
    env: Record<string, string | undefined>,
  ): Promise<RawItem[]> | null;
}

const enc = encodeURIComponent;

/** Google News titles end in " - Publisher"; split it off so the publisher becomes the source. */
export function parseGoogleNews(xml: string): RawItem[] {
  return parseFeed(xml, { mediaType: 'article' }).map((it) => {
    const m = /^(.*\S)\s+-\s+([^-]{2,60})$/.exec(it.title);
    return m
      ? { ...it, title: m[1]!, sourceName: m[2]!.trim(), snippet: '' }
      : { ...it, snippet: '' };
  });
}

const SEARCHERS: Record<SearchSource, Searcher> = {
  hn: {
    name: 'Hacker News',
    kind: 'hn',
    run: async (q, f) =>
      parseHn(
        await getJson(
          f,
          `https://hn.algolia.com/api/v1/search?query=${enc(q)}&tags=story&hitsPerPage=30`,
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
    run: async (q, f, env) =>
      parseGithub(
        await getJson(
          f,
          `https://api.github.com/search/repositories?q=${enc(q)}&sort=stars&per_page=20`,
          {
            accept: 'application/vnd.github+json',
            ...(env['GITHUB_TOKEN'] ? { authorization: `Bearer ${env['GITHUB_TOKEN']}` } : {}),
          },
        ),
      ),
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
  const momentum = item.momentum.points ?? item.momentum.stars ?? 0;
  return (hit / (tokens.length * 3)) * 10 + Math.log10(1 + momentum);
}

/** Search several live sources at once. A source that fails or times out is reported, not fatal. */
export async function searchAll(q: string, o: SearchOptions): Promise<SearchResult> {
  const now = o.now ?? new Date();
  const env = o.env ?? {};
  const names = o.sources?.length ? o.sources : SEARCH_SOURCES;
  const fetchFn: FetchFn = (url, init) =>
    o.fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(SEARCH_TIMEOUT_MS) });

  const failed: SearchSource[] = [];
  const settled = await Promise.all(
    names.map(async (name) => {
      const s = SEARCHERS[name];
      try {
        const raws = await s.run(q, fetchFn, env);
        if (!raws) return [];
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
  const score = new Map<Item, number>();
  const all = settled.flat();
  for (const it of all) score.set(it, relevance(it, tokens));
  const ordered = all.sort((a, b) => (score.get(b) ?? 0) - (score.get(a) ?? 0));
  const { items } = dedupe(ordered);
  return { items: items.slice(0, SEARCH_RESULT_LIMIT), failed };
}
