import { createHash, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { and, eq, gt, ne } from 'drizzle-orm';
import { z } from 'zod';
import { createFetch, sendMessage } from '@radar/core';
import { schema } from '@radar/db';
import type { AppVars, RouteDeps } from '../app.js';

const Update = z.object({
  message: z
    .object({
      text: z.string().optional(),
      chat: z.object({ id: z.union([z.number(), z.string()]), type: z.string() }),
    })
    .optional(),
});

const START = /^\/start(?:@\w+)?(?:\s+(\S+))?\s*$/;
const STOP = /^\/stop(?:@\w+)?\s*$/;

const HELP =
  'Signal Radar sends your digest here. To connect, open Settings -> Notifications in the app and tap Connect Telegram.';
const BAD_LINK =
  'That link has expired or was already used. Open Settings -> Notifications in the app and tap Connect Telegram for a new one.';
const CONNECTED = 'Connected. Your Signal Radar digest will arrive here after each run.';

/** Constant-time string compare (hashing equalises the lengths). */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function telegramRoutes(deps: RouteDeps) {
  const { db, env } = deps;
  const r = new Hono<AppVars>();
  const fetchFn = deps.net?.fetch ?? createFetch(10_000);

  r.post('/webhook', async (c) => {
    const secret = env.TELEGRAM_WEBHOOK_SECRET;
    if (!secret) return c.json({ error: 'not found' }, 404);
    const given = c.req.header('x-telegram-bot-api-secret-token') ?? '';
    if (!safeEqual(given, secret)) return c.json({ error: 'forbidden' }, 401);

    // Always answer 200 from here on so Telegram does not retry.
    const parsed = Update.safeParse(await c.req.json().catch(() => null));
    const msg = parsed.success ? parsed.data.message : undefined;
    const text = msg?.text?.trim();
    if (!msg || !text || msg.chat.type !== 'private') return c.json({ ok: true });
    const chatId = String(msg.chat.id);

    const reply = async (t: string) => {
      const token = env.TELEGRAM_BOT_TOKEN;
      if (!token) return;
      try {
        await sendMessage(fetchFn, token, chatId, t);
      } catch (e) {
        console.error(`telegram reply failed: ${(e as Error).message}`);
      }
    };

    const start = START.exec(text);
    if (start) {
      const token = start[1];
      if (!token) {
        await reply(HELP);
        return c.json({ ok: true });
      }
      const link = schema.telegramLink;
      const [row] = await db
        .delete(link)
        .where(and(eq(link.token, token), gt(link.expiresAt, new Date())))
        .returning({ userId: link.userId });
      if (!row) {
        await reply(BAD_LINK);
        return c.json({ ok: true });
      }
      const cfg = schema.userConfig;
      // One chat belongs to one account.
      await db
        .update(cfg)
        .set({ telegramChatId: null })
        .where(and(eq(cfg.telegramChatId, chatId), ne(cfg.userId, row.userId)));
      await db
        .insert(cfg)
        .values({ userId: row.userId, telegramChatId: chatId })
        .onConflictDoUpdate({ target: cfg.userId, set: { telegramChatId: chatId } });
      await reply(CONNECTED);
      return c.json({ ok: true });
    }

    if (STOP.test(text)) {
      await db
        .update(schema.userConfig)
        .set({ telegramChatId: null })
        .where(eq(schema.userConfig.telegramChatId, chatId));
      await reply('Disconnected.');
    }
    return c.json({ ok: true });
  });

  return r;
}
