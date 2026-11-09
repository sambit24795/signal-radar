import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@radar/db';
import { call, dbAvailable, setup, signUp, type Json, type TestUser } from './helpers.js';

const SECRET = 'hook-secret';
const BOT = { TELEGRAM_BOT_TOKEN: 'bot-token', TELEGRAM_BOT_USERNAME: 'radar_bot' };
const sent: { url: string; body: Json }[] = [];
const netFetch = async (url: string, init?: RequestInit): Promise<Response> => {
  sent.push({ url, body: JSON.parse(String(init?.body ?? '{}')) });
  return new Response('{"ok":true}');
};

type Ctx = Awaited<ReturnType<typeof setup>>;

describe.skipIf(!dbAvailable)('notifications', () => {
  let bare: Ctx; // nothing configured
  let full: Ctx; // VAPID and Telegram configured
  beforeAll(async () => {
    bare = await setup();
    full = await setup(
      {
        VAPID_PUBLIC_KEY: 'BPublicKey',
        VAPID_PRIVATE_KEY: 'priv',
        VAPID_SUBJECT: 'mailto:a@b.c',
        ...BOT,
        TELEGRAM_WEBHOOK_SECRET: SECRET,
      },
      { fetch: netFetch },
    );
  });
  afterAll(async () => {
    await bare?.close();
    await full?.close();
  });
  beforeEach(async () => {
    sent.length = 0;
    await bare.reset();
  });

  const makeFree = (ctx: Ctx, u: TestUser) =>
    ctx.db
      .update(schema.subscription)
      .set({ status: 'none', plan: 'free', trialEndsAt: null })
      .where(eq(schema.subscription.userId, u.id));

  const sub = (n: number) => ({
    endpoint: `https://push.example.com/${n}`,
    keys: { p256dh: 'k', auth: 'a' },
  });

  describe('web push', () => {
    it('GET /api/push/key is public: 404 when unset, the key when set', async () => {
      expect((await call(bare.app, '/api/push/key')).status).toBe(404);
      const res = await call(full.app, '/api/push/key');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ publicKey: 'BPublicKey' });
    });

    it('subscribe needs Pro (403) but unsubscribe does not', async () => {
      const u = await signUp(bare.app, 'a@example.com');
      await makeFree(bare, u);
      const post = await call(bare.app, '/api/push/subscribe', {
        method: 'POST',
        user: u,
        json: sub(1),
      });
      expect(post.status).toBe(403);
      expect(await bare.db.select().from(schema.pushSubscription)).toHaveLength(0);

      await bare.db.insert(schema.pushSubscription).values({ userId: u.id, ...sub(1) });
      const del = await call(bare.app, '/api/push/subscribe', {
        method: 'DELETE',
        user: u,
        json: { endpoint: sub(1).endpoint },
      });
      expect(del.status).toBe(200);
      expect(await bare.db.select().from(schema.pushSubscription)).toHaveLength(0);
    });

    it('keeps the newest 10 subscriptions per user and drops the oldest', async () => {
      const u = await signUp(bare.app, 'a@example.com');
      const other = await signUp(bare.app, 'b@example.com');
      await call(bare.app, '/api/push/subscribe', { method: 'POST', user: other, json: sub(99) });
      for (let n = 1; n <= 12; n++) {
        const res = await call(bare.app, '/api/push/subscribe', {
          method: 'POST',
          user: u,
          json: sub(n),
        });
        expect(res.status).toBe(201);
      }
      const mine = (await bare.db.select().from(schema.pushSubscription))
        .filter((r) => r.userId === u.id)
        .map((r) => r.endpoint)
        .sort();
      expect(mine).toHaveLength(10);
      expect(mine).not.toContain(sub(1).endpoint);
      expect(mine).not.toContain(sub(2).endpoint);
      expect(mine).toContain(sub(12).endpoint);
      const theirs = (await bare.db.select().from(schema.pushSubscription)).filter(
        (r) => r.userId === other.id,
      );
      expect(theirs).toHaveLength(1);
    });
  });

  describe('telegram connect', () => {
    const chat = (id: number, text: string, type = 'private') => ({
      update_id: 1,
      message: { text, chat: { id, type } },
    });
    const hook = (json: unknown, secret: string | null = SECRET) =>
      full.app.request('/api/telegram/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(secret === null ? {} : { 'x-telegram-bot-api-secret-token': secret }),
        },
        body: JSON.stringify(json),
      });
    const chatIdOf = async (u: TestUser) =>
      (await full.db.select().from(schema.userConfig).where(eq(schema.userConfig.userId, u.id)))[0]
        ?.telegramChatId ?? null;
    const linkToken = async (u: TestUser) => {
      const res = await call(full.app, '/api/me/telegram/link', { method: 'POST', user: u });
      expect(res.status).toBe(200);
      const { url } = (await res.json()) as Json;
      expect(url).toMatch(/^https:\/\/t\.me\/radar_bot\?start=[A-Za-z0-9_-]{32}$/);
      return url.split('start=')[1] as string;
    };

    it('/api/me reports telegramAvailable and telegramConnected', async () => {
      const u = await signUp(full.app, 'a@example.com');
      const before = (await (await call(full.app, '/api/me', { user: u })).json()) as Json;
      expect(before).toMatchObject({ telegramAvailable: true, telegramConnected: false });
      const b = await signUp(bare.app, 'b@example.com');
      const none = (await (await call(bare.app, '/api/me', { user: b })).json()) as Json;
      expect(none).toMatchObject({ telegramAvailable: false, telegramConnected: false });

      await full.db
        .update(schema.userConfig)
        .set({ telegramChatId: '5' })
        .where(eq(schema.userConfig.userId, u.id));
      const after = (await (await call(full.app, '/api/me', { user: u })).json()) as Json;
      expect(after.telegramConnected).toBe(true);
    });

    it('link: 503 when the bot is not configured, needs Pro, replaces old tokens, expires in 15 min', async () => {
      const b = await signUp(bare.app, 'b@example.com');
      expect(
        (await call(bare.app, '/api/me/telegram/link', { method: 'POST', user: b })).status,
      ).toBe(503);

      const u = await signUp(full.app, 'a@example.com');
      const first = await linkToken(u);
      const second = await linkToken(u);
      expect(second).not.toBe(first);
      const rows = await full.db.select().from(schema.telegramLink);
      expect(rows.map((r) => r.token)).toEqual([second]);
      const ttl = (rows[0]?.expiresAt.getTime() ?? 0) - Date.now();
      expect(ttl).toBeGreaterThan(14 * 60_000);
      expect(ttl).toBeLessThanOrEqual(15 * 60_000);

      await makeFree(full, u);
      expect(
        (await call(full.app, '/api/me/telegram/link', { method: 'POST', user: u })).status,
      ).toBe(402);
    });

    it('webhook: 404 without a configured secret, 401 on a wrong or missing header', async () => {
      const off = await bare.app.request('/api/telegram/webhook', {
        method: 'POST',
        headers: { 'x-telegram-bot-api-secret-token': SECRET },
        body: '{}',
      });
      expect(off.status).toBe(404);
      expect((await hook(chat(1, '/start x'), 'wrong')).status).toBe(401);
      expect((await hook(chat(1, '/start x'), null)).status).toBe(401);
      expect(sent).toHaveLength(0);
    });

    it('/start <token> connects the chat, replies, and the token is single-use', async () => {
      const u = await signUp(full.app, 'a@example.com');
      const token = await linkToken(u);
      const res = await hook(chat(777, `/start ${token}`));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(await chatIdOf(u)).toBe('777');
      expect(await full.db.select().from(schema.telegramLink)).toHaveLength(0);
      expect(sent).toHaveLength(1);
      expect(sent[0]?.url).toBe('https://api.telegram.org/botbot-token/sendMessage');
      expect(sent[0]?.body).toMatchObject({ chat_id: '777' });
      expect(sent[0]?.body.text).toMatch(/^Connected\./);

      await hook(chat(778, `/start ${token}`));
      expect(await chatIdOf(u)).toBe('777');
      expect(sent[1]?.body.text).toMatch(/Settings/);
    });

    it('/start with an expired token does not connect and explains how to get a new link', async () => {
      const u = await signUp(full.app, 'a@example.com');
      const token = await linkToken(u);
      await full.db.update(schema.telegramLink).set({ expiresAt: new Date(Date.now() - 1000) });
      expect((await hook(chat(777, `/start ${token}`))).status).toBe(200);
      expect(await chatIdOf(u)).toBeNull();
      expect(sent[0]?.body.text).toMatch(/expired.*Settings/);
    });

    it('bare /start and unknown tokens get help, other text is ignored', async () => {
      await hook(chat(5, '/start'));
      expect(sent[0]?.body.text).toMatch(/Settings/);
      await hook(chat(5, '/start nope'));
      expect(sent[1]?.body.text).toMatch(/expired/);
      sent.length = 0;
      expect((await hook(chat(5, 'hello there'))).status).toBe(200);
      expect((await hook({ update_id: 2 })).status).toBe(200);
      expect((await hook('not an update')).status).toBe(200);
      expect(sent).toHaveLength(0);
    });

    it('ignores non-private chats', async () => {
      const u = await signUp(full.app, 'a@example.com');
      const token = await linkToken(u);
      expect((await hook(chat(-100, `/start ${token}`, 'group'))).status).toBe(200);
      expect(await chatIdOf(u)).toBeNull();
      expect(await full.db.select().from(schema.telegramLink)).toHaveLength(1);
      expect(sent).toHaveLength(0);
    });

    it('moves a chat from another account when it is connected to a new one', async () => {
      const a = await signUp(full.app, 'a@example.com');
      const b = await signUp(full.app, 'b@example.com');
      await hook(chat(777, `/start ${await linkToken(a)}`));
      await hook(chat(777, `/start ${await linkToken(b)}`));
      expect(await chatIdOf(a)).toBeNull();
      expect(await chatIdOf(b)).toBe('777');
    });

    it('/stop clears the chat id, and DELETE /api/me/telegram does too', async () => {
      const u = await signUp(full.app, 'a@example.com');
      await hook(chat(777, `/start ${await linkToken(u)}`));
      await hook(chat(777, '/stop'));
      expect(await chatIdOf(u)).toBeNull();
      expect(sent.at(-1)?.body.text).toBe('Disconnected.');

      await hook(chat(777, `/start ${await linkToken(u)}`));
      expect(await chatIdOf(u)).toBe('777');
      const del = await call(full.app, '/api/me/telegram', { method: 'DELETE', user: u });
      expect(del.status).toBe(200);
      expect(await chatIdOf(u)).toBeNull();
    });

    it('PUT /api/me/config keeps the chat id when telegramChatId is omitted', async () => {
      const u = await signUp(full.app, 'a@example.com');
      await hook(chat(777, `/start ${await linkToken(u)}`));
      const res = await call(full.app, '/api/me/config', {
        method: 'PUT',
        user: u,
        json: { niches: [], sources: [], topN: 5, notion: null },
      });
      expect(res.status).toBe(200);
      expect(await chatIdOf(u)).toBe('777');
    });
  });
});
