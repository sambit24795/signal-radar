import { Hono } from 'hono';
import { schema } from '@radar/db';
import type { AppVars, RouteDeps } from '../app.js';
import { requireAuth } from '../middleware.js';

/** Stub payment for local development; not mounted when NODE_ENV=production. */
export function devRoutes(deps: RouteDeps) {
  const { db } = deps;
  const r = new Hono<AppVars>();
  r.use('*', requireAuth(deps));

  r.post('/upgrade', async (c) => {
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
    return c.json({ ok: true, plan: 'pro', status: 'active' });
  });

  return r;
}
