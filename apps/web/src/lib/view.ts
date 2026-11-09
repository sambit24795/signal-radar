import type { Item, Niche, ScoredItem } from '@radar/core/ranking';
import type { SourceRef } from './feed';
import { compact, domainOf, formatAge } from './format';

/** Which source a view is narrowed to; sources are a quiet filter, topics are the tabs. */
export type SourceFilter = 'all' | Item['sourceKind'];

export const SOURCE_FILTERS: { id: SourceFilter; label: string }[] = [
  { id: 'all', label: 'All sources' },
  { id: 'hn', label: 'Hacker News' },
  { id: 'reddit', label: 'Reddit' },
  { id: 'github', label: 'GitHub' },
  { id: 'rss', label: 'Videos and feeds' },
];

/** "All sources" is always there; a source type appears while at least one source of it is on. */
export function visibleSourceFilters(sources: SourceRef[]) {
  return SOURCE_FILTERS.filter((t) => t.id === 'all' || sources.some((s) => s.type === t.id));
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

/** The rows for one topic, optionally narrowed to one source type. `ranked` is already best-first. */
export function selectView(
  ranked: ScoredItem[],
  nicheId: string | null,
  source: SourceFilter = 'all',
  limit = 100,
): ScoredItem[] {
  return ranked
    .filter(
      (i) =>
        (source === 'all' || i.sourceKind === source) && (!nicheId || i.niches.includes(nicheId)),
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
  // GitHub and Reddit links point at the source itself, so the host adds nothing.
  if (item.sourceKind === 'hn' || item.sourceKind === 'rss') {
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
  parts.push(`score ${Math.round(item.score)}`);
  return parts;
}
