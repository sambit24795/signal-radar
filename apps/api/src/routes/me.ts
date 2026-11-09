import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { NicheSchema } from '@radar/core';
import { schema } from '@radar/db';
import type { AppVars, RouteDeps } from '../app.js';
import { badRequest, isPro, parseBody } from '../http.js';
import { requireAuth } from '../middleware.js';

const ConfigBody = z.object({
  niches: z.array(NicheSchema).max(20),
  sources: z.array(z.string().min(1)).max(100),
  topN: z.number().int().min(1).max(50),
  telegramChatId: z.string().min(1).nullable(),
  /** `token` may be omitted to keep the stored one. */
  notion: z.object({ token: z.string().min(1).optional(), dbId: z.string().min(1) }).nullable(),
});

/** The Notion token is write-only: responses say whether one is stored, never what it is. */
function publicConfig(cfg: typeof schema.userConfig.$inferSelect) {
  const { notion, ...rest } = cfg;
  return {
    ...rest,
    notion: notion ? { dbId: notion.dbId, hasToken: Boolean(notion.token) } : null,
  };
}

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
    return c.json({ config: cfg && publicConfig(cfg) });
  });

  r.put('/config', async (c) => {
    const userId = c.get('user').id;
    const { notion: notionIn, ...body } = await parseBody(c, ConfigBody);
    const [existing] = await db
      .select({ notion: schema.userConfig.notion })
      .from(schema.userConfig)
      .where(eq(schema.userConfig.userId, userId));
    const token = notionIn?.token ?? existing?.notion?.token;
    if (notionIn && !token) return badRequest('notion.token: required the first time');
    const notion = notionIn && token ? { token, dbId: notionIn.dbId } : null;
    const values = { ...body, notion };
    const [cfg] = await db
      .insert(schema.userConfig)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: schema.userConfig.userId, set: values })
      .returning();
    return c.json({ config: cfg && publicConfig(cfg) });
  });

  return r;
}
