import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { eq } from 'drizzle-orm';
import { schema } from '@radar/db';
import type { AppVars, RouteDeps } from '../app.js';
import { requireAuth } from '../middleware.js';

/** Billing endpoints. `stub` upgrades immediately; the real provider arrives in phase 5. */
export function billingRoutes(deps: RouteDeps) {
  const { db, env } = deps;
  const r = new Hono<AppVars>();
  r.use('*', requireAuth(deps));

  r.post('/checkout', async (c) => {
    if (env.PAYMENTS_PROVIDER !== 'stub') {
      throw new HTTPException(501, { message: 'checkout not implemented for this provider' });
    }
    const userId = c.get('user').id;
    const set = {
      plan: 'pro',
      status: 'active',
      provider: 'stub',
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    } as const;
    await db
      .insert(schema.subscription)
      .values({ userId, ...set })
      .onConflictDoUpdate({ target: schema.subscription.userId, set });
    return c.json({ url: null, upgraded: true });
  });

  r.post('/cancel', async (c) => {
    if (env.PAYMENTS_PROVIDER !== 'stub') {
      throw new HTTPException(501, { message: 'cancel not implemented for this provider' });
    }
    const userId = c.get('user').id;
    const [sub] = await db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.userId, userId));
    if (!sub || sub.plan !== 'pro' || sub.status !== 'active') {
      throw new HTTPException(409, { message: 'no active subscription to cancel' });
    }
    await db
      .update(schema.subscription)
      .set({ status: 'canceled' })
      .where(eq(schema.subscription.userId, userId));
    return c.json({ ok: true, status: 'canceled', accessUntil: sub.currentPeriodEnd });
  });

  return r;
}
