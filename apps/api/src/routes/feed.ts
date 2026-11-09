import { Hono } from 'hono';
import { desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@radar/db';
import type { AppVars, RouteDeps } from '../app.js';
import { parseQuery } from '../http.js';

const FeedQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  niche: z.string().min(1).optional(),
});

export function feedRoutes({ db }: RouteDeps) {
  const r = new Hono<AppVars>();

  r.get('/', async (c) => {
    const { limit, niche } = parseQuery(c, FeedQuery);
    const items = await db
      .select()
      .from(schema.feedItem)
      .where(niche ? sql`${schema.feedItem.nicheIds} @> ARRAY[${niche}]::text[]` : undefined)
      .orderBy(
        sql`${schema.feedItem.publishedAt} desc nulls last`,
        desc(schema.feedItem.keywordScore),
      )
      .limit(limit);
    return c.json({ items });
  });

  return r;
}
