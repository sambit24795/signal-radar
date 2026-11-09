import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  assertPublicUrlSyntax,
  buildSystemPrompt,
  cleanUrl,
  compileNiches,
  createFetch,
  createProvider,
  fetchPublicText,
  noneFallback,
  noneProvider,
  normalizeItem,
  scoreKeywords,
  scoreOne,
  stripHtml,
  truncate,
  UnsafeUrlError,
  type AiScore,
  type Niche,
  type ScoredItem,
} from '@radar/core';
import { createPgStore, schema, type QueueStatus } from '@radar/db';
import radarConfig from '../../../../radar.config.js';
import type { AppVars, RouteDeps } from '../app.js';
import { badRequest, parseBody, parseQuery } from '../http.js';
import { requireAuth, userIsPro } from '../middleware.js';

const PAGE_SIZE = 20;
const QueueQuery = z.object({
  status: z.enum(['new', 'picked', 'skipped']).default('new'),
  cursor: z.string().optional(),
});
export const MAX_ADDS_PER_DAY = 30;
export const MAX_FREE_ADDS_PER_DAY = 10;
const ADD_WINDOW_MS = 24 * 60 * 60 * 1000;
const AI_TIMEOUT_MS = 20_000;
const DEFAULT_SOURCE = 'Added by you';

const AddBody = z.object({
  url: z.string().trim().min(1).max(2000),
  title: z.string().trim().min(1).max(300).optional(),
  snippet: z.string().trim().max(2000).optional(),
  source: z.string().trim().min(1).max(80).optional(),
  niche: z.string().trim().min(1).max(64).optional(),
});

const metaContent = (html: string, attr: 'property' | 'name', key: string): string | null => {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = new RegExp(`\\b${attr}\\s*=\\s*["']${key}["']`, 'i').test(tag);
    const content = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    const value = content?.[1] ?? content?.[2];
    if (name && value) return stripHtml(value) || null;
  }
  return null;
};

/** og:title / <title> and og:description / meta description from a page's HTML. */
export function readPageMeta(html: string): { title: string | null; snippet: string | null } {
  const head = html.slice(0, 200_000);
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  return {
    title:
      metaContent(head, 'property', 'og:title') ??
      metaContent(head, 'name', 'twitter:title') ??
      (titleTag ? stripHtml(titleTag) || null : null),
    snippet:
      metaContent(head, 'property', 'og:description') ??
      metaContent(head, 'name', 'description') ??
      metaContent(head, 'name', 'twitter:description'),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cursor = base64url("<created_at iso micros>|<id>"); keyset pagination, newest first. */
function decodeCursor(raw: string): { ts: string; id: string } {
  const [ts, id] = Buffer.from(raw, 'base64url').toString().split('|');
  if (!ts || !id || !UUID.test(id) || Number.isNaN(Date.parse(ts)))
    return badRequest('invalid cursor');
  return { ts, id };
}

export function queueRoutes(deps: RouteDeps) {
  const { db } = deps;
  const q = schema.queueItem;
  const r = new Hono<AppVars>();
  r.use('*', requireAuth(deps));

  r.get('/', async (c) => {
    const userId = c.get('user').id;
    const { status, cursor } = parseQuery(c, QueueQuery);
    const after = cursor ? decodeCursor(cursor) : undefined;
    const rows = await db
      .select({
        item: q,
        // microsecond-precision text so the cursor round-trips exactly
        ts: sql<string>`to_char(${q.createdAt} at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      })
      .from(q)
      .where(
        and(
          eq(q.userId, userId),
          eq(q.status, status),
          after
            ? sql`(${q.createdAt}, ${q.id}) < (${after.ts}::timestamptz, ${after.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(q.createdAt), desc(q.id))
      .limit(PAGE_SIZE + 1);
    const page = rows.slice(0, PAGE_SIZE);
    const last = page.at(-1);
    const nextCursor =
      rows.length > PAGE_SIZE && last
        ? Buffer.from(`${last.ts}|${last.item.id}`).toString('base64url')
        : null;
    return c.json({ items: page.map((p) => p.item), nextCursor });
  });

  r.post('/', async (c) => {
    const userId = c.get('user').id;
    const body = await parseBody(c, AddBody);
    let url: string;
    try {
      url = cleanUrl(assertPublicUrlSyntax(body.url).href);
    } catch (e) {
      return badRequest(e instanceof Error ? e.message : 'invalid url');
    }

    // Already queued: just pick it. Duplicates never count toward the daily cap.
    const pickExisting = async () => {
      const [row] = await db
        .update(q)
        .set({ status: 'picked', decidedAt: new Date() })
        .where(and(eq(q.userId, userId), eq(q.url, url)))
        .returning();
      return row;
    };
    const dupe = await pickExisting();
    if (dupe) return c.json({ item: dupe }, 200);

    const [{ n } = { n: 0 }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(q)
      .where(
        and(
          eq(q.userId, userId),
          eq(q.addedByUser, true),
          gt(q.createdAt, new Date(Date.now() - ADD_WINDOW_MS)),
        ),
      );
    const pro = await userIsPro(db, userId);
    const cap = pro ? MAX_ADDS_PER_DAY : MAX_FREE_ADDS_PER_DAY;
    if (n >= cap) {
      return c.json(
        {
          error: pro
            ? `You can add up to ${cap} items a day. Try again tomorrow.`
            : `Free accounts can add up to ${cap} items a day. Pro raises that to ${MAX_ADDS_PER_DAY}.`,
        },
        429,
      );
    }

    let title = body.title;
    let snippet = body.snippet ?? '';
    if (!title) {
      try {
        const { text } = await fetchPublicText(url, {
          headers: { accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' },
          maxBytes: 1_000_000,
          ...(deps.net?.fetch ? { fetch: deps.net.fetch } : {}),
          ...(deps.net?.resolve ? { resolve: deps.net.resolve } : {}),
        });
        const meta = readPageMeta(text);
        title = meta.title ?? undefined;
        if (!snippet && meta.snippet) snippet = meta.snippet;
      } catch (e) {
        if (e instanceof UnsafeUrlError) return badRequest(e.message);
        return badRequest(`Could not read that page: ${(e as Error).message}`);
      }
      if (!title) return badRequest('Could not find a title on that page. Add one yourself.');
    }

    const [cfg] = await db
      .select({ niches: schema.userConfig.niches })
      .from(schema.userConfig)
      .where(eq(schema.userConfig.userId, userId));
    const niches: Niche[] = (cfg?.niches ?? []).map((n) => ({
      id: n.id,
      name: n.name,
      weight: n.weight ?? 1,
      keywords: n.keywords.map((k) =>
        typeof k === 'string' ? k : { term: k.term, weight: k.weight ?? 1 },
      ),
    }));

    const source = body.source ?? DEFAULT_SOURCE;
    const now = new Date();
    const base = normalizeItem(
      { url, title, snippet: truncate(snippet, 400), publishedAt: now },
      { name: source, kind: 'rss' },
      now,
    );
    if (!base) return badRequest('invalid url');
    const match = scoreKeywords(base, compileNiches(niches));
    const nicheId =
      body.niche && niches.some((n) => n.id === body.niche) ? body.niche : match.niches[0];
    const item: ScoredItem = {
      ...base,
      keywordScore: match.keywordScore,
      score: match.keywordScore,
      niches: nicheId ? [nicheId] : [],
    };

    // Enrich with the configured model; any failure falls back to the snippet summary.
    let ai: AiScore | null = null;
    const warn = (m: string) => console.warn(`queue add: ${m}`);
    try {
      // Free accounts never spend model calls: page metadata and a snippet summary only.
      const provider = !pro
        ? noneProvider
        : createProvider(
            radarConfig,
            process.env,
            warn,
            deps.net?.fetch ?? createFetch(AI_TIMEOUT_MS),
          );
      if (provider.id !== 'none') {
        const feedback = await createPgStore(db).feedback(
          userId,
          radarConfig.scoring.feedbackLimit,
        );
        const system = buildSystemPrompt(niches, feedback);
        ai = await Promise.race([
          scoreOne(provider, system, item, warn),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), AI_TIMEOUT_MS).unref()),
        ]);
      }
    } catch (e) {
      warn((e as Error).message);
    }
    const fallback = noneFallback(item, niches);

    const [row] = await db
      .insert(q)
      .values({
        userId,
        url,
        title: item.title,
        source,
        niche: nicheId ?? null,
        score: ai?.score ?? 0,
        summary: ai?.summary ?? fallback.summary,
        why: ai?.why ?? (niches.length ? fallback.why : DEFAULT_SOURCE),
        effort: ai?.effort ?? null,
        hook: ai?.hook ?? null,
        angle: ai?.angle ?? null,
        titleDraft: ai?.title ?? null,
        format: ai?.format ?? null,
        reasons: ai ? [ai.why] : [],
        status: 'picked',
        decidedAt: now,
        addedByUser: true,
      })
      .onConflictDoNothing({ target: [q.userId, q.url] })
      .returning();
    if (row) return c.json({ item: row }, 201);
    // Lost a race with a concurrent add of the same URL.
    const raced = await pickExisting();
    if (!raced) throw new HTTPException(500, { message: 'could not add item' });
    return c.json({ item: raced }, 200);
  });

  const decide = (status: QueueStatus) => async (c: import('hono').Context<AppVars>) => {
    const id = c.req.param('id') ?? '';
    if (!UUID.test(id)) return c.json({ error: 'not found' }, 404);
    const [row] = await db
      .update(q)
      .set({ status, decidedAt: status === 'new' ? null : new Date() })
      .where(and(eq(q.id, id), eq(q.userId, c.get('user').id)))
      .returning();
    if (!row) return c.json({ error: 'not found' }, 404);
    return c.json({ item: row });
  };

  r.post('/:id/pick', decide('picked'));
  r.post('/:id/skip', decide('skipped'));
  r.post('/:id/reset', decide('new'));

  return r;
}
