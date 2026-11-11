import type { Item, ScoredItem } from '@radar/core/ranking';
import { api } from './api';

/** Lowercase and strip accents, so "cafe" finds "Café". */
export function fold(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

/** Stories whose title, tags or source contain every word of the query (any order). */
export function filterItems<T extends Item>(items: readonly T[], query: string): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...items];
  return items.filter((it) => {
    const hay = fold(`${it.title} ${it.tags.join(' ')} ${it.source}`);
    return words.every((w) => hay.includes(w));
  });
}

export interface SearchParams {
  q: string;
  /** Searching live sources, not just the loaded feed. */
  all: boolean;
}

export const MIN_EVERYWHERE = 2;
export const MAX_QUERY = 100;

export function parseSearch(search: string): SearchParams {
  const p = new URLSearchParams(search);
  const q = (p.get('q') ?? '').trim().slice(0, MAX_QUERY);
  return { q, all: !!q && q.length >= MIN_EVERYWHERE && p.get('all') === '1' };
}

/** `?q=…` (and `&all=1`) appended to a path; the bare path when there is no query. */
export function searchHref(pathname: string, { q, all }: SearchParams): string {
  const text = q.trim();
  if (!text) return pathname;
  const p = new URLSearchParams({ q: text });
  if (all && text.length >= MIN_EVERYWHERE) p.set('all', '1');
  return `${pathname}?${p.toString()}`;
}

export interface EverywhereResult {
  items: ScoredItem[];
  /** Sources that did not answer. */
  failed: string[];
  /** Sources that did answer; YouTube is absent when the server has no key or quota. */
  answered: string[];
}

const SOURCE_NAMES: Record<string, string> = {
  hn: 'Hacker News',
  news: 'Google News',
  github: 'GitHub',
  devto: 'DEV',
  youtube: 'YouTube',
};
/** How the results line names a source that answered ("news" is Google News). */
const ANSWERED_NAMES: Record<string, string> = { news: 'news sites' };
export const sourceName = (id: string) => SOURCE_NAMES[id] ?? id;

/** "Hacker News, news sites, GitHub, DEV and YouTube": only the sources that answered. */
export function answeredLine(answered: readonly string[]): string {
  const names = answered.map((id) => ANSWERED_NAMES[id] ?? SOURCE_NAMES[id] ?? id);
  if (names.length <= 1) return names[0] ?? 'the live sources';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const memo = new Map<string, EverywhereResult>();

/** `GET /api/search`: live sources, as feed items. Remembered for the session per query. */
export async function searchEverywhere(q: string): Promise<EverywhereResult> {
  const key = fold(q.trim());
  const hit = memo.get(key);
  if (hit) return hit;
  const res = await api<{ items: Item[]; failed: string[]; answered?: string[] }>(
    `/api/search?q=${encodeURIComponent(q.trim())}`,
  );
  const out: EverywhereResult = {
    items: res.items.map((i) => ({ ...i, keywordScore: 0, score: 0, niches: [] })),
    failed: res.failed,
    answered: res.answered ?? [],
  };
  // A search where a source dropped out is worth retrying later.
  if (res.failed.length === 0) memo.set(key, out);
  return out;
}
