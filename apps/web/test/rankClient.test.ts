import { describe, expect, it } from 'vitest';
import type { Item, Niche } from '@radar/core/ranking';
import type { SourceRef } from '../src/lib/feed';
import { inSources, rankFeed } from '../src/lib/rankClient';

const niches: Niche[] = [
  { id: 'ai', name: 'AI', weight: 1, keywords: ['claude', 'agent'] },
  { id: 'go', name: 'Go', weight: 1, keywords: ['golang'] },
];

const mk = (title: string, over: Partial<Item> = {}): Item => ({
  id: title,
  url: `https://e.com/${encodeURIComponent(title)}`,
  title,
  snippet: '',
  source: 'Hacker News',
  sourceKind: 'hn',
  publishedAt: '2026-11-09T05:00:00.000Z',
  momentum: { perHour: 0 },
  tags: [],
  media: { type: 'article' },
  ...over,
});

const sources: SourceRef[] = [
  { id: 'hn', name: 'Hacker News', type: 'hn' },
  { id: 'rss:verge', name: 'The Verge', type: 'rss' },
];

describe('rankFeed', () => {
  it('drops items matching no niche and ranks the rest by score', () => {
    const out = rankFeed(
      [
        mk('Cooking pasta'),
        mk('Claude agent ships', { momentum: { perHour: 0 } }),
        mk('Golang tips', { momentum: { perHour: 40 } }),
      ],
      niches,
    );
    expect(out.map((i) => i.title)).toEqual(['Golang tips', 'Claude agent ships']);
    expect(out[1]?.niches).toEqual(['ai']);
    expect(out[0]?.score).toBeGreaterThan(out[1]!.score);
  });

  it('follows the niches it is given', () => {
    const items = [mk('Claude agent ships'), mk('Golang tips')];
    expect(rankFeed(items, [niches[1]!]).map((i) => i.title)).toEqual(['Golang tips']);
  });

  it('with no niches keeps everything and ranks by momentum alone', () => {
    const items = [mk('Quiet post'), mk('Rising fast', { momentum: { perHour: 40, points: 300 } })];
    const out = rankFeed(items, []);
    expect(out.map((i) => i.title)).toEqual(['Rising fast', 'Quiet post']);
    expect(out.every((i) => i.keywordScore === 0)).toBe(true);
  });

  it('honours topN', () => {
    const items = [mk('Claude one'), mk('Claude two'), mk('Claude three')];
    expect(rankFeed(items, niches, { topN: 2 })).toHaveLength(2);
  });

  it('keeps only items from enabled sources', () => {
    const items = [
      mk('Claude on HN'),
      mk('Claude on Reddit', { source: 'r/ClaudeAI', sourceKind: 'reddit' }),
      mk('Claude at Verge', { source: 'The Verge', sourceKind: 'rss' }),
      mk('Claude at Wired', { source: 'Wired', sourceKind: 'rss' }),
    ];
    const out = rankFeed(items, niches, { sources });
    expect(out.map((i) => i.title).sort()).toEqual(['Claude at Verge', 'Claude on HN']);
  });
});

describe('inSources', () => {
  it('matches rss by display name and other kinds by type', () => {
    expect(inSources(mk('a'), sources)).toBe(true);
    expect(inSources(mk('a', { sourceKind: 'github', source: 'GitHub' }), sources)).toBe(false);
    expect(inSources(mk('a', { sourceKind: 'rss', source: 'The Verge' }), sources)).toBe(true);
    expect(inSources(mk('a', { sourceKind: 'rss', source: 'Wired' }), sources)).toBe(false);
  });
});
