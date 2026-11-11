import type { Niche, TopicSource } from './schema.js';

/** Most topic sources one topic keeps: a news search plus up to two subreddits. */
export const MAX_TOPIC_SOURCES = 3;
export const MAX_TOPIC_SUBREDDITS = 2;
const MAX_NEWS_QUERY = 100;
const MAX_NEWS_TERMS = 4;

const termsOf = (n: Pick<Niche, 'name' | 'keywords'>): string[] => [
  n.name,
  ...n.keywords.map((k) => (typeof k === 'string' ? k : k.term)),
];

/** `fashion` stays as it is; `steam deck` is quoted so News matches the phrase. */
const phrase = (t: string) => (/\s/.test(t) ? `"${t.replace(/"/g, '')}"` : t);

/**
 * The Google News search for a topic: its name plus the first few keywords, joined with OR.
 * A topic named after one word with that word as its only keyword searches for just that word.
 */
export function newsQueryFor(n: Pick<Niche, 'name' | 'keywords'>): string {
  const seen = new Set<string>();
  const picked: string[] = [];
  for (const raw of termsOf(n)) {
    const t = raw.trim().replace(/\s+/g, ' ');
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    picked.push(phrase(t));
    if (picked.length >= MAX_NEWS_TERMS) break;
  }
  let q = '';
  for (const p of picked) {
    const next = q ? `${q} OR ${p}` : p;
    if (next.length > MAX_NEWS_QUERY) break;
    q = next;
  }
  return q || n.name.trim().slice(0, MAX_NEWS_QUERY);
}

export const newsSourceFor = (n: Pick<Niche, 'name' | 'keywords'>): TopicSource => ({
  type: 'news',
  query: newsQueryFor(n),
});

/** What a topic reads from: its own list, or the news search every topic gets until it has one. */
export const topicSourcesOf = (n: Niche): TopicSource[] => n.sources ?? [newsSourceFor(n)];

export const googleNewsUrl = (query: string): string =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;

/** One request for several subreddits: `r/a+b+c`. */
export const redditHotUrl = (subs: readonly string[], limit = 25): string =>
  `https://www.reddit.com/r/${subs.map(encodeURIComponent).join('+')}/hot/.rss?limit=${limit}`;

export const redditSearchUrl = (q: string): string =>
  `https://www.reddit.com/subreddits/search.rss?q=${encodeURIComponent(q)}&limit=10`;

/** Same source, same key: used to fetch each distinct source once. */
export const topicSourceKey = (s: TopicSource): string =>
  s.type === 'news' ? `news:${s.query.toLowerCase()}` : `reddit:${s.sub.toLowerCase()}`;

/** Quiet label for Customize: "Google News: fashion", "r/fashion". */
export const topicSourceLabel = (s: TopicSource): string =>
  s.type === 'news' ? `Google News: ${s.query}` : `r/${s.sub}`;

/**
 * Subreddits named in Reddit's subreddit search feed, best match first.
 * Each result links to `https://www.reddit.com/r/<name>/`.
 */
export function pickSubreddits(xml: string, max = MAX_TOPIC_SUBREDDITS): TopicSource[] {
  const out: TopicSource[] = [];
  const seen = new Set<string>();
  for (const m of xml.matchAll(
    /<link[^>]*href="https?:\/\/(?:www\.)?reddit\.com\/r\/([A-Za-z0-9_]{2,21})\/?"/g,
  )) {
    const sub = m[1]!;
    const key = sub.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type: 'reddit', sub });
    if (out.length >= max) break;
  }
  return out;
}

/** A topic's sources with one removed. Leaves an explicit empty list, so the news search does not come back. */
export const withoutTopicSource = (n: Niche, key: string): Niche => ({
  ...n,
  sources: topicSourcesOf(n).filter((s) => topicSourceKey(s) !== key),
});

/** Fill in the sources of a topic that has none stored yet. */
export function withTopicSources(n: Niche, reddit: TopicSource[]): Niche {
  if (n.sources) return n;
  return { ...n, sources: [newsSourceFor(n), ...reddit].slice(0, MAX_TOPIC_SOURCES) };
}
