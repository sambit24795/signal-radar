import { Hono } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { z } from 'zod';
import {
  createFetch,
  searchAll,
  SEARCH_SOURCES,
  SEARCH_TIMEOUT_MS,
  type Item,
  type SearchSource,
} from '@radar/core';
import type { AppVars, RouteDeps } from '../app.js';
import { parseQuery } from '../http.js';

export const SEARCH_PER_MINUTE = 30;
const CACHE_MS = 10 * 60 * 1000;
const CACHE_MAX = 200;

const Query = z.object({
  q: z.string().trim().min(2).max(100),
  sources: z.string().max(100).optional(),
});

interface Bucket {
  tokens: number;
  at: number;
}

/** In-memory token bucket: `perMinute` requests per key, refilled continuously. */
export function createLimiter(perMinute: number, now: () => number = Date.now) {
  const buckets = new Map<string, Bucket>();
  return (key: string): boolean => {
    const t = now();
    const b = buckets.get(key) ?? { tokens: perMinute, at: t };
    b.tokens = Math.min(perMinute, b.tokens + ((t - b.at) / 60_000) * perMinute);
    b.at = t;
    const ok = b.tokens >= 1;
    if (ok) b.tokens -= 1;
    buckets.set(key, b);
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (t - v.at > 120_000) buckets.delete(k);
    }
    return ok;
  };
}

export function searchRoutes(deps: RouteDeps) {
  const r = new Hono<AppVars>();
  const allow = createLimiter(SEARCH_PER_MINUTE);
  const cache = new Map<string, { at: number; value: { items: Item[]; failed: SearchSource[] } }>();

  r.get('/', async (c) => {
    const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    let ip = forwarded;
    if (!ip) {
      try {
        ip = getConnInfo(c).remote.address;
      } catch {
        /* no socket (tests) */
      }
    }
    if (!allow(ip ?? 'unknown')) {
      return c.json({ error: 'Too many searches. Wait a moment and try again.' }, 429);
    }

    const { q, sources } = parseQuery(c, Query);
    const wanted = sources
      ? ([...new Set(sources.split(',').map((s) => s.trim()))].filter((s) =>
          (SEARCH_SOURCES as readonly string[]).includes(s),
        ) as SearchSource[])
      : [];
    const key = `${q.toLowerCase()}|${[...wanted].sort().join(',')}`;
    const now = Date.now();
    const hit = cache.get(key);
    c.header('Cache-Control', 'no-store');
    if (hit && now - hit.at < CACHE_MS) return c.json({ ...hit.value, cached: true });

    const value = await searchAll(q, {
      fetch: deps.net?.fetch ?? createFetch(SEARCH_TIMEOUT_MS),
      env: process.env,
      ...(wanted.length ? { sources: wanted } : {}),
    });
    // A search where every source failed is not worth remembering.
    const names = wanted.length ? wanted.length : SEARCH_SOURCES.length;
    if (value.failed.length < names) {
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
      cache.set(key, { at: now, value });
    }
    return c.json({ ...value, cached: false });
  });

  return r;
}
