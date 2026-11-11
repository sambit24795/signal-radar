import type { Niche } from '@radar/core/ranking';
import { fold } from './search';
import { newNicheId } from './niches';
import { MAX_NICHES } from './presets';

/** "web3 design" -> "Web3 Design". */
export function titleCase(text: string): string {
  return text
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}

const norm = (s: string) => fold(s).trim().replace(/\s+/g, ' ');

/** The topic whose name or one of whose keywords is the query (case and accents ignored). */
export function findTopic(niches: readonly Niche[], query: string): Niche | undefined {
  const q = norm(query);
  if (!q) return undefined;
  return niches.find(
    (n) =>
      norm(n.name) === q || n.keywords.some((k) => norm(typeof k === 'string' ? k : k.term) === q),
  );
}

export type AddFromSearch =
  | { kind: 'added'; niches: Niche[]; niche: Niche }
  | { kind: 'exists'; niche: Niche }
  | { kind: 'full' }
  | { kind: 'empty' };

/** A topic named after the query, with the query as its one keyword. Its sources are filled in afterwards. */
export function addTopicFromQuery(niches: readonly Niche[], query: string): AddFromSearch {
  const text = query.trim().replace(/\s+/g, ' ');
  if (!text) return { kind: 'empty' };
  const existing = findTopic(niches, text);
  if (existing) return { kind: 'exists', niche: existing };
  if (niches.length >= MAX_NICHES) return { kind: 'full' };
  const niche: Niche = {
    id: newNicheId([...niches]),
    name: titleCase(text),
    weight: 1,
    keywords: [text.toLowerCase()],
  };
  return { kind: 'added', niches: [...niches, niche], niche };
}
