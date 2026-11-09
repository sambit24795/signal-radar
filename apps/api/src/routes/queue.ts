import { Hono } from 'hono';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type QueueStatus } from '@radar/db';
import type { AppVars, RouteDeps } from '../app.js';
import { badRequest, parseQuery } from '../http.js';
import { requireAuth, requirePro } from '../middleware.js';

const PAGE_SIZE = 20;
const QueueQuery = z.object({
  status: z.enum(['new', 'picked', 'skipped']).default('new'),
  cursor: z.string().optional(),
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cursor = base64url("<created_at iso micros>|<id>"); keyset pagination, newest first. */
function decodeCursor(raw: string): { ts: string; id: string } {
  const [ts, id] = Buffer.from(raw, 'base64url').toString().split('|');
  if (!ts || !id || !UUID.test(id) || Number.isNaN(Date.parse(ts)))
    return badRequest('invalid cursor');
  return { ts, id };
}

export function queueRoutes(deps: RouteDeps) {
  const { db } = deps;
  const q = schema.queueItem;
  const r = new Hono<AppVars>();
  r.use('*', requireAuth(deps), requirePro(deps));

  r.get('/', async (c) => {
    const userId = c.get('user').id;
    const { status, cursor } = parseQuery(c, QueueQuery);
    const after = cursor ? decodeCursor(cursor) : undefined;
    const rows = await db
      .select({
        item: q,
        // microsecond-precision text so the cursor round-trips exactly
        ts: sql<string>`to_char(${q.createdAt} at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      })
      .from(q)
      .where(
        and(
          eq(q.userId, userId),
          eq(q.status, status),
          after
            ? sql`(${q.createdAt}, ${q.id}) < (${after.ts}::timestamptz, ${after.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(q.createdAt), desc(q.id))
      .limit(PAGE_SIZE + 1);
    const page = rows.slice(0, PAGE_SIZE);
    const last = page.at(-1);
    const nextCursor =
      rows.length > PAGE_SIZE && last
        ? Buffer.from(`${last.ts}|${last.item.id}`).toString('base64url')
        : null;
    return c.json({ items: page.map((p) => p.item), nextCursor });
  });

  const decide = (status: QueueStatus) => async (c: import('hono').Context<AppVars>) => {
    const id = c.req.param('id') ?? '';
    if (!UUID.test(id)) return c.json({ error: 'not found' }, 404);
    const [row] = await db
      .update(q)
      .set({ status, decidedAt: status === 'new' ? null : new Date() })
      .where(and(eq(q.id, id), eq(q.userId, c.get('user').id)))
      .returning();
    if (!row) return c.json({ error: 'not found' }, 404);
    return c.json({ item: row });
  };

  r.post('/:id/pick', decide('picked'));
  r.post('/:id/skip', decide('skipped'));
  r.post('/:id/reset', decide('new'));

  return r;
}
