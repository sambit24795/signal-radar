import type { Item, Niche, ScoredItem } from '@radar/core/ranking';
import type { SourceRef } from './feed';
import { compact, domainOf, formatAge } from './format';

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
 * Ticks or unticks one kind. The last ticked kind stays on (the view is never empty). The result is
 * what to save: empty when every kind is on.
 */
export function toggleKind(
  saved: readonly string[],
  available: readonly SourceKind[],
  kind: SourceKind,
): SourceKind[] {
  const now = effectiveKinds(saved, available);
  const next = now.includes(kind) ? now.filter((k) => k !== kind) : [...now, kind];
  if (next.length === 0) return now.length === available.length ? [] : [...now];
  return next.length === available.length ? [] : available.filter((k) => next.includes(k));
}

/** The menu trigger: "All sources", one source's name, or "3 sources". */
export function kindsLabel(saved: readonly string[], available: readonly SourceKind[]): string {
  const on = effectiveKinds(saved, available);
  if (on.length === available.length) return 'All sources';
  if (on.length === 1) return SOURCE_KINDS.find((o) => o.id === on[0])?.label ?? 'One source';
  return `${on.length} sources`;
}

/** The "All" topic tab. */
export const ALL_TOPICS = 'all';

/** Topic tabs: "All", then the user's own topics in the order they chose them. */
export function topicTabs(niches: Niche[]): { id: string; label: string }[] {
  return [
    { id: ALL_TOPICS, label: 'All' },
    ...niches.map((n) => ({ id: n.id, label: nicheLabel(n.name) })),
  ];
}

/** The rows for one topic, optionally narrowed to some source kinds (null: all). `ranked` is already best-first. */
export function selectView(
  ranked: ScoredItem[],
  nicheId: string | null,
  kinds: readonly string[] | null = null,
  limit = 100,
): ScoredItem[] {
  return ranked
    .filter(
      (i) => (!kinds || kinds.includes(i.sourceKind)) && (!nicheId || i.niches.includes(nicheId)),
    )
    .slice(0, limit);
}

/** Short niche label for tabs: the full name is often a sentence ("AI tools, coding with AI"). */
export function nicheLabel(name: string): string {
  return name.split(',')[0]!.trim() || name;
}

/** The mono metadata line, as parts: source, domain, age, engagement, momentum, score. */
export function metaParts(item: ScoredItem, now: number = Date.now()): string[] {
  const parts: string[] = [item.source];
  // GitHub, Reddit, DEV and YouTube links point at the source itself, so the host adds nothing.
  if (!['github', 'reddit', 'devto', 'youtube'].includes(item.sourceKind)) {
    const domain = domainOf(item.url);
    if (domain && !item.source.toLowerCase().includes(domain.split('.')[0]!)) parts.push(domain);
  }
  const age = formatAge(item.publishedAt, now);
  if (age) parts.push(age);
  const m = item.momentum;
  if (m.stars !== undefined) parts.push(`${compact(m.stars)} stars`);
  if (m.points !== undefined) parts.push(`${compact(m.points)} pts`);
  if (m.comments !== undefined) parts.push(`${compact(m.comments)} comments`);
  if (item.media.type === 'video' || item.media.type === 'short') parts.push('video');
  if (m.perHour >= 0.5) parts.push(`${compact(m.perHour)}/h`);
  if (item.score > 0) parts.push(`score ${Math.round(item.score)}`);
  return parts;
}
