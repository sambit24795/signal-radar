import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { NicheSchema } from '@radar/core';
import { schema } from '@radar/db';
import type { AppVars, RouteDeps } from '../app.js';
import { isPro, parseBody } from '../http.js';
import { requireAuth } from '../middleware.js';

const ConfigBody = z.object({
  niches: z.array(NicheSchema).max(20),
  sources: z.array(z.string().min(1)).max(100),
  topN: z.number().int().min(1).max(50),
  telegramChatId: z.string().min(1).nullable(),
  notion: z.object({ token: z.string().min(1), dbId: z.string().min(1) }).nullable(),
});

export function meRoutes(deps: RouteDeps) {
  const { db } = deps;
  const r = new Hono<AppVars>();
  r.use('*', requireAuth(deps));

  r.get('/', async (c) => {
    const u = c.get('user');
    const [sub] = await db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.userId, u.id));
    return c.json({
      user: { id: u.id, name: u.name, email: u.email },
      subscription: sub
        ? {
            plan: sub.plan,
            status: sub.status,
            trialEndsAt: sub.trialEndsAt,
            currentPeriodEnd: sub.currentPeriodEnd,
            isPro: isPro(sub),
          }
        : { plan: 'free', status: 'none', trialEndsAt: null, currentPeriodEnd: null, isPro: false },
    });
  });

  r.get('/config', async (c) => {
    const userId = c.get('user').id;
    await db.insert(schema.userConfig).values({ userId }).onConflictDoNothing();
    const [cfg] = await db
      .select()
      .from(schema.userConfig)
      .where(eq(schema.userConfig.userId, userId));
    return c.json({ config: cfg });
  });

  r.put('/config', async (c) => {
    const userId = c.get('user').id;
    const body = await parseBody(c, ConfigBody);
    const [cfg] = await db
      .insert(schema.userConfig)
      .values({ userId, ...body })
      .onConflictDoUpdate({ target: schema.userConfig.userId, set: body })
      .returning();
    return c.json({ config: cfg });
  });

  return r;
}
