import { describe, expect, it } from 'vitest';
import { defineConfig, emptySeen, markSeen, runPipeline, toFeedItem } from '../src/index.js';
import { NOW, fixture, niches, res, routedFetch } from './helpers.js';

const config = defineConfig({
  niches,
  sources: [
    { type: 'hn', keywordSearch: false },
    { type: 'reddit', subreddits: ['SteamDeck'] },
    { type: 'rss', name: 'GamingOnLinux', url: 'https://gol.test/feed', alwaysInclude: true },
    { type: 'rss', name: 'Broken', url: 'https://broken.test/feed' },
  ],
  topN: 10,
});

const fetch = () =>
  routedFetch({
    'hn.algolia.com': () => res(fixture('hn-front.json')),
    'hot.json': () => res('blocked', 403),
    'hot/.rss': () => res(fixture('reddit-hot.rss')),
    'gol.test': () => res(fixture('gol.xml')),
    'broken.test': () => res('err', 500),
  });

describe('runPipeline', () => {
  it('runs end to end offline, survives a broken source, and keeps alwaysInclude items', async () => {
    const out = await runPipeline(config, { seen: emptySeen(), now: NOW, fetch: fetch(), env: {} });
    expect(out.counts.fetched).toBeGreaterThan(10);
    expect(out.counts.afterPrefilter).toBeLessThanOrEqual(out.counts.afterSeen);
    expect(out.items.length).toBeLessThanOrEqual(10);
    expect(out.results.find((r) => r.source.name === 'Broken')?.error).toMatch(/500/);
    // all 6 GamingOnLinux items survive even without keyword hits
    expect(out.results.find((r) => r.source.name === 'GamingOnLinux')?.items).toHaveLength(6);
    const scores = out.items.map((i) => i.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('drops already-seen items', async () => {
    const first = await runPipeline(config, {
      seen: emptySeen(),
      now: NOW,
      fetch: fetch(),
      env: {},
    });
    const seen = markSeen(
      emptySeen(),
      first.items.map((i) => i.id),
      NOW,
    );
    const second = await runPipeline(config, { seen, now: NOW, fetch: fetch(), env: {} });
    const firstIds = new Set(first.items.map((i) => i.id));
    expect(second.items.some((i) => firstIds.has(i.id))).toBe(false);
  });

  it('feed items expose public fields only', async () => {
    const out = await runPipeline(config, { seen: emptySeen(), now: NOW, fetch: fetch(), env: {} });
    const feed = toFeedItem(out.items[0]!);
    expect(Object.keys(feed).sort()).toEqual(
      ['media', 'momentum', 'publishedAt', 'snippet', 'source', 'title', 'url'].filter(
        (k) => k in feed,
      ),
    );
    expect(feed).not.toHaveProperty('score');
    expect(feed).not.toHaveProperty('tags');
  });
});
