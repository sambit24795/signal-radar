import { Hono } from 'hono';
import { desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { buildSources } from '@radar/core';
import { schema } from '@radar/db';
import radarConfig from '../../../../radar.config.js';
import type { AppVars, RouteDeps } from '../app.js';
import { parseQuery } from '../http.js';

const FeedQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(30),
  niche: z.string().min(1).optional(),
});

/** Default sources for visitors. Niches stay empty: topics belong to the user, never to the owner's config. */
const defaults = {
  niches: [] as never[],
  sources: buildSources(radarConfig.sources, { rsshubBase: radarConfig.rsshubBase })
    .filter((s) => s.status.ok)
    .map((s) => ({ id: s.id, name: s.name, type: s.kind })),
};

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
    c.header('Cache-Control', 'public, max-age=300');
    return c.json({ items });
  });

  r.get('/defaults', (c) => c.json(defaults));

  return r;
}
