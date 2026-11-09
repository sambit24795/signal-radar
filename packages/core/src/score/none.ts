import { compileNiches, type Compiled } from '../prefilter.js';
import type { Niche, ScoredItem } from '../schema.js';
import { stripHtml } from '../text.js';
import type { Provider } from './types.js';

/** No-AI mode: items keep their keyword+momentum rank and nothing is sent anywhere. */
export const noneProvider: Provider = {
  id: 'none',
  complete() {
    return Promise.reject(new Error('the none provider cannot complete prompts'));
  },
};

const SUMMARY_MAX = 280;

/** Clean a feed snippet into at most 280 chars, cut at a sentence or word boundary. */
export function cleanSnippet(snippet: string): string | null {
  const text = stripHtml(snippet);
  if (!text) return null;
  if (text.length <= SUMMARY_MAX) return text;
  const head = text.slice(0, SUMMARY_MAX);
  const sentence = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '));
  if (sentence >= SUMMARY_MAX / 2) return head.slice(0, sentence + 1);
  const space = head.lastIndexOf(' ');
  return (space > 0 ? head.slice(0, space) : head).replace(/[\s,;:.-]+$/, '') + '…';
}

/** "Matches AI tools: claude, agent" from the item's first niche and its matched keywords. */
export function matchReason(
  item: Pick<ScoredItem, 'title' | 'snippet' | 'tags' | 'niches'>,
  niches: Niche[],
  compiled: Compiled[] = compileNiches(niches),
): string {
  const id = item.niches[0];
  const c = compiled.find((x) => x.niche.id === id);
  if (!c) return 'Ranked by recent activity.';
  const body = `${item.snippet} ${item.tags.join(' ')}`;
  const hits = c.terms
    .map((t) => ({
      term: t.term,
      pts: (t.re.test(item.title) ? 3 : t.re.test(body) ? 1 : 0) * t.weight,
    }))
    .filter((h) => h.pts > 0)
    .sort((a, b) => b.pts - a.pts)
    .slice(0, 3)
    .map((h) => h.term);
  return hits.length ? `Matches ${c.niche.name}: ${hits.join(', ')}` : `Matches ${c.niche.name}`;
}

export function noneFallback(
  item: ScoredItem,
  niches: Niche[],
  compiled?: Compiled[],
): { summary: string | null; why: string } {
  return { summary: cleanSnippet(item.snippet), why: matchReason(item, niches, compiled) };
}
