import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { randomBytes } from 'node:crypto';
import { eq, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import {
  assertPublicUrlSyntax,
  customFeedId,
  fetchPublicText,
  NicheSchema,
  parseFeed,
  parseFeedTitle,
  UnsafeUrlError,
} from '@radar/core';
import { schema } from '@radar/db';
import type { AppVars, RouteDeps } from '../app.js';
import { badRequest, isPro, parseBody } from '../http.js';
import { requireAuth, requirePro } from '../middleware.js';

export const MAX_CUSTOM_FEEDS = 15;
export const TELEGRAM_LINK_TTL_MS = 15 * 60 * 1000;

const CustomFeedSchema = z
  .object({
    /** Optional: assigned from the url when omitted, and must match it when given. */
    id: z.string().optional(),
    url: z.string().max(2000),
    title: z.string().trim().min(1).max(120),
  })
  .superRefine((f, ctx) => {
    try {
      assertPublicUrlSyntax(f.url);
    } catch (e) {
      ctx.addIssue({ code: 'custom', path: ['url'], message: (e as Error).message });
      return;
    }
    if (f.id !== undefined && f.id !== customFeedId(f.url)) {
      ctx.addIssue({ code: 'custom', path: ['id'], message: 'must be custom:<hash of url>' });
    }
  })
  .transform((f) => ({ id: customFeedId(f.url), url: f.url, title: f.title }));

const ConfigBody = z.object({
  niches: z.array(NicheSchema).max(20),
  sources: z.array(z.string().min(1)).max(100),
  topN: z.number().int().min(1).max(50),
  /** Pro only. Omitted keeps the stored feeds. */
  customFeeds: z
    .array(CustomFeedSchema)
    .max(MAX_CUSTOM_FEEDS)
    .refine((fs) => new Set(fs.map((f) => f.id)).size === fs.length, 'duplicate feed URL')
    .optional(),
  /** Omitted keeps the stored chat id (the Telegram connect flow sets it). */
  telegramChatId: z.string().min(1).nullable().optional(),
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

/** The bot can only be connected when it has a token, a public username and a webhook secret. */
export function telegramAvailable(env: RouteDeps['env']): boolean {
  return Boolean(
    env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_BOT_USERNAME && env.TELEGRAM_WEBHOOK_SECRET,
  );
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
    const [cfg] = await db
      .select({ telegramChatId: schema.userConfig.telegramChatId })
      .from(schema.userConfig)
      .where(eq(schema.userConfig.userId, u.id));
    return c.json({
      user: { id: u.id, name: u.name, email: u.email },
      telegramConnected: Boolean(cfg?.telegramChatId),
      telegramAvailable: telegramAvailable(deps.env),
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
    const { notion: notionIn, customFeeds, ...body } = await parseBody(c, ConfigBody);
    if (customFeeds && customFeeds.length > 0) {
      const [sub] = await db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.userId, userId));
      if (!isPro(sub)) return c.json({ error: 'Custom feeds need Pro' }, 402);
    }
    const [existing] = await db
      .select({ notion: schema.userConfig.notion, onboardedAt: schema.userConfig.onboardedAt })
      .from(schema.userConfig)
      .where(eq(schema.userConfig.userId, userId));
    const token = notionIn?.token ?? existing?.notion?.token;
    if (notionIn && !token) return badRequest('notion.token: required the first time');
    const notion = notionIn && token ? { token, dbId: notionIn.dbId } : null;
    // Saving (or skipping) setup counts as onboarding; it is stamped once.
    const onboardedAt = existing?.onboardedAt ?? new Date();
    const values = { ...body, ...(customFeeds ? { customFeeds } : {}), notion, onboardedAt };
    const [cfg] = await db
      .insert(schema.userConfig)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: schema.userConfig.userId, set: values })
      .returning();
    return c.json({ config: cfg && publicConfig(cfg) });
  });

  r.post('/telegram/link', requirePro(deps), async (c) => {
    const username = deps.env.TELEGRAM_BOT_USERNAME;
    if (!telegramAvailable(deps.env) || !username) {
      return c.json({ error: 'Telegram is not configured' }, 503);
    }
    const userId = c.get('user').id;
    const token = randomBytes(24).toString('base64url');
    const t = schema.telegramLink;
    await db.delete(t).where(or(eq(t.userId, userId), lt(t.expiresAt, new Date())));
    await db
      .insert(t)
      .values({ token, userId, expiresAt: new Date(Date.now() + TELEGRAM_LINK_TTL_MS) });
    return c.json({ url: `https://t.me/${username.replace(/^@/, '')}?start=${token}` });
  });

  r.delete('/telegram', async (c) => {
    const userId = c.get('user').id;
    await db
      .update(schema.userConfig)
      .set({ telegramChatId: null })
      .where(eq(schema.userConfig.userId, userId));
    return c.json({ ok: true });
  });

  r.post('/feeds/check', requirePro(deps), async (c) => {
    const { url } = await parseBody(c, z.object({ url: z.string().trim().min(1).max(2000) }));
    const candidate = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
    try {
      const target = assertPublicUrlSyntax(candidate);
      const { text, url: finalUrl } = await fetchPublicText(target.href, {
        ...(deps.net?.fetch ? { fetch: deps.net.fetch } : {}),
        ...(deps.net?.resolve ? { resolve: deps.net.resolve } : {}),
      });
      const items = parseFeed(text);
      if (items.length === 0) return badRequest('No feed items found at that URL');
      const feedTitle = parseFeedTitle(text) ?? new URL(finalUrl).hostname;
      return c.json({
        id: customFeedId(target.href),
        url: target.href,
        title: feedTitle,
        itemCount: items.length,
        sample: items.slice(0, 3).map((i) => i.title),
      });
    } catch (e) {
      if (e instanceof HTTPException) throw e;
      if (e instanceof UnsafeUrlError) return badRequest(e.message);
      return badRequest(`Could not read a feed from that URL: ${(e as Error).message}`);
    }
  });

  return r;
}
