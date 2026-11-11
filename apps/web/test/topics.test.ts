import { describe, expect, it } from 'vitest';
import type { Niche } from '@radar/core/ranking';
import { MAX_NICHES } from '../src/lib/presets';
import { rankFeed } from '../src/lib/rankClient';
import { addTopicFromQuery, findTopic, titleCase } from '../src/lib/topics';
import { buildTopicItems, planTopicSources } from '../src/lib/topicItems';

const ai: Niche = {
  id: 'ai',
  name: 'AI',
  weight: 1,
  keywords: ['llm', { term: 'Claude', weight: 2 }],
};

describe('add a topic from search', () => {
  it('title-cases the query', () => {
    expect(titleCase('  fashion  ')).toBe('Fashion');
    expect(titleCase('web3 DESIGN')).toBe('Web3 Design');
  });

  it('matches a topic by name or keyword, ignoring case and accents', () => {
    expect(findTopic([ai], 'ai')?.id).toBe('ai');
    expect(findTopic([ai], 'CLAUDE')?.id).toBe('ai');
    expect(findTopic([ai], ' llm ')?.id).toBe('ai');
    expect(findTopic([ai], 'fashion')).toBeUndefined();
    expect(findTopic([{ ...ai, name: 'Café' }], 'cafe')?.id).toBe('ai');
  });

  it('adds a topic named after the query with the query as keyword', () => {
    const res = addTopicFromQuery([ai], 'fashion');
    expect(res.kind).toBe('added');
    if (res.kind !== 'added') return;
    expect(res.niches).toHaveLength(2);
    expect(res.niche).toMatchObject({ name: 'Fashion', keywords: ['fashion'], weight: 1 });
    expect(res.niche.id).not.toBe('ai');
    expect(res.niche.sources).toBeUndefined();
  });

  it('does not add a topic twice, or past the cap, or from nothing', () => {
    expect(addTopicFromQuery([ai], 'Claude').kind).toBe('exists');
    const full = Array.from({ length: MAX_NICHES }, (_, i) => ({
      ...ai,
      id: `t${i}`,
      name: `T${i}`,
      keywords: [`k${i}`],
    }));
    expect(addTopicFromQuery(full, 'fashion').kind).toBe('full');
    expect(addTopicFromQuery([], '   ').kind).toBe('empty');
  });
});

describe('topic items on Read', () => {
  const fashion: Niche = {
    id: 'f',
    name: 'Fashion',
    weight: 1,
    keywords: ['fashion'],
    sources: [
      { type: 'news', query: 'Fashion' },
      { type: 'reddit', sub: 'fashion' },
    ],
  };
  const item = (url: string, title: string, kind: 'rss' | 'reddit' = 'rss') => ({
    id: url,
    url,
    title,
    snippet: '',
    source: kind === 'rss' ? 'Vogue' : 'r/fashion',
    sourceKind: kind,
    momentum: { perHour: 0 },
    tags: [],
    media: { type: 'article' as const },
  });

  it('plans each distinct source once, with the topics that read from it', () => {
    const other: Niche = {
      ...fashion,
      id: 'g',
      name: 'Style',
      sources: [{ type: 'news', query: 'fashion' }],
    };
    const plan = planTopicSources([fashion, other, ai]);
    expect(plan.sources.map((s) => s.type)).toEqual(['news', 'reddit', 'news']);
    expect(plan.byKey.get('news:fashion')).toEqual(['f', 'g']);
    expect(plan.byKey.get('reddit:fashion')).toEqual(['f']);
  });

  it('removing a topic leaves none of its sources in the plan', () => {
    expect(planTopicSources([ai]).sources).toEqual([
      { type: 'news', query: 'AI OR llm OR Claude' },
    ]);
  });

  it('merges results per url and keeps a topic item without a keyword hit', () => {
    const plan = planTopicSources([fashion]);
    const topic = buildTopicItems(
      {
        failed: [],
        results: [
          { source: plan.sources[0]!, items: [item('https://n/1', 'Paris week opens')] },
          {
            source: plan.sources[1]!,
            items: [
              item('https://n/1', 'Paris week opens'),
              item('https://r/2', 'Fashion thread', 'reddit'),
            ],
          },
        ],
      },
      plan.byKey,
    );
    expect(topic.items).toHaveLength(2);
    expect(topic.owners.get('https://n/1')).toEqual(['f']);
    const ranked = rankFeed([], [fashion], { sources: [], topic });
    // "Paris week opens" has no keyword hit, yet it belongs to Fashion; the source filter does not apply.
    expect(ranked.map((r) => r.title).sort()).toEqual(['Fashion thread', 'Paris week opens']);
    expect(ranked.every((r) => r.niches.includes('f'))).toBe(true);
  });

  it('drops topic items of a topic that was removed', () => {
    const plan = planTopicSources([fashion]);
    const topic = buildTopicItems(
      {
        failed: [],
        results: [{ source: plan.sources[0]!, items: [item('https://n/1', 'Paris week opens')] }],
      },
      plan.byKey,
    );
    expect(rankFeed([], [ai], { sources: [], topic })).toEqual([]);
  });
});
