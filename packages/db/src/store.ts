import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Enriched, Feedback, FeedbackExample, RadarStore, ScoredItem } from '@radar/core';
import type { Db } from './index.js';
import * as schema from './schema.js';

const CHUNK = 1000;

const sqlExcluded = (col: string) => sql.raw(`excluded."${col}"`);

function chunks<T>(xs: T[], n = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/** Postgres implementation of core's `RadarStore`. */
export function createPgStore(db: Db): RadarStore {
  return {
    async listQueueUsers(now) {
      // Every signed-in user with a config row; the subscription decides Pro or free.
      const rows = await db
        .select({
          id: schema.user.id,
          email: schema.user.email,
          cfg: schema.userConfig,
          sub: schema.subscription,
        })
        .from(schema.user)
        .innerJoin(schema.userConfig, eq(schema.userConfig.userId, schema.user.id))
        .leftJoin(schema.subscription, eq(schema.subscription.userId, schema.user.id))
        .orderBy(schema.user.createdAt);
      // Mirrors isPro in apps/api; canceled keeps Pro until the paid period ends.
      const isPro = (sub: (typeof rows)[number]['sub']) =>
        !!sub &&
        (sub.status === 'active' ||
          (sub.status === 'trialing' && !!sub.trialEndsAt && sub.trialEndsAt > now) ||
          (sub.status === 'canceled' &&
            sub.plan === 'pro' &&
            !!sub.currentPeriodEnd &&
            sub.currentPeriodEnd > now));
      const subs = new Map<
        string,
        { endpoint: string; keys: { p256dh: string; auth: string } }[]
      >();
      for (const part of chunks(rows.map((r) => r.id))) {
        const found = await db
          .select()
          .from(schema.pushSubscription)
          .where(inArray(schema.pushSubscription.userId, part))
          .orderBy(schema.pushSubscription.createdAt);
        for (const s of found) {
          const list = subs.get(s.userId) ?? [];
          list.push({ endpoint: s.endpoint, keys: s.keys });
          subs.set(s.userId, list);
        }
      }
      return rows.map(({ id, email, cfg, sub }) => ({
        id,
        email,
        plan: isPro(sub) ? ('pro' as const) : ('free' as const),
        niches: cfg.niches.map((n) => ({
          id: n.id,
          name: n.name,
          weight: n.weight ?? 1,
          keywords: n.keywords.map((k) =>
            typeof k === 'string' ? k : { term: k.term, weight: k.weight ?? 1 },
          ),
        })),
        sources: cfg.sources,
        topN: cfg.topN,
        customFeeds: cfg.customFeeds,
        telegramChatId: cfg.telegramChatId,
        pushSubscriptions: subs.get(id) ?? [],
        notion: cfg.notion,
      }));
    },

    async upsertFeed(items: ScoredItem[], now) {
      for (const part of chunks(items)) {
        await db
          .insert(schema.feedItem)
          .values(
            part.map((i) => ({
              url: i.url,
              title: i.title,
              source: i.source,
              sourceType: i.sourceKind,
              publishedAt: i.publishedAt ? new Date(i.publishedAt) : null,
              fetchedAt: now,
              meta: {
                snippet: i.snippet,
                momentum: i.momentum,
                media: i.media,
                author: i.author,
                tags: i.tags,
              },
              keywordScore: i.score,
              nicheIds: i.niches,
            })),
          )
          .onConflictDoUpdate({
            target: schema.feedItem.url,
            set: {
              title: sqlExcluded('title'),
              source: sqlExcluded('source'),
              sourceType: sqlExcluded('source_type'),
              publishedAt: sqlExcluded('published_at'),
              fetchedAt: sqlExcluded('fetched_at'),
              meta: sqlExcluded('meta'),
              keywordScore: sqlExcluded('keyword_score'),
              nicheIds: sqlExcluded('niche_ids'),
            },
          });
      }
      return items.length;
    },

    async seenUrls(userId, urls) {
      const out = new Set<string>();
      for (const part of chunks(urls)) {
        const rows = await db
          .select({ url: schema.seen.url })
          .from(schema.seen)
          .where(and(eq(schema.seen.userId, userId), inArray(schema.seen.url, part)));
        for (const r of rows) out.add(r.url);
      }
      return out;
    },

    async feedback(userId, limit): Promise<Feedback> {
      const pick = async (status: 'picked' | 'skipped'): Promise<FeedbackExample[]> => {
        if (limit <= 0) return [];
        const rows = await db
          .select()
          .from(schema.queueItem)
          .where(and(eq(schema.queueItem.userId, userId), eq(schema.queueItem.status, status)))
          .orderBy(desc(schema.queueItem.decidedAt), desc(schema.queueItem.createdAt))
          .limit(limit);
        return rows.map((r) => ({
          title: r.title,
          source: r.source,
          ...(r.hook ? { hook: r.hook } : {}),
          ...(r.angle ? { angle: r.angle } : {}),
          ...(r.niche ? { niches: [r.niche] } : {}),
        }));
      };
      return { picked: await pick('picked'), skipped: await pick('skipped') };
    },

    async insertQueue(userId, items: Enriched[]) {
      let inserted = 0;
      for (const part of chunks(items)) {
        const rows = await db
          .insert(schema.queueItem)
          .values(
            part.map((i) => ({
              userId,
              url: i.url,
              title: i.title,
              source: i.source,
              niche: i.niches[0] ?? null,
              score: i.ai?.score ?? i.score,
              summary: i.ai?.summary ?? i.fallback?.summary ?? null,
              why: i.ai?.why ?? i.fallback?.why ?? null,
              effort: i.ai?.effort ?? null,
              hook: i.ai?.hook ?? null,
              angle: i.ai?.angle ?? null,
              titleDraft: i.ai?.title ?? null,
              format: i.ai?.format ?? null,
              reasons: i.ai ? [i.ai.why] : [],
            })),
          )
          .onConflictDoNothing({ target: [schema.queueItem.userId, schema.queueItem.url] })
          .returning({ id: schema.queueItem.id });
        inserted += rows.length;
      }
      return inserted;
    },

    async markSeen(userId, urls, now) {
      for (const part of chunks(urls)) {
        await db
          .insert(schema.seen)
          .values(part.map((url) => ({ userId, url, seenAt: now })))
          .onConflictDoNothing();
      }
    },

    async deletePushSubscriptions(endpoints) {
      for (const part of chunks(endpoints)) {
        await db
          .delete(schema.pushSubscription)
          .where(inArray(schema.pushSubscription.endpoint, part));
      }
    },

    async clearTelegram(userId) {
      await db
        .update(schema.userConfig)
        .set({ telegramChatId: null })
        .where(eq(schema.userConfig.userId, userId));
    },
  };
}
