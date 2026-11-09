import { createHmac, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type SubscriptionStatus } from '@radar/db';
import type { AppVars, RouteDeps } from '../app.js';

const Payload = z.object({
  meta: z.object({
    event_name: z.string(),
    custom_data: z
      .object({ user_id: z.string().min(1) })
      .partial()
      .optional(),
  }),
  data: z.object({
    id: z.union([z.string(), z.number()]).transform(String),
    attributes: z
      .object({
        status: z.string().optional(),
        customer_id: z.union([z.string(), z.number()]).transform(String).optional(),
        renews_at: z.string().nullish(),
        ends_at: z.string().nullish(),
        trial_ends_at: z.string().nullish(),
      })
      .default({}),
  }),
});

const HANDLED = new Set([
  'subscription_created',
  'subscription_updated',
  'subscription_cancelled',
  'subscription_expired',
]);

function mapStatus(event: string, lsStatus: string | undefined): SubscriptionStatus {
  if (event === 'subscription_cancelled' || event === 'subscription_expired') return 'canceled';
  switch (lsStatus) {
    case 'on_trial':
      return 'trialing';
    case 'active':
      return 'active';
    case 'past_due':
    case 'unpaid':
    case 'paused':
      return 'past_due';
    case 'cancelled':
    case 'expired':
      return 'canceled';
    default:
      return 'none';
  }
}

function verifySignature(secret: string, raw: string, header: string | undefined): boolean {
  if (!header) return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  const given = Buffer.from(header, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const toDate = (v: string | null | undefined) => (v ? new Date(v) : null);

export function webhookRoutes({ db, env }: RouteDeps) {
  const r = new Hono<AppVars>();

  r.post('/lemonsqueezy', async (c) => {
    const raw = await c.req.text();
    const secret = env.LEMONSQUEEZY_WEBHOOK_SECRET;
    if (secret && !verifySignature(secret, raw, c.req.header('X-Signature'))) {
      throw new HTTPException(401, { message: 'invalid signature' });
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new HTTPException(400, { message: 'invalid JSON body' });
    }
    const parsed = Payload.safeParse(json);
    if (!parsed.success) throw new HTTPException(400, { message: 'invalid payload' });
    const { meta, data } = parsed.data;
    if (!HANDLED.has(meta.event_name)) return c.json({ ok: true, ignored: true });

    const userId = meta.custom_data?.user_id;
    if (!userId) throw new HTTPException(400, { message: 'missing meta.custom_data.user_id' });
    const [u] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.id, userId));
    if (!u) throw new HTTPException(404, { message: 'unknown user' });

    const a = data.attributes;
    const status = mapStatus(meta.event_name, a.status);
    const entitled = status === 'active' || status === 'trialing' || status === 'past_due';
    const fields = {
      plan: entitled ? ('pro' as const) : ('free' as const),
      status,
      provider: 'lemonsqueezy' as const,
      providerCustomerId: a.customer_id ?? null,
      providerSubscriptionId: data.id,
      trialEndsAt: toDate(a.trial_ends_at),
      currentPeriodEnd: toDate(a.renews_at) ?? toDate(a.ends_at),
    };
    await db
      .insert(schema.subscription)
      .values({ userId, ...fields })
      .onConflictDoUpdate({ target: schema.subscription.userId, set: fields });
    return c.json({ ok: true });
  });

  return r;
}
