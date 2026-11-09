import { describe, expect, it } from 'vitest';
import { normalizeItem } from '../src/normalize.js';
import { prefilter } from '../src/prefilter.js';
import { rank, rankScore } from '../src/rank.js';
import { NOW, niches } from './helpers.js';

const mk = (title: string, snippet = '', extra: { points?: number; ageH?: number } = {}) =>
  normalizeItem(
    {
      url: `https://x.com/${encodeURIComponent(title)}`,
      title,
      snippet,
      points: extra.points,
      publishedAt: new Date(NOW.getTime() - (extra.ageH ?? 1) * 3_600_000),
    },
    { name: 'S', kind: 'hn' },
    NOW,
  )!;

describe('prefilter', () => {
  it('drops zero-hit items and keeps hits', () => {
    const out = prefilter([mk('Cooking pasta at home'), mk('Claude ships a new agent')], niches);
    expect(out.map((o) => o.item.title)).toEqual(['Claude ships a new agent']);
    expect(out[0]?.niches).toEqual(['ai']);
  });

  it('keeps zero-hit items from alwaysInclude sources', () => {
    const out = prefilter([mk('Cooking pasta at home')], niches, () => true);
    expect(out).toHaveLength(1);
    expect(out[0]?.keywordScore).toBe(0);
  });

  it('weights title hits above body hits and applies keyword weights', () => {
    const [title] = prefilter([mk('Xenia update')], niches);
    const [body] = prefilter([mk('An update', 'about xenia')], niches);
    expect(title?.keywordScore).toBe(6); // 3 (title) * weight 2
    expect(body?.keywordScore).toBe(2); // 1 (body) * weight 2
  });

  it('matches whole words only and is case-insensitive', () => {
    expect(prefilter([mk('Pagentry and agentic')], niches)).toHaveLength(0);
    expect(prefilter([mk('New LLMs everywhere')], niches)).toHaveLength(1);
    expect(prefilter([mk('STEAM DECK news')], niches)).toHaveLength(1);
  });

  it('counts hits across niches', () => {
    const [m] = prefilter([mk('Claude agent on the Steam Deck')], niches);
    expect(m?.niches).toEqual(['ai', 'handheld']);
    expect(m?.keywordScore).toBe(9);
  });
});

describe('rank', () => {
  it('orders by combined keyword + momentum score and honours topN', () => {
    const items = prefilter(
      [
        mk('Claude agent', '', { points: 10, ageH: 10 }),
        mk('Claude agent news', '', { points: 900, ageH: 3 }),
        mk('OpenAI llm', '', { points: 0 }),
      ],
      niches,
    );
    const ranked = rank(items, 2);
    expect(ranked).toHaveLength(2);
    expect(ranked[0]?.title).toBe('Claude agent news');
    expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score ?? Infinity);
  });

  it('rankScore grows with both inputs', () => {
    expect(rankScore(3, 10)).toBeGreaterThan(rankScore(3, 1));
    expect(rankScore(6, 1)).toBeGreaterThan(rankScore(3, 1));
  });

  it('computes perHour from points and age (floored at 1h)', () => {
    expect(mk('a b c', '', { points: 100, ageH: 10 }).momentum.perHour).toBe(10);
    expect(mk('a b d', '', { points: 100, ageH: 0.1 }).momentum.perHour).toBe(100);
  });
});
