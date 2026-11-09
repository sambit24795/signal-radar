import { describe, expect, it } from 'vitest';
import { parseGoogleNews, queryTokens, relevance, searchAll } from '../src/search.js';

const NEWS = `<?xml version="1.0"?><rss version="2.0"><channel><item>
<title>Tokio ships a Rust framework - infoq.com</title><link>https://news.google.com/rss/articles/abc</link>
<pubDate>Mon, 09 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>`;

const hn = (title: string, points: number) =>
  JSON.stringify({
    hits: [
      {
        objectID: '1',
        title,
        url: 'https://ex.com/a',
        points,
        num_comments: 3,
        created_at_i: 1_700_000_000,
      },
    ],
  });

const respond =
  (fail: string[] = []) =>
  async (url: string) => {
    const host = new URL(url).hostname;
    if (fail.includes(host)) return new Response('', { status: 500 });
    if (host === 'hn.algolia.com') return new Response(hn('Why Rust won', 200));
    if (host === 'news.google.com') return new Response(NEWS);
    if (host === 'api.github.com') {
      return new Response(
        JSON.stringify({
          items: [
            {
              full_name: 'rust-lang/rust',
              html_url: 'https://github.com/rust-lang/rust',
              stargazers_count: 90000,
              created_at: '2010-06-16T00:00:00Z',
            },
          ],
        }),
      );
    }
    if (host === 'dev.to') {
      return new Response(
        JSON.stringify([
          {
            title: 'Why Rust won',
            url: 'https://dev.to/x/why-rust-won',
            positive_reactions_count: 5,
            tag_list: ['rust'],
          },
        ]),
      );
    }
    throw new Error(`unexpected ${url}`);
  };

describe('search', () => {
  it('splits the publisher off a Google News title', () => {
    const [it] = parseGoogleNews(NEWS);
    expect(it).toMatchObject({ title: 'Tokio ships a Rust framework', sourceName: 'infoq.com' });
  });

  it('fans out, normalizes, ranks and dedupes by title', async () => {
    const { items, failed } = await searchAll('rust', { fetch: respond() });
    expect(failed).toEqual([]);
    expect(items.map((i) => i.sourceKind).sort()).toEqual(['github', 'hn', 'rss']);
    // The near-identical DEV post folds into the Hacker News one.
    expect(items.filter((i) => i.title === 'Why Rust won')).toHaveLength(1);
    expect(items.find((i) => i.sourceKind === 'rss')?.source).toBe('infoq.com');
  });

  it('isolates a failing source and skips DEV for multi-word queries', async () => {
    const { items, failed } = await searchAll('rust async', { fetch: respond(['api.github.com']) });
    expect(failed).toEqual(['github']);
    expect(items.some((i) => i.sourceKind === 'devto')).toBe(false);
    expect(items.length).toBeGreaterThan(0);
  });

  it('honours a source subset', async () => {
    const { items } = await searchAll('rust', { fetch: respond(), sources: ['github'] });
    expect(items.map((i) => i.sourceKind)).toEqual(['github']);
  });

  it('ranks title matches above loose ones', () => {
    const base = {
      id: 'x',
      url: 'https://a.example/',
      snippet: '',
      source: 's',
      sourceKind: 'hn' as const,
      tags: [],
      momentum: { perHour: 0 },
      media: { type: 'article' as const },
    };
    const t = queryTokens('Rust async');
    expect(relevance({ ...base, title: 'Async Rust in depth' }, t)).toBeGreaterThan(
      relevance({ ...base, title: 'Gardening', snippet: 'rust on tools' }, t),
    );
  });
});
