import type { ScoredItem } from './schema.js';
import type { Prefiltered } from './prefilter.js';

/**
 * Ranking score: keyword relevance dominates for items without engagement data (RSS, Reddit RSS),
 * while log-scaled momentum (points/stars per hour) lets fast-rising items overtake.
 */
export function rankScore(keywordScore: number, perHour: number): number {
  return Math.round((keywordScore * 4 + 12 * Math.log1p(perHour)) * 10) / 10;
}

export function rank(items: Prefiltered[], topN: number): ScoredItem[] {
  return items
    .map(({ item, keywordScore, niches }) => ({
      ...item,
      tags: [...new Set([...item.tags, ...niches])],
      keywordScore,
      niches,
      score: rankScore(keywordScore, item.momentum.perHour),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        Date.parse(b.publishedAt ?? '') - Date.parse(a.publishedAt ?? '') ||
        a.title.localeCompare(b.title),
    )
    .slice(0, topN);
}
