import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@radar/db';
import { call, dbAvailable, setup, sign, signUp, WEB_ORIGIN, type Json } from './helpers.js';

const KEY_ID = 'rzp_test_key';
const KEY_SECRET = 'rzp_test_secret';
const WEBHOOK_SECRET = 'rzp_webhook_secret';

let orderCount = 0;
let orderRequests: { url: string; init?: RequestInit }[] = [];

const netFetch = async (url: string, init?: RequestInit): Promise<Response> => {
  if (url !== 'https://api.razorpay.com/v1/orders') throw new Error(`unexpected fetch ${url}`);
  orderRequests.push({ url, ...(init ? { init } : {}) });
  const sent = JSON.parse(String(init?.body)) as { amount: number; currency: string };
  orderCount++;
  return new Response(
    JSON.stringify({
      id: `order_test_${orderCount}`,
      amount: sent.amount,
      currency: sent.currency,
      status: 'created',
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
};

const paymentSignature = (orderId: string, paymentId: string) =>
  sign(`${orderId}|${paymentId}`, KEY_SECRET);

const webhookSignature = (body: string) => sign(body, WEBHOOK_SECRET);

describe.skipIf(!dbAvailable)('billing (Razorpay passes)', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => {
    ctx = await setup(
      {
        RAZORPAY_KEY_ID: KEY_ID,
        RAZORPAY_KEY_SECRET: KEY_SECRET,
        RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
      },
      { fetch: netFetch },
    );
  });
  afterAll(async () => {
    await ctx?.close();
  });
  beforeEach(async () => {
    orderCount = 0;
    orderRequests = [];
    await ctx.reset();
  });

  const passes = (headers: Record<string, string> = {}) =>
    ctx.app.request('/api/billing/passes', { headers: { origin: WEB_ORIGIN, ...headers } });

  const order = (u: Awaited<ReturnType<typeof signUp>>, body?: unknown) =>
    call(ctx.app, '/api/billing/order', {
      method: 'POST',
      user: u,
      json: body ?? { passId: 'p90', currency: 'INR' },
    });

  const verify = (
    u: Awaited<ReturnType<typeof signUp>>,
    razorpay_order_id: string,
    razorpay_payment_id: string,
    razorpay_signature: string,
  ) =>
    call(ctx.app, '/api/billing/verify', {
      method: 'POST',
      user: u,
      json: { razorpay_order_id, razorpay_payment_id, razorpay_signature },
    });

  const postWebhook = (body: string, signature?: string) =>
    ctx.app.request('/api/billing/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(signature ? { 'x-razorpay-signature': signature } : {}),
      },
      body,
    });

  it('GET /passes is public, uses the requested currency and lists fixed prices', async () => {
    const inr = (await (await passes({ 'cf-ipcountry': 'IN' })).json()) as Json;
    expect(inr).toEqual({
      currency: 'INR',
      enabled: true,
      passes: [
        { id: 'p30', days: 30, amount: 9900, label: '₹99' },
        { id: 'p90', days: 90, amount: 24900, label: '₹249' },
        { id: 'p365', days: 365, amount: 79900, label: '₹799' },
      ],
    });
    const usd = (await (await passes({ 'cf-ipcountry': 'US' })).json()) as Json;
    expect(usd.currency).toBe('USD');
    expect(usd.passes[0]).toEqual({ id: 'p30', days: 30, amount: 200, label: '$2' });
    const override = (await (await passes({ 'cf-ipcountry': 'US' })).json()) as Json;
    expect(override.currency).toBe('USD');
    const forced = (await (await passes({ 'cf-ipcountry': 'IN' })).json()) as Json;
    expect(forced.currency).toBe('INR');
    const chosen = (await (
      await ctx.app.request('/api/billing/passes?currency=USD', { headers: { origin: WEB_ORIGIN } })
    ).json()) as Json;
    expect(chosen.currency).toBe('USD');
  });

  it('creates an order from the catalogue and stores the purchase', async () => {
    const u = await signUp(ctx.app, 'buyer@example.com');
    const res = await order(u);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Json;
    expect(body).toMatchObject({
      orderId: 'order_test_1',
      amount: 24900,
      currency: 'INR',
      keyId: KEY_ID,
      name: 'Signal Radar',
      email: u.email,
    });
    const sent = orderRequests[0]!;
    const headers = new Headers(sent.init?.headers);
    expect(headers.get('authorization')).toBe(
      `Basic ${Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64')}`,
    );
    const payload = JSON.parse(String(sent.init?.body)) as Json;
    expect(payload).toMatchObject({
      amount: 24900,
      currency: 'INR',
      notes: { userId: u.id, passId: 'p90' },
    });
    expect(payload.receipt).toBeTruthy();
    const [purchase] = await ctx.db
      .select()
      .from(schema.passPurchase)
      .where(eq(schema.passPurchase.userId, u.id));
    expect(purchase).toMatchObject({
      id: payload.receipt,
      passId: 'p90',
      currency: 'INR',
      amount: 24900,
      days: 90,
      status: 'created',
      razorpayOrderId: 'order_test_1',
    });
  });

  it('rejects a bad payment signature and does not grant days', async () => {
    const u = await signUp(ctx.app, 'buyer@example.com');
    const created = (await (await order(u)).json()) as Json;
    const bad = await verify(u, created.orderId, 'pay_1', sign('wrong', KEY_SECRET));
    expect(bad.status).toBe(400);
    const [purchase] = await ctx.db
      .select()
      .from(schema.passPurchase)
      .where(eq(schema.passPurchase.userId, u.id));
    expect(purchase?.status).toBe('created');
  });

  it('grants once on a good signature and stays idempotent for a repeated payment', async () => {
    const u = await signUp(ctx.app, 'buyer@example.com');
    const created = (await (await order(u)).json()) as Json;
    const before = Date.now();
    const ok = await verify(
      u,
      created.orderId,
      'pay_1',
      paymentSignature(created.orderId, 'pay_1'),
    );
    expect(ok.status).toBe(200);
    const granted = (await ok.json()) as Json;
    const end = new Date(granted.currentPeriodEnd);
    const days = (end.getTime() - before) / 86_400_000;
    expect(days).toBeGreaterThan(89.9);
    expect(days).toBeLessThan(90.1);

    const [purchase] = await ctx.db
      .select()
      .from(schema.passPurchase)
      .where(eq(schema.passPurchase.userId, u.id));
    expect(purchase).toMatchObject({ status: 'paid', razorpayPaymentId: 'pay_1' });
    const [sub] = await ctx.db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.userId, u.id));
    expect(sub).toMatchObject({
      plan: 'pro',
      status: 'active',
      provider: 'razorpay',
      currentPeriodEnd: end,
    });
    const me = (await (await call(ctx.app, '/api/me', { user: u })).json()) as Json;
    expect(me.proUntil).toBe(granted.currentPeriodEnd);

    const again = await verify(
      u,
      created.orderId,
      'pay_1',
      paymentSignature(created.orderId, 'pay_1'),
    );
    expect(((await again.json()) as Json).currentPeriodEnd).toBe(granted.currentPeriodEnd);
    const [after] = await ctx.db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.userId, u.id));
    expect(after?.currentPeriodEnd?.toISOString()).toBe(end.toISOString());
  });

  it("refuses to verify another user's order", async () => {
    const a = await signUp(ctx.app, 'a@example.com');
    const b = await signUp(ctx.app, 'b@example.com');
    const created = (await (await order(a)).json()) as Json;
    const res = await verify(
      b,
      created.orderId,
      'pay_1',
      paymentSignature(created.orderId, 'pay_1'),
    );
    expect(res.status).toBe(404);
    const [purchase] = await ctx.db
      .select()
      .from(schema.passPurchase)
      .where(eq(schema.passPurchase.razorpayOrderId, created.orderId));
    expect(purchase?.status).toBe('created');
  });

  it('checks the webhook signature and grants on order.paid', async () => {
    const u = await signUp(ctx.app, 'buyer@example.com');
    const created = (await (await order(u)).json()) as Json;
    const body = JSON.stringify({
      event: 'order.paid',
      payload: {
        order: { entity: { id: created.orderId } },
        payment: { entity: { id: 'pay_webhook', order_id: created.orderId } },
      },
    });
    expect((await postWebhook(body)).status).toBe(401);
    expect((await postWebhook(body, 'deadbeef')).status).toBe(401);
    expect((await postWebhook(body, sign(body, 'not-this-secret'))).status).toBe(401);

    const ok = await postWebhook(body, webhookSignature(body));
    expect(ok.status).toBe(200);
    const [purchase] = await ctx.db
      .select()
      .from(schema.passPurchase)
      .where(eq(schema.passPurchase.userId, u.id));
    expect(purchase).toMatchObject({ status: 'paid', razorpayPaymentId: 'pay_webhook' });

    // Verify after the webhook must not add the same pass twice.
    const [before] = await ctx.db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.userId, u.id));
    const verified = await verify(
      u,
      created.orderId,
      'pay_webhook',
      paymentSignature(created.orderId, 'pay_webhook'),
    );
    expect(verified.status).toBe(200);
    expect(((await verified.json()) as Json).currentPeriodEnd).toBe(
      before?.currentPeriodEnd?.toISOString(),
    );
    const [after] = await ctx.db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.userId, u.id));
    expect(after?.currentPeriodEnd?.toISOString()).toBe(before?.currentPeriodEnd?.toISOString());
    const [still] = await ctx.db
      .select()
      .from(schema.passPurchase)
      .where(eq(schema.passPurchase.userId, u.id));
    expect(still?.paidAt?.toISOString()).toBe(purchase!.paidAt?.toISOString());
  });

  it('grants on payment.captured and ignores unknown events', async () => {
    const u = await signUp(ctx.app, 'buyer@example.com');
    const created = (await (await order(u)).json()) as Json;
    const body = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_captured', order_id: created.orderId } } },
    });
    expect((await postWebhook(body, webhookSignature(body))).status).toBe(200);
    const [purchase] = await ctx.db
      .select()
      .from(schema.passPurchase)
      .where(eq(schema.passPurchase.userId, u.id));
    expect(purchase).toMatchObject({ status: 'paid', razorpayPaymentId: 'pay_captured' });

    const other = JSON.stringify({ event: 'payment.failed', payload: {} });
    const res = await postWebhook(other, webhookSignature(other));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ignored: true });
  });

  it('disables payment routes when the Razorpay keys are missing', async () => {
    const off = await setup();
    try {
      await off.reset();
      const listed = (await (await off.app.request('/api/billing/passes')).json()) as Json;
      expect(listed.enabled).toBe(false);

      const u = await signUp(off.app, 'off@example.com');
      const create = await call(off.app, '/api/billing/order', {
        method: 'POST',
        user: u,
        json: { passId: 'p30', currency: 'USD' },
      });
      expect(create.status).toBe(503);
      expect(await create.json()).toEqual({ error: "Payments aren't set up" });

      const check = await call(off.app, '/api/billing/verify', {
        method: 'POST',
        user: u,
        json: {
          razorpay_order_id: 'order',
          razorpay_payment_id: 'pay',
          razorpay_signature: 'sig',
        },
      });
      expect(check.status).toBe(503);

      const hook = await off.app.request('/api/billing/webhook', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-razorpay-signature': 'sig' },
        body: '{}',
      });
      expect(hook.status).toBe(503);
    } finally {
      await off.close();
    }
  });
});
