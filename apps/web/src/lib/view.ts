import type { Item, Niche, ScoredItem } from '@radar/core/ranking';
import type { SourceRef } from './feed';
import { compact, formatAge } from './format';

/** Every source kind the feed can carry. */
export type SourceKind = Item['sourceKind'];

export const SOURCE_KINDS: { id: SourceKind; label: string }[] = [
  { id: 'hn', label: 'Hacker News' },
  { id: 'reddit', label: 'Reddit' },
  { id: 'github', label: 'GitHub' },
  { id: 'lobsters', label: 'Lobsters' },
  { id: 'devto', label: 'DEV' },
  { id: 'mastodon', label: 'Mastodon' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'rss', label: 'News and blogs' },
];

export const isSourceKind = (k: unknown): k is SourceKind => SOURCE_KINDS.some((o) => o.id === k);

/** A source kind appears while at least one source of it is on. */
export function visibleSourceKinds(sources: SourceRef[]) {
  return SOURCE_KINDS.filter((t) => sources.some((s) => s.type === t.id));
}

/**
 * The kinds a view shows. `saved` is what the user ticked (empty means "all"); kinds that are no
 * longer on are dropped, and an empty result falls back to every kind that is on.
 */
export function effectiveKinds(saved: readonly string[], available: readonly SourceKind[]) {
  const picked = available.filter((k) => saved.includes(k));
  return picked.length > 0 ? picked : [...available];
}

/**
 * Picks one kind. From "all" it narrows to that kind alone; after that it ticks or unticks, and the
 * last ticked kind stays on (the view is never empty). The result is what to save: empty when every
 * kind is on.
 */
export function toggleKind(
  saved: readonly string[],
  available: readonly SourceKind[],
  kind: SourceKind,
): SourceKind[] {
  const now = effectiveKinds(saved, available);
  // From "all", picking one source narrows to just that one (as the topic menu does).
  if (now.length === available.length) return available.length > 1 ? [kind] : [];
  const next = now.includes(kind) ? now.filter((k) => k !== kind) : [...now, kind];
  if (next.length === 0) return [...now];
  return next.length === available.length ? [] : available.filter((k) => next.includes(k));
}

/** The menu trigger: "All sources", one source's name, or "3 sources". */
export function kindsLabel(saved: readonly string[], available: readonly SourceKind[]): string {
  const on = effectiveKinds(saved, available);
  if (on.length === available.length) return 'All sources';
  if (on.length === 1) return SOURCE_KINDS.find((o) => o.id === on[0])?.label ?? 'One source';
  return `${on.length} sources`;
}

/** The "All topics" choice. */
export const ALL_TOPICS = 'all';

/** Topic menu entries: "All topics", then the user's own topics in the order they chose them. */
export function topicOptions(niches: Niche[]): { id: string; label: string }[] {
  return [
    { id: ALL_TOPICS, label: 'All topics' },
    ...niches.map((n) => ({ id: n.id, label: n.name })),
  ];
}

/** The topic named by `?topic=…`, if it is one of the reader's topics; otherwise "all". */
export function topicFromSearch(search: string, niches: readonly Niche[]): string {
  const id = new URLSearchParams(search).get('topic') ?? '';
  return niches.some((n) => n.id === id) ? id : ALL_TOPICS;
}

/** Adds `topic=…` to a path (which may already carry a query); "all" adds nothing. */
export function withTopic(href: string, topic: string): string {
  if (topic === ALL_TOPICS) return href;
  return `${href}${href.includes('?') ? '&' : '?'}topic=${encodeURIComponent(topic)}`;
}

/** The topics named by `?topic=a,b`, kept to the reader's own, in their order; empty means all. */
export function topicsFromSearch(search: string, niches: readonly Niche[]): string[] {
  const ids = (new URLSearchParams(search).get('topic') ?? '').split(',');
  const picked = niches.filter((n) => ids.includes(n.id)).map((n) => n.id);
  return picked.length === niches.length ? [] : picked;
}

/** Adds `topic=a,b` to a path; no topics (all) adds nothing. */
export function withTopics(href: string, topics: readonly string[]): string {
  return withTopic(href, topics.length ? topics.join(',') : ALL_TOPICS);
}

/** Ticks or unticks one topic; "All topics", or ticking every topic, clears the filter. */
export function toggleTopic(
  active: readonly string[],
  id: string,
  all: readonly string[],
): string[] {
  if (id === ALL_TOPICS) return [];
  const next = active.includes(id) ? active.filter((t) => t !== id) : [...active, id];
  const ordered = all.filter((t) => next.includes(t));
  return ordered.length === all.length ? [] : ordered;
}

/** Menu label: "All topics", the one topic's name, or "3 topics". */
export function topicsLabel(
  active: readonly string[],
  options: readonly { id: string; label: string }[],
): string {
  if (active.length === 0) return 'All topics';
  if (active.length === 1) return options.find((o) => o.id === active[0])?.label ?? 'All topics';
  return `${active.length} topics`;
}

/** The previous or next entry of the topic menu, wrapping around. */
export function stepTopic(ids: readonly string[], current: string, delta: 1 | -1): string {
  if (ids.length === 0) return current;
  const at = Math.max(0, ids.indexOf(current));
  return ids[(at + delta + ids.length) % ids.length]!;
}

/** How many stories Read shows at first, and how many each "Show more" adds. */
export const PAGE_SIZE = 30;

/** The next `shown` count after "Show more": one more page, never past the list. */
export function showMore(shown: number, total: number, page = PAGE_SIZE): number {
  return Math.min(total, shown + page);
}

/**
 * Whole days the loaded feed reaches back (at least 1), for "everything from the last N days".
 * A few stragglers with ancient dates are ignored: the span is where 90% of the stories fall.
 */
export function feedDays(items: readonly { publishedAt?: string | null }[], now: number): number {
  const ages = items
    .map((i) => (i.publishedAt ? now - Date.parse(i.publishedAt) : NaN))
    .filter((a) => !Number.isNaN(a))
    .sort((x, y) => x - y);
  const edge = ages[Math.max(0, Math.ceil(ages.length * 0.9) - 1)] ?? 0;
  return Math.max(1, Math.round(edge / 86_400_000));
}

/** The rows for one topic, optionally narrowed to some source kinds (null: all). `ranked` is already best-first. */
export function selectView(
  ranked: ScoredItem[],
  nicheId: string | readonly string[] | null,
  kinds: readonly string[] | null = null,
  limit = Infinity,
): ScoredItem[] {
  const ids = nicheId === null ? [] : typeof nicheId === 'string' ? [nicheId] : nicheId;
  return ranked
    .filter(
      (i) =>
        (!kinds || kinds.includes(i.sourceKind)) &&
        (ids.length === 0 || ids.some((id) => i.niches.includes(id))),
    )
    .slice(0, limit);
}

/**
 * The story's meta line, as parts: source, age and one signal (views, stars or points). The
 * domain, comment count, "rising" and the ranking score stay out: one short line reads fastest.
 */
export function metaParts(item: ScoredItem, now: number = Date.now()): string[] {
  const parts: string[] = [item.source];
  const age = formatAge(item.publishedAt, now);
  if (age) parts.push(age);
  const m = item.momentum;
  if (m.views !== undefined) parts.push(`${compact(m.views)} views`);
  else if (m.stars !== undefined) parts.push(`${compact(m.stars)} stars`);
  else if (m.points !== undefined) parts.push(`${compact(m.points)} pts`);
  return parts;
}
