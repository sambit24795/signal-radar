import { describe, expect, it } from 'vitest';
import type { ScoredItem } from '@radar/core/ranking';
import { matchedKeywords } from '../src/lib/keywords';
import { metaParts, nicheLabel, selectView, visibleTabs } from '../src/lib/view';

const item = (over: Partial<ScoredItem>): ScoredItem => ({
  id: 'a',
  url: 'https://blog.example.com/post',
  title: 'Claude Code ships agents',
  snippet: 'mcp servers',
  source: 'Hacker News',
  sourceKind: 'hn',
  momentum: { perHour: 12.4, points: 1240, comments: 30 },
  tags: [],
  media: { type: 'article' },
  keywordScore: 5,
  score: 35.8,
  niches: ['ai'],
  publishedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
  ...over,
});

describe('selectView', () => {
  const ranked = [
    item({ id: '1' }),
    item({ id: '2', sourceKind: 'github', niches: ['dev'] }),
    item({ id: '3', sourceKind: 'reddit', niches: ['ai', 'dev'] }),
  ];

  it('keeps order, filters by tab and niche, and limits', () => {
    expect(selectView(ranked, 'top', null).map((i) => i.id)).toEqual(['1', '2', '3']);
    expect(selectView(ranked, 'github', null).map((i) => i.id)).toEqual(['2']);
    expect(selectView(ranked, 'top', 'dev').map((i) => i.id)).toEqual(['2', '3']);
    expect(selectView(ranked, 'top', null, 2)).toHaveLength(2);
  });

  it('shows tabs only for enabled source types', () => {
    const tabs = visibleTabs([{ id: 'hn', name: 'Hacker News', type: 'hn' }]);
    expect(tabs.map((t) => t.id)).toEqual(['top', 'hn']);
  });

  it('shortens niche names', () => {
    expect(nicheLabel('AI tools, coding with AI, agents')).toBe('AI tools');
    expect(nicheLabel('Gamedev')).toBe('Gamedev');
  });
});

describe('metaParts', () => {
  it('builds the hn line', () => {
    expect(metaParts(item({}))).toEqual([
      'Hacker News',
      'blog.example.com',
      '3h',
      '1.2k pts',
      '30 comments',
      '12/h',
      'score 36',
    ]);
  });

  it('shows stars and no domain for github', () => {
    const p = metaParts(
      item({
        source: 'GitHub',
        sourceKind: 'github',
        url: 'https://github.com/a/b',
        momentum: { perHour: 0.1, stars: 20 },
      }),
    );
    expect(p).toContain('20 stars');
    expect(p).not.toContain('github.com');
    expect(p.some((x) => x.endsWith('/h'))).toBe(false);
  });
});

describe('matchedKeywords', () => {
  const niches = [
    {
      id: 'ai',
      name: 'AI',
      weight: 1,
      keywords: ['claude code', { term: 'mcp', weight: 2 }, 'rust'],
    },
    { id: 'other', name: 'Other', weight: 1, keywords: ['agents'] },
  ];
  it('lists title hits before body hits, only for matched niches', () => {
    expect(matchedKeywords(item({}), niches)).toEqual(['claude code', 'mcp']);
  });
});
