import { Hono } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { z } from 'zod';
import {
  createFetch,
  fetchTopicSources,
  findSubreddits,
  topicSourceKey,
  TopicSourceSchema,
  SEARCH_TIMEOUT_MS,
  type Item,
  type TopicSource,
} from '@radar/core';
import type { AppVars, RouteDeps } from '../app.js';
import { parseBody } from '../http.js';
import { createLimiter } from './search.js';

export const TOPICS_PER_MINUTE = 40;
const FEED_TTL_MS = 15 * 60 * 1000;
const SUBS_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 500;
const REDDIT_BACKOFF_MS = 45_000;
/** All topics at once: 20 topics with up to 3 sources each. */
const MAX_SOURCES = 60;

const SourcesBody = z.object({ name: z.string().trim().min(1).max(60) });
const FeedBody = z.object({ sources: z.array(TopicSourceSchema).max(MAX_SOURCES) });

/** Topic sources are fixed-host feeds built from validated values, so anyone can ask; it is cached and rate limited. */
export function topicRoutes(deps: RouteDeps) {
  const r = new Hono<AppVars>();
  const allow = createLimiter(TOPICS_PER_MINUTE);
  const fetchFn = deps.net?.fetch ?? createFetch(SEARCH_TIMEOUT_MS);
  const feedCache = new Map<string, { at: number; items: Item[] }>();
  const subsCache = new Map<string, { at: number; subs: TopicSource[] }>();
  // Keyless Reddit answers about one request a minute; after a refusal, stop asking for a while.
  let redditBlockedUntil = 0;
  const redditOpen = () => Date.now() >= redditBlockedUntil;
  const blockReddit = () => {
    redditBlockedUntil = Date.now() + REDDIT_BACKOFF_MS;
  };

  const limited = (c: Parameters<typeof getConnInfo>[0]): boolean => {
    let ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    if (!ip) {
      try {
        ip = getConnInfo(c).remote.address;
      } catch {
        /* no socket (tests) */
      }
    }
    return !allow(ip ?? 'unknown');
  };
  const remember = <T>(m: Map<string, T>, key: string, v: T) => {
    if (m.size >= CACHE_MAX) m.delete(m.keys().next().value!);
    m.set(key, v);
  };

  /** Up to two subreddits for a topic name. `available` is false when Reddit would not answer. */
  r.post('/sources', async (c) => {
    if (limited(c))
      return c.json({ error: 'Too many requests. Wait a moment and try again.' }, 429);
    const { name } = await parseBody(c, SourcesBody);
    const key = name.toLowerCase();
    const hit = subsCache.get(key);
    if (hit && Date.now() - hit.at < SUBS_TTL_MS)
      return c.json({ reddit: hit.subs, available: true });
    if (!redditOpen()) return c.json({ reddit: [], available: false });
    try {
      const subs = await findSubreddits(name, fetchFn);
      remember(subsCache, key, { at: Date.now(), subs });
      return c.json({ reddit: subs, available: true });
    } catch {
      blockReddit();
      return c.json({ reddit: [], available: false });
    }
  });

  /** Live items for the given topic sources, one entry per source. A source that failed is listed in `failed`. */
  r.post('/feed', async (c) => {
    if (limited(c))
      return c.json({ error: 'Too many requests. Wait a moment and try again.' }, 429);
    const { sources } = await parseBody(c, FeedBody);
    const now = Date.now();
    const distinct = new Map(sources.map((s) => [topicSourceKey(s), s]));
    const results: { source: TopicSource; items: Item[] }[] = [];
    const missing: TopicSource[] = [];
    for (const [key, source] of distinct) {
      const hit = feedCache.get(key);
      if (hit && now - hit.at < FEED_TTL_MS) results.push({ source, items: hit.items });
      else missing.push(source);
    }
    // While Reddit is refusing, do not ask it again; whatever was cached for it is served stale.
    const askable = redditOpen() ? missing : missing.filter((s) => s.type !== 'reddit');
    const fresh = await fetchTopicSources(askable, fetchFn, new Date(now));
    if (fresh.failed.some((k) => k.startsWith('reddit:'))) blockReddit();
    const failed: string[] = [];
    for (const source of missing) {
      const key = topicSourceKey(source);
      const items = fresh.items.get(key);
      if (items) remember(feedCache, key, { at: now, items });
      const use = items ?? feedCache.get(key)?.items;
      if (use) results.push({ source, items: use });
      else failed.push(key);
    }
    c.header('Cache-Control', 'no-store');
    return c.json({ results, failed });
  });

  return r;
}
