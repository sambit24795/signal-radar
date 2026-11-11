import { describe, expect, it } from 'vitest';
import type { ScoredItem } from '@radar/core/ranking';
import type { Item } from '@radar/core/ranking';
import { rankFeed } from '../src/lib/rankClient';
import {
  ALL_TOPICS,
  feedDays,
  PAGE_SIZE,
  showMore,
  stepTopic,
  topicFromSearch,
  withTopic,
  metaParts,
  selectView,
  toggleTopic,
  topicsFromSearch,
  topicsLabel,
  withTopics,
  topicOptions,
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

  it('makes one menu entry per topic after "All topics"', () => {
    const niches = [
      { id: 'ai', name: 'AI tools, coding with AI', weight: 1, keywords: ['x'] },
      { id: 'go', name: 'Go', weight: 1, keywords: ['y'] },
    ];
    expect(topicOptions(niches)).toEqual([
      { id: ALL_TOPICS, label: 'All topics' },
      { id: 'ai', label: 'AI tools, coding with AI' },
      { id: 'go', label: 'Go' },
    ]);
    expect(topicOptions([])).toEqual([{ id: ALL_TOPICS, label: 'All topics' }]);
  });
});

describe('metaParts', () => {
  it('builds the hn line', () => {
    expect(metaParts(item({}))).toEqual(['Hacker News', '3h', '1.2k pts']);
  });

  it('shows channel, age and views for a YouTube result', () => {
    const p = metaParts(
      item({
        source: 'Style Notes',
        sourceKind: 'youtube',
        url: 'https://www.youtube.com/watch?v=abc',
        media: { type: 'video' },
        momentum: { perHour: 1, views: 120_000, points: 4000, comments: 90 },
      }),
    );
    expect(p).toContain('Style Notes');
    expect(p).toContain('120k views');
    expect(p).not.toContain('youtube.com');
    expect(p.some((x) => x.includes('pts') || x.includes('comments'))).toBe(false);
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
    expect(p).not.toContain('rising');
    expect(p.some((x) => x.startsWith('score'))).toBe(false);
  });
});

describe('source selection', () => {
  const all = ['hn', 'reddit', 'github', 'rss'] as const;

  it('treats nothing saved as every source, and drops kinds that are off', () => {
    expect(effectiveKinds([], all)).toEqual([...all]);
    expect(effectiveKinds(['reddit', 'devto'], all)).toEqual(['reddit']);
    expect(effectiveKinds(['devto'], all)).toEqual([...all]);
  });

  it('narrows from all to one source, then ticks and unticks, saving nothing once every source is on', () => {
    expect(toggleKind([], all, 'reddit')).toEqual(['reddit']);
    expect(toggleKind(['hn', 'github'], all, 'github')).toEqual(['hn']);
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

describe('paging Read', () => {
  const mk = (n: number): Item => ({
    id: `s${n}`,
    url: `https://e.com/${n}`,
    title: `Story ${n}`,
    snippet: '',
    source: 'Hacker News',
    sourceKind: 'hn',
    publishedAt: '2026-11-09T05:00:00.000Z',
    momentum: { perHour: n },
    tags: [],
    media: { type: 'article' },
  });
  const pool = Array.from({ length: 250 }, (_, i) => mk(i + 1));

  it('ranks the whole pool, not just the first 100', () => {
    const ranked = rankFeed(pool, [], { topN: Infinity });
    expect(ranked).toHaveLength(250);
    expect(selectView(ranked, null)).toHaveLength(250);
    expect(ranked[0]!.score).toBeGreaterThanOrEqual(ranked[249]!.score);
  });

  it('shows 30, and each press reveals the next 30 until the list ends', () => {
    const total = 250;
    let shown = Math.min(PAGE_SIZE, total);
    expect(shown).toBe(30);
    shown = showMore(shown, total);
    expect(shown).toBe(60);
    while (shown < total) shown = showMore(shown, total);
    expect(shown).toBe(total);
    expect(showMore(shown, total)).toBe(total);
  });

  it('reads the topic from the URL and steps through the menu', () => {
    const niches = [
      { id: 'ai', name: 'AI', weight: 1, keywords: ['x'] },
      { id: 'go', name: 'Go', weight: 1, keywords: ['y'] },
    ];
    expect(topicFromSearch('?topic=go', niches)).toBe('go');
    expect(topicFromSearch('?topic=nope', niches)).toBe(ALL_TOPICS);
    expect(topicFromSearch('', niches)).toBe(ALL_TOPICS);
    expect(withTopic('/read', 'go')).toBe('/read?topic=go');
    expect(withTopic('/read?q=x', 'go')).toBe('/read?q=x&topic=go');
    expect(withTopic('/read', ALL_TOPICS)).toBe('/read');
    const ids = [ALL_TOPICS, 'ai', 'go'];
    expect(stepTopic(ids, 'go', 1)).toBe(ALL_TOPICS);
    expect(stepTopic(ids, ALL_TOPICS, -1)).toBe('go');
  });

  it('counts the days the feed reaches back', () => {
    const now = Date.parse('2026-11-10T12:00:00Z');
    expect(feedDays([{ publishedAt: '2026-11-07T12:00:00Z' }, { publishedAt: null }], now)).toBe(3);
    expect(feedDays([], now)).toBe(1);
    const stories = Array.from({ length: 19 }, () => ({ publishedAt: '2026-11-08T12:00:00Z' }));
    expect(feedDays([...stories, { publishedAt: '2022-01-01T00:00:00Z' }], now)).toBe(2);
  });
});

describe('multi-select topics', () => {
  const niches = [{ id: 'ai' }, { id: 'games' }, { id: 'space' }] as never[];
  const all = ['ai', 'games', 'space'];

  it('reads several topics from the URL, in the reader order, ignoring unknown ones', () => {
    expect(topicsFromSearch('?topic=space,ai,nope', niches)).toEqual(['ai', 'space']);
    expect(topicsFromSearch('?topic=ai,games,space', niches)).toEqual([]);
    expect(withTopics('/read', ['ai', 'space'])).toBe('/read?topic=ai%2Cspace');
    expect(withTopics('/read', [])).toBe('/read');
  });

  it('toggles topics; all topics, or every topic ticked, clears the filter', () => {
    expect(toggleTopic([], 'games', all)).toEqual(['games']);
    expect(toggleTopic(['games'], 'ai', all)).toEqual(['ai', 'games']);
    expect(toggleTopic(['ai', 'games'], 'games', all)).toEqual(['ai']);
    expect(toggleTopic(['ai', 'games'], 'space', all)).toEqual([]);
    expect(toggleTopic(['ai'], 'all', all)).toEqual([]);
  });

  it('labels the menu', () => {
    const opts = [{ id: 'ai', label: 'AI' }];
    expect(topicsLabel([], opts)).toBe('All topics');
    expect(topicsLabel(['ai'], opts)).toBe('AI');
    expect(topicsLabel(['ai', 'games'], opts)).toBe('2 topics');
  });
});
