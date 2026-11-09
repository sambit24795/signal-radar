import { Hono } from 'hono';
import { and, desc, eq, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@radar/db';
import type { AppVars, RouteDeps } from '../app.js';
import { isPro, parseBody } from '../http.js';
import { requireAuth } from '../middleware.js';

const SubscribeBody = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});
export const MAX_PUSH_SUBSCRIPTIONS = 10;
const UnsubscribeBody = z.object({ endpoint: z.string().url() });

export function pushRoutes(deps: RouteDeps) {
  const { db } = deps;
  const t = schema.pushSubscription;
  const r = new Hono<AppVars>();

  /** Public: the browser needs it before it can subscribe. */
  r.get('/key', (c) => {
    const publicKey = deps.env.VAPID_PUBLIC_KEY;
    if (!publicKey) return c.json({ error: 'push is not configured' }, 404);
    return c.json({ publicKey });
  });

  r.use('*', requireAuth(deps));

  r.post('/subscribe', async (c) => {
    const userId = c.get('user').id;
    const [sub] = await db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.userId, userId));
    if (!isPro(sub)) return c.json({ error: 'Push notifications need Pro' }, 403);
    const { endpoint, keys } = await parseBody(c, SubscribeBody);
    await db
      .insert(t)
      .values({ userId, endpoint, keys })
      .onConflictDoUpdate({ target: t.endpoint, set: { userId, keys } });
    // Keep only the newest MAX_PUSH_SUBSCRIPTIONS; the oldest are dropped.
    const keep = await db
      .select({ id: t.id })
      .from(t)
      .where(eq(t.userId, userId))
      .orderBy(desc(t.createdAt), desc(t.id))
      .limit(MAX_PUSH_SUBSCRIPTIONS);
    await db.delete(t).where(
      and(
        eq(t.userId, userId),
        notInArray(
          t.id,
          keep.map((k) => k.id),
        ),
      ),
    );
    return c.json({ ok: true }, 201);
  });

  r.delete('/subscribe', async (c) => {
    const { endpoint } = await parseBody(c, UnsubscribeBody);
    await db.delete(t).where(and(eq(t.endpoint, endpoint), eq(t.userId, c.get('user').id)));
    return c.json({ ok: true });
  });

  return r;
}
