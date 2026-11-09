import type { Item, ScoredItem } from '@radar/core/ranking';
import type { SourceRef } from './feed';
import { compact, domainOf, formatAge } from './format';

export type TabId = 'top' | Item['sourceKind'];

export const TABS: { id: TabId; label: string }[] = [
  { id: 'top', label: 'Top' },
  { id: 'hn', label: 'Hacker News' },
  { id: 'reddit', label: 'Reddit' },
  { id: 'github', label: 'GitHub' },
  { id: 'rss', label: 'Videos/RSS' },
];

/** Top is always there; a source tab appears while at least one source of its type is on. */
export function visibleTabs(sources: SourceRef[]) {
  return TABS.filter((t) => t.id === 'top' || sources.some((s) => s.type === t.id));
}

/** The rows for one tab, optionally narrowed to one niche. `ranked` is already best-first. */
export function selectView(
  ranked: ScoredItem[],
  tab: TabId,
  nicheId: string | null,
  limit = 100,
): ScoredItem[] {
  return ranked
    .filter(
      (i) => (tab === 'top' || i.sourceKind === tab) && (!nicheId || i.niches.includes(nicheId)),
    )
    .slice(0, limit);
}

/** Short niche label for chips: the full name is often a sentence ("AI tools, coding with AI"). */
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
