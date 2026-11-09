import type { Item } from './schema.js';

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'for',
  'with',
  'is',
  'are',
  'at',
  'by',
  'from',
  'show',
  'hn',
  'ask',
]);

export function titleTokens(title: string): Set<string> {
  const tokens = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t));
  return new Set(tokens);
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

const weight = (i: Item) => i.momentum.points ?? i.momentum.stars ?? 0;

function merge(winner: Item, loser: Item): Item {
  return { ...winner, tags: [...new Set([...winner.tags, ...loser.tags])] };
}

/** Collapse duplicates by canonical-URL id, then by fuzzy title similarity (token Jaccard). */
export function dedupe(items: Item[], threshold = 0.85): { items: Item[]; dropped: number } {
  const byId = new Map<string, Item>();
  for (const it of items) {
    const prev = byId.get(it.id);
    byId.set(it.id, prev ? (weight(it) > weight(prev) ? merge(it, prev) : merge(prev, it)) : it);
  }

  const kept: { item: Item; tokens: Set<string> }[] = [];
  for (const item of byId.values()) {
    const tokens = titleTokens(item.title);
    // Very short titles are too ambiguous to fuzzy match.
    const match =
      tokens.size >= 3
        ? kept.find((k) => k.tokens.size >= 3 && jaccard(k.tokens, tokens) >= threshold)
        : undefined;
    if (!match) {
      kept.push({ item, tokens });
    } else if (weight(item) > weight(match.item)) {
      match.item = merge(item, match.item);
      match.tokens = tokens;
    } else {
      match.item = merge(match.item, item);
    }
  }
  const out = kept.map((k) => k.item);
  return { items: out, dropped: items.length - out.length };
}
