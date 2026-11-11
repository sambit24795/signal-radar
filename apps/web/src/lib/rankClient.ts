import { prefilter, rank, type Item, type Niche, type ScoredItem } from '@radar/core/ranking';
import type { SourceRef } from './feed';
import type { TopicItems } from './topicItems';

/**
 * An item belongs to an enabled source of its kind; RSS sources are told apart by display name,
 * while hn/reddit/github are one source each.
 */
export function inSources(item: Item, sources: SourceRef[]): boolean {
  return sources.some(
    (s) => s.type === item.sourceKind && (s.type !== 'rss' || s.name === item.source),
  );
}

export interface RankOptions {
  /** Enabled sources; omit to keep every item. */
  sources?: SourceRef[];
  /** Maximum items returned. */
  topN?: number;
  /** Items fetched for the user's topic sources: they skip the source filter and belong to their topic. */
  topic?: TopicItems;
}

/**
 * Runs the core keyword prefilter and ranking over the feed against the user's niches.
 * With no niches nothing can match, so everything is kept and ranked by momentum alone.
 */
export function rankFeed(items: Item[], niches: Niche[], opts: RankOptions = {}): ScoredItem[] {
  const { sources, topN = 100, topic } = opts;
  const shared = sources ? items.filter((i) => inSources(i, sources)) : items;
  let pool = shared;
  if (topic && topic.items.length > 0) {
    const have = new Set(shared.map((i) => i.url));
    pool = [...shared, ...topic.items.filter((i) => !have.has(i.url))];
  }
  return rank(
    prefilter(
      pool,
      niches,
      () => niches.length === 0,
      topic ? (i) => topic.owners.get(i.url) : undefined,
    ),
    topN,
  );
}
