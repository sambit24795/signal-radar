import { and, desc, eq, gt, inArray, or, sql } from 'drizzle-orm';
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
    async listProUsers(now) {
      const rows = await db
        .select({
          id: schema.user.id,
          email: schema.user.email,
          cfg: schema.userConfig,
        })
        .from(schema.user)
        .innerJoin(schema.subscription, eq(schema.subscription.userId, schema.user.id))
        .innerJoin(schema.userConfig, eq(schema.userConfig.userId, schema.user.id))
        .where(
          or(
            eq(schema.subscription.status, 'active'),
            and(
              eq(schema.subscription.status, 'trialing'),
              gt(schema.subscription.trialEndsAt, now),
            ),
          ),
        )
        .orderBy(schema.user.createdAt);
      return rows.map(({ id, email, cfg }) => ({
        id,
        email,
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
        telegramChatId: cfg.telegramChatId,
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
  };
}
