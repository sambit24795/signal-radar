import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { defineConfig, runForUsers } from '@radar/core';
import { schema, createPgStore, grantPass, type Db } from '../src/index.js';
import { openTestDb, resetTestDb, testDbAvailable } from '../src/testing.js';
import { NOW, fixture, res, routedFetch } from '../../core/test/helpers.js';

const available = await testDbAvailable();

const config = defineConfig({
  niches: [{ id: 'steam', name: 'Steam', keywords: ['steam frame', 'steamos'] }],
  sources: [{ id: 'gol', type: 'rss', name: 'GamingOnLinux', url: 'https://gol.test/feed' }],
  provider: 'none',
});

const fetch = () => routedFetch({ 'gol.test': () => res(fixture('gol.xml')) });

describe.skipIf(!available)('createPgStore + runForUsers', () => {
  let db: Db;
  beforeAll(async () => {
    db = await openTestDb();
  });
  afterAll(async () => {
    await db?.$client.end({ timeout: 1 });
  });
  beforeEach(async () => {
    await resetTestDb(db);
  });

  async function addUser(
    id: string,
    sub: {
      status: 'trialing' | 'active' | 'canceled' | 'none';
      trialEndsAt?: Date;
      currentPeriodEnd?: Date;
    },
    niches = config.niches,
  ) {
    await db.insert(schema.user).values({ id, name: id, email: `${id}@example.com` });
    await db.insert(schema.subscription).values({ userId: id, plan: 'pro', ...sub });
    await db.insert(schema.userConfig).values({ userId: id, niches, topN: 5 });
  }
  const future = new Date(NOW.getTime() + 86_400_000);
  const past = new Date(NOW.getTime() - 86_400_000);

  it('lists every user with a config, marking Pro (active, unexpired trial, canceled within the paid period) or free', async () => {
    await addUser('active', { status: 'active' });
    await addUser('trial', { status: 'trialing', trialEndsAt: future });
    await addUser('expired', { status: 'trialing', trialEndsAt: past });
    await addUser('none', { status: 'none' });
    await addUser('canceled', { status: 'canceled', currentPeriodEnd: future });
    await addUser('lapsed', { status: 'canceled', currentPeriodEnd: past });
    const users = await createPgStore(db).listQueueUsers(NOW);
    expect(users.map((u) => u.id).sort()).toEqual([
      'active',
      'canceled',
      'expired',
      'lapsed',
      'none',
      'trial',
    ]);
    const plan = (id: string) => users.find((u) => u.id === id)?.plan;
    expect(['active', 'canceled', 'trial'].map(plan)).toEqual(['pro', 'pro', 'pro']);
    expect(['expired', 'lapsed', 'none'].map(plan)).toEqual(['free', 'free', 'free']);
  });

  it('treats an active subscription past its period end as free, and legacy rows without one as Pro', async () => {
    await addUser('running', { status: 'active', currentPeriodEnd: future });
    await addUser('lapsed', { status: 'active', currentPeriodEnd: past });
    await addUser('legacy', { status: 'active' });
    const users = await createPgStore(db).listQueueUsers(NOW);
    const plan = (id: string) => users.find((u) => u.id === id)?.plan;
    expect(['running', 'lapsed', 'legacy'].map(plan)).toEqual(['pro', 'free', 'pro']);
  });

  it('grantPass marks a purchase paid and adds its days once, however many times it is called', async () => {
    await addUser('ann', { status: 'none' }, []);
    const purchase = (
      await db
        .insert(schema.passPurchase)
        .values({
          userId: 'ann',
          passId: 'p30',
          currency: 'INR',
          amount: 9900,
          days: 30,
          razorpayOrderId: 'order_1',
        })
        .returning()
    )[0]!;

    const end = await grantPass(db, 'ann', purchase, NOW);
    expect(end).toEqual(new Date(NOW.getTime() + 30 * 86_400_000));
    const [sub] = await db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.userId, 'ann'));
    expect(sub).toMatchObject({
      plan: 'pro',
      status: 'active',
      provider: 'razorpay',
      currentPeriodEnd: end,
    });
    const [paid] = await db.select().from(schema.passPurchase);
    expect(paid).toMatchObject({ status: 'paid', paidAt: NOW });

    // Verify and webhook may both fire: the second grant adds nothing.
    expect(await grantPass(db, 'ann', purchase, NOW)).toEqual(end);
    const [again] = await db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.userId, 'ann'));
    expect(again?.currentPeriodEnd).toEqual(end);

    // A second purchase stacks days onto the end of the first.
    const second = (
      await db
        .insert(schema.passPurchase)
        .values({
          userId: 'ann',
          passId: 'p90',
          currency: 'USD',
          amount: 500,
          days: 90,
          razorpayOrderId: 'order_2',
          razorpayPaymentId: 'pay_2',
        })
        .returning()
    )[0]!;
    const later = await grantPass(db, 'ann', second, NOW);
    expect(later).toEqual(new Date(end!.getTime() + 90 * 86_400_000));
  });

  it('lists a user custom feeds', async () => {
    await addUser('ann', { status: 'active' });
    const feeds = [{ id: 'custom:abc', url: 'https://a.example/rss', title: 'A' }];
    await db.update(schema.userConfig).set({ customFeeds: feeds });
    const [u] = await createPgStore(db).listQueueUsers(NOW);
    expect(u?.customFeeds).toEqual(feeds);
  });

  it('writes feed_item, queue_item and seen; a second run adds nothing', async () => {
    await addUser('ann', { status: 'trialing', trialEndsAt: future });
    await addUser('bob', { status: 'active' }, []);
    const store = createPgStore(db);

    const out = await runForUsers(config, store, { env: {}, fetch: fetch(), now: NOW });
    expect(out.users).toHaveLength(1);
    expect(out.users[0]).toMatchObject({ userId: 'ann', queued: 3, seenMarked: 3 });

    const feed = await db.select().from(schema.feedItem);
    expect(feed).toHaveLength(3);
    expect(feed[0]?.nicheIds).toEqual(['steam']);
    const q = await db.select().from(schema.queueItem).where(eq(schema.queueItem.userId, 'ann'));
    expect(q).toHaveLength(3);
    expect(q.every((r) => r.status === 'new' && r.niche === 'steam')).toBe(true);
    expect(await db.select().from(schema.seen)).toHaveLength(3);

    const again = await runForUsers(config, store, { env: {}, fetch: fetch(), now: NOW });
    expect(again.users[0]).toMatchObject({ queued: 0 });
    expect(await db.select().from(schema.queueItem)).toHaveLength(3);
    expect(await db.select().from(schema.feedItem)).toHaveLength(3);
  });

  it('insertQueue ignores urls already queued; feedback returns decided rows', async () => {
    await addUser('ann', { status: 'active' });
    const store = createPgStore(db);
    const item = {
      url: 'https://x.test/1',
      title: 'One',
      source: 's',
      niches: ['steam'],
      score: 5,
    } as never;
    expect(await store.insertQueue('ann', [item])).toBe(1);
    expect(await store.insertQueue('ann', [item])).toBe(0);
    await db
      .update(schema.queueItem)
      .set({ status: 'picked', decidedAt: NOW })
      .where(eq(schema.queueItem.userId, 'ann'));
    const fb = await store.feedback('ann', 10);
    expect(fb.picked).toEqual([{ title: 'One', source: 's', niches: ['steam'] }]);
    expect(fb.skipped).toEqual([]);
  });

  it('loads push subscriptions per user, deletes by endpoint and clears telegram', async () => {
    await addUser('ann', { status: 'active' });
    await addUser('bob', { status: 'active' });
    await db.update(schema.userConfig).set({ telegramChatId: '42' });
    const keys = { p256dh: 'p', auth: 'a' };
    await db.insert(schema.pushSubscription).values([
      { userId: 'ann', endpoint: 'https://p.test/1', keys },
      { userId: 'ann', endpoint: 'https://p.test/2', keys },
    ]);
    const store = createPgStore(db);
    const users = await store.listQueueUsers(NOW);
    const subs = (id: string) => users.find((u) => u.id === id)?.pushSubscriptions;
    expect(subs('ann')?.map((s) => s.endpoint)).toEqual(['https://p.test/1', 'https://p.test/2']);
    expect(subs('bob')).toEqual([]);

    await store.deletePushSubscriptions(['https://p.test/1', 'https://unknown.test']);
    await store.deletePushSubscriptions([]);
    expect((await db.select().from(schema.pushSubscription)).map((r) => r.endpoint)).toEqual([
      'https://p.test/2',
    ]);

    await store.clearTelegram('ann');
    const cfg = await db.select().from(schema.userConfig);
    expect(Object.fromEntries(cfg.map((c) => [c.userId, c.telegramChatId]))).toEqual({
      ann: null,
      bob: '42',
    });
  });
});
