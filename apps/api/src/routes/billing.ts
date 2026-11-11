import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { createFetch, formatPrice, currencyFor, PASSES, type Currency } from '@radar/core';
import { grantPass, schema } from '@radar/db';
import type { AppVars, RouteDeps } from '../app.js';
import type { ApiEnv } from '../env.js';
import { parseBody } from '../http.js';
import { requireAuth } from '../middleware.js';
import { createLimiter } from './search.js';

export const ORDERS_PER_MINUTE = 10;
const RAZORPAY_ORDERS_URL = 'https://api.razorpay.com/v1/orders';
const PAYMENTS_UNAVAILABLE = "Payments aren't set up";

const OrderBody = z.object({
  passId: z.enum(['p30', 'p90', 'p365']),
  currency: z.enum(['INR', 'USD']),
});

const VerifyBody = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

const EventBody = z.object({
  event: z.string(),
  payload: z.unknown().optional(),
});

const EventPayload = z.object({
  order: z.object({ entity: z.object({ id: z.string() }) }).optional(),
  payment: z
    .object({ entity: z.object({ id: z.string().optional(), order_id: z.string() }) })
    .optional(),
});

const HANDLED = new Set(['order.paid', 'payment.captured']);

function razorpayKeys(env: ApiEnv): { id: string; secret: string } | null {
  const { RAZORPAY_KEY_ID: id, RAZORPAY_KEY_SECRET: secret } = env;
  return id && secret ? { id, secret } : null;
}

/** Constant-time HMAC-SHA256 hex check; signatures of another length never match. */
function verifySignature(
  secret: string,
  payload: string,
  signature: string | null | undefined,
): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(payload).digest();
  const given = Buffer.from(signature, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function amountFor(pass: (typeof PASSES)[number], currency: Currency): number {
  return currency === 'INR' ? pass.inr : pass.usd;
}

/** Billing endpoints: prepaid Razorpay passes, plus the older stub checkout for local use. */
export function billingRoutes(deps: RouteDeps) {
  const { db, env } = deps;
  const r = new Hono<AppVars>();
  const allowOrder = createLimiter(ORDERS_PER_MINUTE);

  r.use('/checkout', requireAuth(deps));
  r.use('/cancel', requireAuth(deps));
  r.use('/order', requireAuth(deps));
  r.use('/verify', requireAuth(deps));

  r.get('/passes', (c) => {
    const requested = c.req.query('currency')?.toUpperCase();
    const currency: Currency =
      requested === 'INR' || requested === 'USD'
        ? requested
        : currencyFor(c.req.header('cf-ipcountry'), c.req.header('accept-language'));
    return c.json({
      currency,
      passes: PASSES.map((pass) => ({
        id: pass.id,
        days: pass.days,
        amount: amountFor(pass, currency),
        label: formatPrice(pass, currency),
      })),
      enabled: Boolean(razorpayKeys(env)),
    });
  });

  r.post('/order', async (c) => {
    const keys = razorpayKeys(env);
    if (!keys) throw new HTTPException(503, { message: PAYMENTS_UNAVAILABLE });

    const user = c.get('user');
    if (!allowOrder(user.id)) {
      return c.json({ error: 'Too many payment attempts. Wait a moment and try again.' }, 429);
    }

    const { passId, currency } = await parseBody(c, OrderBody);
    const pass = PASSES.find((p) => p.id === passId);
    if (!pass) throw new HTTPException(400, { message: 'unknown pass' });
    const amount = amountFor(pass, currency);
    const purchaseId = randomUUID();
    const authorization = `Basic ${Buffer.from(`${keys.id}:${keys.secret}`).toString('base64')}`;
    const fetchFn = deps.net?.fetch ?? createFetch(10_000);

    let orderId: string;
    try {
      const res = await fetchFn(RAZORPAY_ORDERS_URL, {
        method: 'POST',
        headers: { authorization, 'content-type': 'application/json' },
        body: JSON.stringify({
          amount,
          currency,
          receipt: purchaseId,
          notes: { userId: user.id, passId },
        }),
      });
      if (!res.ok) throw new Error('order request failed');
      const order = (await res.json()) as { id?: unknown };
      if (typeof order.id !== 'string' || !order.id) throw new Error('order id missing');
      orderId = order.id;
    } catch {
      throw new HTTPException(502, { message: 'Could not start payment. Try again.' });
    }

    await db.insert(schema.passPurchase).values({
      id: purchaseId,
      userId: user.id,
      passId,
      currency,
      amount,
      days: pass.days,
      razorpayOrderId: orderId,
    });

    return c.json({
      orderId,
      amount,
      currency,
      keyId: keys.id,
      name: 'Signal Radar',
      email: user.email,
    });
  });

  r.post('/verify', async (c) => {
    const keys = razorpayKeys(env);
    if (!keys) throw new HTTPException(503, { message: PAYMENTS_UNAVAILABLE });

    const userId = c.get('user').id;
    const body = await parseBody(c, VerifyBody);
    const signed = `${body.razorpay_order_id}|${body.razorpay_payment_id}`;
    if (!verifySignature(keys.secret, signed, body.razorpay_signature)) {
      throw new HTTPException(400, { message: 'invalid payment signature' });
    }

    const [purchase] = await db
      .select()
      .from(schema.passPurchase)
      .where(eq(schema.passPurchase.razorpayOrderId, body.razorpay_order_id));
    if (!purchase || purchase.userId !== userId) {
      throw new HTTPException(404, { message: 'order not found' });
    }

    const currentPeriodEnd = await grantPass(db, userId, {
      id: purchase.id,
      razorpayPaymentId: body.razorpay_payment_id,
    });
    return c.json({ currentPeriodEnd });
  });

  r.post('/webhook', async (c) => {
    const secret = env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) throw new HTTPException(503, { message: PAYMENTS_UNAVAILABLE });

    // Razorpay signs the exact bytes it sent, so verify before parsing anything.
    const raw = await c.req.text();
    if (!verifySignature(secret, raw, c.req.header('X-Razorpay-Signature'))) {
      throw new HTTPException(401, { message: 'invalid signature' });
    }

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new HTTPException(400, { message: 'invalid JSON body' });
    }
    const event = EventBody.safeParse(json);
    if (!event.success) throw new HTTPException(400, { message: 'invalid payload' });
    if (!HANDLED.has(event.data.event)) return c.json({ ok: true, ignored: true });

    const payload = EventPayload.safeParse(event.data.payload);
    if (!payload.success) throw new HTTPException(400, { message: 'invalid payload' });
    const orderId = payload.data.order?.entity.id ?? payload.data.payment?.entity.order_id;
    if (!orderId) throw new HTTPException(400, { message: 'missing order id' });

    const [purchase] = await db
      .select()
      .from(schema.passPurchase)
      .where(eq(schema.passPurchase.razorpayOrderId, orderId));
    if (!purchase) return c.json({ ok: true, ignored: true });

    await grantPass(db, purchase.userId, {
      id: purchase.id,
      razorpayPaymentId: payload.data.payment?.entity.id ?? null,
    });
    return c.json({ ok: true });
  });

  r.post('/checkout', async (c) => {
    // The stub grants Pro for free: once real payments exist it must not run in production.
    if (
      env.PAYMENTS_PROVIDER !== 'stub' ||
      (env.NODE_ENV === 'production' && razorpayKeys(env) !== null)
    ) {
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
    // The stub grants Pro for free: once real payments exist it must not run in production.
    if (
      env.PAYMENTS_PROVIDER !== 'stub' ||
      (env.NODE_ENV === 'production' && razorpayKeys(env) !== null)
    ) {
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
