import type { Niche, ScoredItem } from '@radar/core/ranking';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Same boundary rule as the core prefilter, so what we show is what matched. */
const termRe = (term: string) =>
  new RegExp(`(^|[^a-z0-9])${escape(term)}(?:e?s)?($|[^a-z0-9])`, 'i');

/** Keywords of the item's matched niches that occur in it; title hits first. */
export function matchedKeywords(item: ScoredItem, niches: Niche[], max = 3): string[] {
  const body = `${item.snippet} ${item.tags.join(' ')}`;
  const inTitle: string[] = [];
  const inBody: string[] = [];
  for (const niche of niches) {
    if (!item.niches.includes(niche.id)) continue;
    for (const k of niche.keywords) {
      const term = typeof k === 'string' ? k : k.term;
      const re = termRe(term);
      if (re.test(item.title)) inTitle.push(term);
      else if (re.test(body)) inBody.push(term);
    }
  }
  return [...new Set([...inTitle, ...inBody])].slice(0, max);
}
