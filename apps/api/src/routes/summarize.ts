import { Hono } from 'hono';
import { and, eq, gt, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  assertPublicUrlSyntax,
  cleanUrl,
  createFetch,
  createProvider,
  summarizePage,
  UnsafeUrlError,
  type SummarizeResult,
} from '@radar/core';
import { schema } from '@radar/db';
import radarConfig from '../../../../radar.config.js';
import type { AppVars, RouteDeps } from '../app.js';
import { badRequest, parseBody } from '../http.js';
import { requireAuth, requirePro } from '../middleware.js';

export const MAX_SUMMARIES_PER_DAY = 100;
const WINDOW_MS = 24 * 60 * 60 * 1000;
const AI_TIMEOUT_MS = 25_000;

const Body = z.object({ url: z.string().trim().min(1).max(2000) });

export function summarizeRoutes(deps: RouteDeps) {
  const { db } = deps;
  const t = schema.pageSummary;
  const r = new Hono<AppVars>();
  r.use('*', requireAuth(deps), requirePro(deps));

  r.post('/', async (c) => {
    const userId = c.get('user').id;
    const body = await parseBody(c, Body);
    let url: string;
    try {
      url = cleanUrl(assertPublicUrlSyntax(body.url).href);
    } catch (e) {
      return badRequest(e instanceof Error ? e.message : 'invalid url');
    }

    const respond = (
      row: { status: 'ok' | 'unreadable'; tldr: string | null; points: string[] | null },
      cached: boolean,
    ) =>
      c.json({
        url,
        status: row.status,
        ...(row.status === 'ok' && row.tldr ? { tldr: row.tldr, points: row.points ?? [] } : {}),
        cached,
      });

    const [hit] = await db.select().from(t).where(eq(t.url, url));
    if (hit) return respond(hit, true);

    const [{ n } = { n: 0 }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(t)
      .where(and(eq(t.requestedBy, userId), gt(t.createdAt, new Date(Date.now() - WINDOW_MS))));
    if (n >= MAX_SUMMARIES_PER_DAY) {
      return c.json(
        {
          error: `You can summarize up to ${MAX_SUMMARIES_PER_DAY} new pages a day. Try again tomorrow.`,
        },
        429,
      );
    }

    const warn = (m: string) => console.warn(`summarize: ${m}`);
    const provider = createProvider(
      radarConfig,
      process.env,
      warn,
      deps.net?.fetch ?? createFetch(AI_TIMEOUT_MS),
    );
    if (provider.id === 'none') {
      return c.json({ error: 'Summaries are not available right now.' }, 503);
    }
    const model =
      provider.id === 'deepseek'
        ? radarConfig.scoring.deepseekModel
        : radarConfig.scoring.anthropicModel;

    let result: SummarizeResult;
    try {
      result = await Promise.race([
        summarizePage(url, {
          provider,
          ...(deps.net?.fetch ? { fetch: deps.net.fetch } : {}),
          ...(deps.net?.resolve ? { resolve: deps.net.resolve } : {}),
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timed out')), AI_TIMEOUT_MS).unref(),
        ),
      ]);
    } catch (e) {
      if (e instanceof UnsafeUrlError) return badRequest(e.message);
      warn((e as Error).message);
      return c.json({ error: "Couldn't summarize that page right now. Try again later." }, 502);
    }

    const values =
      result.status === 'ok'
        ? { url, status: 'ok' as const, tldr: result.tldr, points: result.points }
        : { url, status: 'unreadable' as const, tldr: null, points: null };
    const [row] = await db
      .insert(t)
      .values({ ...values, model, requestedBy: userId })
      .onConflictDoNothing({ target: t.url })
      .returning();
    if (row) return respond(row, false);
    // Lost a race with another request for the same URL: serve what it stored.
    const [stored] = await db.select().from(t).where(eq(t.url, url));
    return respond(stored ?? values, true);
  });

  return r;
}
