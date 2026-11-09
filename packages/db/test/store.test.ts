import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { defineConfig, runForUsers } from '@radar/core';
import { schema, createPgStore, type Db } from '../src/index.js';
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

  it('lists only Pro users (active, unexpired trial, or canceled within the paid period)', async () => {
    await addUser('active', { status: 'active' });
    await addUser('trial', { status: 'trialing', trialEndsAt: future });
    await addUser('expired', { status: 'trialing', trialEndsAt: past });
    await addUser('none', { status: 'none' });
    await addUser('canceled', { status: 'canceled', currentPeriodEnd: future });
    await addUser('lapsed', { status: 'canceled', currentPeriodEnd: past });
    const users = await createPgStore(db).listProUsers(NOW);
    expect(users.map((u) => u.id).sort()).toEqual(['active', 'canceled', 'trial']);
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
});
