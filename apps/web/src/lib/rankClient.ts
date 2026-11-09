import { prefilter, rank, type Item, type Niche, type ScoredItem } from '@radar/core/ranking';
import type { SourceRef } from './feed';

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
}

/** Runs the core keyword prefilter and ranking over the feed against the user's niches. */
export function rankFeed(items: Item[], niches: Niche[], opts: RankOptions = {}): ScoredItem[] {
  const { sources, topN = 100 } = opts;
  const pool = sources ? items.filter((i) => inSources(i, sources)) : items;
  return rank(prefilter(pool, niches), topN);
}
