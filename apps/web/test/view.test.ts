import { describe, expect, it } from 'vitest';
import type { ScoredItem } from '@radar/core/ranking';
import { matchedKeywords } from '../src/lib/keywords';
import {
  ALL_TOPICS,
  metaParts,
  nicheLabel,
  selectView,
  topicTabs,
  effectiveKinds,
  kindsLabel,
  toggleKind,
  visibleSourceKinds,
} from '../src/lib/view';

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

  it('keeps order, filters by topic and source, and limits', () => {
    expect(selectView(ranked, null).map((i) => i.id)).toEqual(['1', '2', '3']);
    expect(selectView(ranked, null, ['github']).map((i) => i.id)).toEqual(['2']);
    expect(selectView(ranked, 'dev').map((i) => i.id)).toEqual(['2', '3']);
    expect(selectView(ranked, 'dev', ['reddit', 'hn']).map((i) => i.id)).toEqual(['3']);
    expect(selectView(ranked, null, null, 2)).toHaveLength(2);
  });

  it('offers source filters only for enabled source types', () => {
    const f = visibleSourceKinds([
      { id: 'hn', name: 'Hacker News', type: 'hn' },
      { id: 'yt', name: 'A channel', type: 'youtube' },
    ]);
    expect(f.map((t) => t.id)).toEqual(['hn', 'youtube']);
  });

  it('shows several kinds at once', () => {
    expect(selectView(ranked, null, ['github', 'reddit']).map((i) => i.id)).toEqual(['2', '3']);
  });

  it('makes one tab per topic after "All"', () => {
    const niches = [
      { id: 'ai', name: 'AI tools, coding with AI', weight: 1, keywords: ['x'] },
      { id: 'go', name: 'Go', weight: 1, keywords: ['y'] },
    ];
    expect(topicTabs(niches)).toEqual([
      { id: ALL_TOPICS, label: 'All' },
      { id: 'ai', label: 'AI tools' },
      { id: 'go', label: 'Go' },
    ]);
    expect(topicTabs([])).toEqual([{ id: ALL_TOPICS, label: 'All' }]);
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

describe('source selection', () => {
  const all = ['hn', 'reddit', 'github', 'rss'] as const;

  it('treats nothing saved as every source, and drops kinds that are off', () => {
    expect(effectiveKinds([], all)).toEqual([...all]);
    expect(effectiveKinds(['reddit', 'devto'], all)).toEqual(['reddit']);
    expect(effectiveKinds(['devto'], all)).toEqual([...all]);
  });

  it('unticks and reticks, saving nothing once every source is on', () => {
    expect(toggleKind([], all, 'reddit')).toEqual(['hn', 'github', 'rss']);
    expect(toggleKind(['hn', 'github', 'rss'], all, 'reddit')).toEqual([]);
    expect(toggleKind(['hn'], all, 'rss')).toEqual(['hn', 'rss']);
  });

  it('never empties the selection', () => {
    expect(toggleKind(['hn'], all, 'hn')).toEqual(['hn']);
    expect(toggleKind([], ['hn'], 'hn')).toEqual([]);
  });

  it('summarises the choice for the menu button', () => {
    expect(kindsLabel([], all)).toBe('All sources');
    expect(kindsLabel(['reddit'], all)).toBe('Reddit');
    expect(kindsLabel(['hn', 'rss'], all)).toBe('2 sources');
    expect(kindsLabel(['rss'], all)).toBe('News and blogs');
  });
});
