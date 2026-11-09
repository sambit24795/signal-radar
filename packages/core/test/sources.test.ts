import { describe, expect, it } from 'vitest';
import {
  buildSource,
  fetchAll,
  parseFeed,
  parseDevto,
  parseGithub,
  parseHn,
  parseLobsters,
  parseMastodonLinks,
  parseRedditJson,
  resolveFeedUrl,
} from '../src/index.js';
import { SourceConfigSchema } from '../src/schema.js';
import { fixture, makeCtx, res, routedFetch } from './helpers.js';

const cfg = (c: unknown) => SourceConfigSchema.parse(c);

describe('hacker news', () => {
  it('parses Algolia hits with points, comments and an HN fallback URL', () => {
    const items = parseHn(JSON.parse(fixture('hn-front.json')));
    expect(items.length).toBeGreaterThan(3);
    const first = items[0]!;
    expect(first.url).toMatch(/^https?:\/\//);
    expect(first.points).toBeGreaterThan(0);
    expect(first.publishedAt).toBeTypeOf('number');
    expect(
      parseHn({
        hits: [{ objectID: '42', title: 'Ask HN: x', story_text: '<p>hi &amp; bye</p>' }],
      }),
    ).toMatchObject([{ url: 'https://news.ycombinator.com/item?id=42', snippet: 'hi & bye' }]);
  });

  it('fetches front page + one keyword query per niche, deduping repeated URLs', async () => {
    const fetch = routedFetch({ 'hn.algolia.com': () => res(fixture('hn-front.json')) });
    const src = buildSource(cfg({ type: 'hn' }), {});
    const items = await src.fetch(makeCtx(fetch));
    expect(fetch.calls).toHaveLength(3); // front page + 2 niches
    expect(fetch.calls.some((u) => u.includes('tags=front_page'))).toBe(true);
    expect(fetch.calls.some((u) => u.includes('optionalWords'))).toBe(true);
    expect(new Set(items.map((i) => i.url)).size).toBe(items.length);
  });
});

describe('reddit', () => {
  it('parses the .json listing, skipping stickied posts', () => {
    const items = parseRedditJson(JSON.parse(fixture('reddit-hot.json')));
    expect(items.map((i) => i.title)).toEqual([
      'Steam Deck OLED runs Xenia at 30fps now',
      'EmuDeck 3.0 released',
    ]);
    expect(items[0]).toMatchObject({ points: 1520, comments: 210, sourceName: 'r/SteamDeck' });
  });

  it('uses .json when it works', async () => {
    const fetch = routedFetch({ 'hot.json': () => res(fixture('reddit-hot.json')) });
    const src = buildSource(cfg({ type: 'reddit', subreddits: ['SteamDeck', 'emulation'] }), {});
    const items = await src.fetch(makeCtx(fetch));
    expect(items).toHaveLength(2);
    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0]).toContain('/r/SteamDeck+emulation/hot.json');
  });

  it('falls back to RSS on 403 (and on an HTML body)', async () => {
    for (const jsonRes of [() => res('<html>blocked</html>', 403), () => res('<html>ok?</html>')]) {
      const fetch = routedFetch({
        'hot.json': jsonRes,
        'hot/.rss': () => res(fixture('reddit-hot.rss')),
      });
      const ctx = makeCtx(fetch);
      const items = await buildSource(cfg({ type: 'reddit', subreddits: ['SteamDeck'] }), {}).fetch(
        ctx,
      );
      expect(items.length).toBeGreaterThan(3);
      expect(items[0]).toMatchObject({ sourceName: 'r/SteamDeck', media: { type: 'social' } });
      expect(items[0]?.url).toContain('reddit.com/r/SteamDeck/comments/');
      expect(ctx.warnings.join()).toContain('falling back to RSS');
    }
  });

  it('retries RSS once after a 429', async () => {
    let n = 0;
    const fetch = routedFetch({
      'hot.json': () => res('no', 403),
      'hot/.rss': () =>
        n++ === 0
          ? res('slow down', 429, { 'retry-after': '0.001' })
          : res(fixture('reddit-hot.rss')),
    });
    const items = await buildSource(cfg({ type: 'reddit', subreddits: ['SteamDeck'] }), {}).fetch(
      makeCtx(fetch),
    );
    expect(items.length).toBeGreaterThan(0);
  });
});

describe('github', () => {
  it('parses repo search results into star-based items', () => {
    const items = parseGithub(JSON.parse(fixture('github-search.json')));
    expect(items.length).toBeGreaterThan(2);
    expect(items[0]).toMatchObject({ media: { type: 'repo' } });
    expect(items[0]?.stars).toBeGreaterThan(0);
    expect(items[0]?.url).toMatch(/^https:\/\/github\.com\//);
  });

  it('queries one topic at a time, sends the token when set, and tolerates partial failure', async () => {
    let n = 0;
    const seenAuth: (string | undefined)[] = [];
    const fetch = async (url: string, init?: RequestInit) => {
      seenAuth.push((init?.headers as Record<string, string>)?.['authorization']);
      return n++ === 0 ? res('rate limited', 403) : res(fixture('github-search.json'));
    };
    const ctx = makeCtx(fetch, { env: { GITHUB_TOKEN: 'tok' } });
    const items = await buildSource(cfg({ type: 'github', topics: ['llm', 'neovim'] }), {}).fetch(
      ctx,
    );
    expect(items.length).toBeGreaterThan(0);
    expect(seenAuth).toEqual(['Bearer tok', 'Bearer tok']);
    expect(ctx.warnings).toHaveLength(1);
  });
});

describe('rss / atom', () => {
  it('parses an RSS 2.0 blog feed (GamingOnLinux)', () => {
    const items = parseFeed(fixture('gol.xml'));
    expect(items).toHaveLength(6);
    expect(items[0]?.title).toBeTruthy();
    expect(items[0]?.url).toMatch(/^https?:\/\//);
    expect(items[0]?.publishedAt).toBeTruthy();
    expect(items[0]?.snippet).not.toMatch(/<[a-z]/i);
  });

  it('parses an Atom news feed (The Verge)', () => {
    const items = parseFeed(fixture('verge.xml'));
    expect(items).toHaveLength(6);
    expect(items[0]?.url).toMatch(/theverge\.com/);
    expect(items[0]?.author).toBeTruthy();
  });

  it('parses a Google News search feed', () => {
    const items = parseFeed(fixture('gnews.xml'));
    expect(items).toHaveLength(6);
    expect(items[0]?.url).toMatch(/^https:\/\/news\.google\.com\//);
  });

  it('parses GitHub releases.atom', () => {
    const items = parseFeed(fixture('releases.atom'));
    expect(items).toHaveLength(5);
    expect(items[0]?.url).toContain('github.com/neovim/neovim/releases/tag/');
  });

  it('parses a YouTube channel feed and marks /shorts/ links as short', () => {
    const items = parseFeed(fixture('yt.xml'));
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: 'New TypeScript tool in 100 seconds',
      author: 'Fireship',
      media: { type: 'video', thumbnail: 'https://i2.ytimg.com/vi/AAAAAAAAAAA/hqdefault.jpg' },
      snippet: 'A quick look at a new TypeScript dev tool.',
    });
    expect(items[1]?.media?.type).toBe('short');
    expect(items[1]?.url).toContain('/shorts/');
  });

  it('applies the mediaType override from config', () => {
    const items = parseFeed(fixture('gol.xml'), { mediaType: 'social' });
    expect(items[0]?.media?.type).toBe('social');
  });

  it('resolves rsshub: sources against rsshubBase, and disables them when it is unset', async () => {
    expect(resolveFeedUrl('rsshub:/twitter/user/x', 'http://localhost:1200/')).toBe(
      'http://localhost:1200/twitter/user/x',
    );
    expect(resolveFeedUrl('rsshub:/twitter/user/x')).toBeNull();
    const c = cfg({ type: 'rss', name: 'X', url: 'rsshub:/twitter/user/x' });
    expect(buildSource(c, {}).status).toEqual({ ok: false, reason: 'needs rsshubBase (unset)' });

    const fetch = routedFetch({ 'localhost:1200': () => res(fixture('gol.xml')) });
    const src = buildSource(c, { rsshubBase: 'http://localhost:1200' });
    expect(src.status.ok).toBe(true);
    expect(await src.fetch(makeCtx(fetch))).toHaveLength(6);
    expect(fetch.calls[0]).toBe('http://localhost:1200/twitter/user/x');
  });
});

describe('youtube feed flakiness', () => {
  it('retries a 404 once, then succeeds', async () => {
    let n = 0;
    const f = routedFetch({
      'youtube.com/feeds': () => (n++ === 0 ? res('nf', 404) : res(fixture('yt.xml'))),
    });
    const src = buildSource(
      cfg({
        type: 'rss',
        name: 'YT',
        url: 'https://www.youtube.com/feeds/videos.xml?channel_id=X',
      }),
      {},
    );
    expect((await src.fetch(makeCtx(f))).length).toBeGreaterThan(0);
    expect(f.calls).toHaveLength(2);
  });

  it('does not retry 404s on other hosts', async () => {
    const f = routedFetch({ 'other.test': () => res('nf', 404) });
    const src = buildSource(cfg({ type: 'rss', name: 'O', url: 'https://other.test/feed' }), {});
    await expect(src.fetch(makeCtx(f))).rejects.toThrow(/404/);
    expect(f.calls).toHaveLength(1);
  });
});

describe('lobsters', () => {
  it('parses hottest.json with score, comments and tags', async () => {
    const items = parseLobsters(JSON.parse(fixture('lobsters-hottest.json')));
    expect(items.length).toBeGreaterThan(3);
    expect(items[0]).toMatchObject({ points: expect.any(Number), comments: expect.any(Number) });
    expect(items[0]!.tags!.length).toBeGreaterThan(0);
    expect(
      parseLobsters([
        { title: 'Ask', url: '', comments_url: 'https://lobste.rs/s/x/ask', score: 3 },
      ]),
    ).toMatchObject([{ url: 'https://lobste.rs/s/x/ask' }]);
    const fetch = routedFetch({ 'lobste.rs': () => res(fixture('lobsters-hottest.json')) });
    const src = buildSource(cfg({ type: 'lobsters' }), {});
    expect(src.kind).toBe('lobsters');
    expect((await src.fetch(makeCtx(fetch))).length).toBe(items.length);
  });
});

describe('dev community', () => {
  it('parses articles with reactions, comments and tag_list', async () => {
    const items = parseDevto(JSON.parse(fixture('devto-top.json')));
    expect(items.length).toBeGreaterThan(3);
    expect(items[0]).toMatchObject({ points: expect.any(Number), author: expect.any(String) });
    expect(items[0]!.tags!.length).toBeGreaterThan(0);
    const fetch = routedFetch({ 'dev.to/api': () => res(fixture('devto-top.json')) });
    const src = buildSource(cfg({ type: 'devto' }), {});
    expect(src.kind).toBe('devto');
    await src.fetch(makeCtx(fetch));
    expect(fetch.calls[0]).toContain('top=1&per_page=30');
  });
});

describe('mastodon trending links', () => {
  it('uses the latest active day of history as momentum', async () => {
    const items = parseMastodonLinks(JSON.parse(fixture('mastodon-links.json')));
    expect(items.length).toBeGreaterThan(3);
    expect(items[0]!.points).toBeGreaterThan(0);
    expect(
      parseMastodonLinks([
        {
          url: 'https://a.example/x',
          title: 'x',
          history: [
            { day: '2', accounts: '0', uses: '0' },
            { day: '1', accounts: '7', uses: '9' },
          ],
        },
      ]),
    ).toMatchObject([{ points: 7, comments: 9 }]);
    const fetch = routedFetch({ 'mastodon.social': () => res(fixture('mastodon-links.json')) });
    const src = buildSource(cfg({ type: 'mastodon' }), {});
    expect(src.kind).toBe('mastodon');
    await src.fetch(makeCtx(fetch));
    expect(fetch.calls[0]).toContain('/api/v1/trends/links?limit=20');
  });
});

describe('product hunt and youtube kinds', () => {
  it('parses the Product Hunt Atom feed through the rss fetcher', () => {
    const items = parseFeed(fixture('producthunt.atom'));
    expect(items.length).toBeGreaterThan(2);
    expect(items[0]!.url).toMatch(/^https:\/\/www\.producthunt\.com\//);
    expect(items[0]!.snippet).not.toMatch(/</);
    const src = buildSource(
      cfg({ type: 'rss', name: 'Product Hunt', url: 'https://www.producthunt.com/feed' }),
      {},
    );
    expect(src).toMatchObject({ id: 'rss:product-hunt', kind: 'rss' });
  });

  it('gives YouTube channel feeds their own kind', () => {
    const yt = buildSource(
      cfg({
        type: 'rss',
        name: 'Fireship (YouTube)',
        url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC1',
      }),
      {},
    );
    expect(yt.kind).toBe('youtube');
    const other = buildSource(
      cfg({ type: 'rss', name: 'Verge', url: 'https://www.theverge.com/rss/index.xml' }),
      {},
    );
    expect(other.kind).toBe('rss');
  });
});

describe('graceful failure', () => {
  it('turns throwing, erroring and disabled sources into warnings and empty results', async () => {
    const fetch = routedFetch({
      ok: () => res(fixture('gol.xml')),
      boom: () => res('nope', 500),
    });
    const sources = [
      buildSource(cfg({ type: 'rss', name: 'Good', url: 'https://x.test/ok' }), {}),
      buildSource(cfg({ type: 'rss', name: 'Bad', url: 'https://x.test/boom' }), {}),
      buildSource(cfg({ type: 'rss', name: 'Unrouted', url: 'https://x.test/unrouted' }), {}),
      buildSource(cfg({ type: 'rss', name: 'Off', url: 'https://x.test/ok', enabled: false }), {}),
    ];
    const ctx = makeCtx(fetch);
    const results = await fetchAll(sources, ctx, { concurrency: 2, timeoutMs: 1000 });
    expect(results.map((r) => r.items.length)).toEqual([6, 0, 0, 0]);
    expect(results.map((r) => Boolean(r.error))).toEqual([false, true, true, true]);
    expect(results[3]?.skipped).toBe(true);
    expect(ctx.warnings).toHaveLength(2);
  });

  it('times out a hung source', async () => {
    const hang = buildSource(cfg({ type: 'rss', name: 'Hang', url: 'https://x.test/hang' }), {});
    const ctx = makeCtx(() => new Promise<Response>(() => {}));
    const [r] = await fetchAll([hang], ctx, { concurrency: 1, timeoutMs: 10 });
    expect(r?.error).toMatch(/timed out/);
  });
});
