import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@radar/db';
import type { AppVars, RouteDeps } from '../app.js';
import { parseBody } from '../http.js';
import { requireAuth } from '../middleware.js';

const SubscribeBody = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});
const UnsubscribeBody = z.object({ endpoint: z.string().url() });

export function pushRoutes(deps: RouteDeps) {
  const { db } = deps;
  const t = schema.pushSubscription;
  const r = new Hono<AppVars>();
  r.use('*', requireAuth(deps));

  r.post('/subscribe', async (c) => {
    const { endpoint, keys } = await parseBody(c, SubscribeBody);
    await db
      .insert(t)
      .values({ userId: c.get('user').id, endpoint, keys })
      .onConflictDoUpdate({ target: t.endpoint, set: { userId: c.get('user').id, keys } });
    return c.json({ ok: true }, 201);
  });

  r.delete('/subscribe', async (c) => {
    const { endpoint } = await parseBody(c, UnsubscribeBody);
    await db.delete(t).where(and(eq(t.endpoint, endpoint), eq(t.userId, c.get('user').id)));
    return c.json({ ok: true });
  });

  return r;
}
