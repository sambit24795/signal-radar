import { HttpError, getJson, getText } from '../http.js';
import type { RawItem, SourceConfig } from '../schema.js';
import { decodeEntities, stripHtml, truncate } from '../text.js';
import { parseFeed } from './rss.js';
import type { BuildOptions, Source, SourceContext } from './types.js';

type RedditConfig = Extract<SourceConfig, { type: 'reddit' }>;

interface Post {
  title: string;
  selftext?: string;
  permalink: string;
  author?: string;
  subreddit?: string;
  score?: number;
  num_comments?: number;
  created_utc?: number;
  stickied?: boolean;
  over_18?: boolean;
  thumbnail?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function parseRedditJson(json: unknown, fallbackSub?: string): RawItem[] {
  const children = (json as { data?: { children?: { data: Post }[] } }).data?.children;
  if (!Array.isArray(children)) throw new Error('unexpected reddit json shape');
  const out: RawItem[] = [];
  for (const { data: p } of children) {
    if (!p?.title || p.stickied || p.over_18) continue;
    const sub = p.subreddit ?? fallbackSub ?? 'reddit';
    const item: RawItem = {
      // Link to the discussion; it's the stable, canonical Reddit URL.
      url: `https://www.reddit.com${p.permalink}`,
      title: decodeEntities(p.title),
      snippet: truncate(stripHtml(p.selftext ?? ''), 400),
      points: p.score ?? 0,
      comments: p.num_comments ?? 0,
      tags: [`r/${sub}`],
      sourceName: `r/${sub}`,
      media: {
        type: 'social',
        ...(p.thumbnail?.startsWith('http') ? { thumbnail: p.thumbnail } : {}),
      },
    };
    if (p.author) item.author = p.author;
    if (p.created_utc) item.publishedAt = p.created_utc * 1000;
    out.push(item);
  }
  return out;
}

/** RSS entries carry `<category term="SteamDeck" label="r/SteamDeck"/>`; use it to name the sub. */
export function parseRedditRss(xml: string, subreddits: string[]): RawItem[] {
  const byLower = new Map(subreddits.map((s) => [s.toLowerCase(), s]));
  return parseFeed(xml, { mediaType: 'social' }).map((it) => {
    const sub = (it.tags ?? []).map((t) => byLower.get(t.toLowerCase())).find(Boolean);
    return sub ? { ...it, sourceName: `r/${sub}`, tags: [`r/${sub}`] } : it;
  });
}

export function createReddit(cfg: RedditConfig, _opts: BuildOptions): Source {
  return {
    id: cfg.id ?? 'reddit',
    name: 'Reddit',
    kind: 'reddit',
    alwaysInclude: cfg.alwaysInclude,
    status: { ok: cfg.enabled, ...(cfg.enabled ? {} : { reason: 'disabled in config' }) },
    async fetch(ctx: SourceContext) {
      const base = `https://www.reddit.com/r/${cfg.subreddits.map(encodeURIComponent).join('+')}/hot`;
      try {
        return parseRedditJson(
          await getJson(ctx.fetch, `${base}.json?limit=${cfg.limit}&raw_json=1`),
        );
      } catch (e) {
        ctx.warn(`reddit: .json failed (${(e as Error).message}), falling back to RSS`);
      }
      const url = `${base}/.rss?limit=${cfg.limit}`;
      let xml: string;
      try {
        xml = await getText(ctx.fetch, url);
      } catch (e) {
        // Unauthenticated Reddit allows ~1 request per window; wait it out once.
        if (!(e instanceof HttpError) || e.status !== 429) throw e;
        await sleep(Math.min(e.retryAfterSec ?? 5, 35) * 1000);
        xml = await getText(ctx.fetch, url);
      }
      return parseRedditRss(xml, cfg.subreddits);
    },
  };
}
