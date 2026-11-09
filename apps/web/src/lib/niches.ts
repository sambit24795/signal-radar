import type { Niche } from '@radar/core/ranking';

export const keywordText = (n: Niche): string =>
  n.keywords.map((k) => (typeof k === 'string' ? k : k.term)).join(', ');

/** Parses "a, b, c" back to keywords, keeping the weight of any term that was already weighted. */
export function parseKeywords(text: string, previous: Niche['keywords']): Niche['keywords'] {
  const weights = new Map<string, number>();
  for (const k of previous) if (typeof k !== 'string') weights.set(k.term.toLowerCase(), k.weight);
  const seen = new Set<string>();
  const out: Niche['keywords'] = [];
  for (const raw of text.split(',')) {
    const term = raw.trim();
    const key = term.toLowerCase();
    if (!term || seen.has(key)) continue;
    seen.add(key);
    const weight = weights.get(key);
    out.push(weight !== undefined ? { term, weight } : term);
  }
  return out;
}

/** A niche id that does not collide with the existing ones. */
export function newNicheId(niches: Niche[]): string {
  let n = niches.length + 1;
  while (niches.some((x) => x.id === `custom-${n}`)) n++;
  return `custom-${n}`;
}
