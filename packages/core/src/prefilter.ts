import type { Item, Niche } from './schema.js';

export interface Compiled {
  niche: Niche;
  terms: { term: string; re: RegExp; weight: number }[];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function compileNiches(niches: Niche[]): Compiled[] {
  return niches.map((niche) => ({
    niche,
    terms: niche.keywords.map((k) => {
      const term = typeof k === 'string' ? k : k.term;
      const weight = typeof k === 'string' ? 1 : k.weight;
      return {
        term,
        re: new RegExp(`(^|[^a-z0-9])${escape(term)}(?:e?s)?($|[^a-z0-9])`, 'i'),
        weight,
      };
    }),
  }));
}

export const TITLE_HIT = 3;
export const BODY_HIT = 1;

export interface Match {
  keywordScore: number;
  niches: string[];
}

/** Each keyword counts once: title hit = 3, snippet/tags hit = 1, times keyword and niche weight. */
export function scoreKeywords(
  item: Pick<Item, 'title' | 'snippet' | 'tags'>,
  compiled: Compiled[],
): Match {
  const body = `${item.snippet} ${item.tags.join(' ')}`;
  let total = 0;
  const niches: string[] = [];
  for (const { niche, terms } of compiled) {
    let nicheScore = 0;
    for (const { re, weight } of terms) {
      if (re.test(item.title)) nicheScore += TITLE_HIT * weight;
      else if (re.test(body)) nicheScore += BODY_HIT * weight;
    }
    if (nicheScore > 0) {
      total += nicheScore * niche.weight;
      niches.push(niche.id);
    }
  }
  return { keywordScore: Math.round(total * 100) / 100, niches };
}

export interface Prefiltered {
  item: Item;
  keywordScore: number;
  niches: string[];
}

/**
 * Drop items with zero keyword hits unless `alwaysInclude(item)` is true.
 * `owners` names the topics an item was fetched for (topic sources): it belongs to them even
 * without a keyword hit, as a weak match.
 */
export function prefilter(
  items: Item[],
  niches: Niche[],
  alwaysInclude: (item: Item) => boolean = () => false,
  owners?: (item: Item) => readonly string[] | undefined,
): Prefiltered[] {
  const compiled = compileNiches(niches);
  const weights = new Map(niches.map((n) => [n.id, n.weight]));
  const out: Prefiltered[] = [];
  for (const item of items) {
    const m = scoreKeywords(item, compiled);
    for (const id of owners?.(item) ?? []) {
      const w = weights.get(id);
      if (w === undefined || m.niches.includes(id)) continue;
      m.niches.push(id);
      if (m.keywordScore === 0) m.keywordScore = Math.round(BODY_HIT * w * 100) / 100;
    }
    if (m.keywordScore > 0 || alwaysInclude(item)) out.push({ item, ...m });
  }
  return out;
}
