import {
  createPushSender,
  formatPush,
  sendPush,
  type PushSender,
  type PushSubscriptionInfo,
} from './digest/push.js';
import { sendDigest, TelegramError } from './digest/telegram.js';
import { mapLimit } from './concurrency.js';
import { createFetch, type FetchFn } from './http.js';
import { fetchPublicText, type Resolver } from './netguard.js';
import { normalizeItem } from './normalize.js';
import {
  createNotionClient,
  resolveDataSourceId,
  upsertAll,
  type NotionLike,
} from './notion/index.js';
import { collectItems, type SourceResult } from './pipeline.js';
import { prefilter } from './prefilter.js';
import { rank } from './rank.js';
import type { Item, Niche, RadarConfig, RawItem, ScoredItem } from './schema.js';
import { createProvider, scoreItems, type Enriched, type Feedback } from './score/index.js';
import { parseFeed } from './sources/rss.js';

/** A feed URL a Pro user added themselves. */
export interface CustomFeed {
  id: string;
  url: string;
  title: string;
}

/** A Pro user the run works for. */
export interface RadarUser {
  id: string;
  email?: string;
  niches: Niche[];
  /** Enabled source ids; empty means every configured source. */
  sources: string[];
  topN: number;
  /** Their own RSS/Atom feeds; items reach only this user's candidate pool. */
  customFeeds?: CustomFeed[];
  telegramChatId?: string | null;
  /** Browsers this user enabled Web Push on. */
  pushSubscriptions?: PushSubscriptionInfo[];
  notion?: { token: string; dbId: string } | null;
}

/**
 * Persistence for a multi-user run. Core never talks to a database itself:
 * `@radar/db` provides the Postgres implementation, tests use an in-memory one.
 */
export interface RadarStore {
  /** Users with an active subscription or an unexpired trial. */
  listProUsers(now: Date): Promise<RadarUser[]>;
  /** Upsert the shared public feed. Returns the number of rows written. */
  upsertFeed(items: ScoredItem[], now: Date): Promise<number>;
  /** Urls this user has already been shown. */
  seenUrls(userId: string, urls: string[]): Promise<Set<string>>;
  /** Their last picked and skipped queue items, as few-shot examples. */
  feedback(userId: string, limit: number): Promise<Feedback>;
  /** Insert queue rows, ignoring urls already queued. Returns the number inserted. */
  insertQueue(userId: string, items: Enriched[]): Promise<number>;
  markSeen(userId: string, urls: string[], now: Date): Promise<void>;
  /** Drop push subscriptions the push service reported as gone. */
  deletePushSubscriptions(endpoints: string[]): Promise<void>;
  /** Forget the user's Telegram chat id (the bot was blocked). */
  clearTelegram(userId: string): Promise<void>;
}

export interface MultiRunOptions {
  env?: Record<string, string | undefined>;
  /** Overrides the HTTP client for sources, the LLM and Telegram (tests). */
  fetch?: FetchFn;
  /** Overrides DNS resolution for custom feeds (tests). */
  resolve?: Resolver;
  /** Overrides the Web Push sender; defaults to `web-push` when the VAPID env is set (tests). */
  push?: PushSender | null;
  /** Overrides the Notion client factory (tests). */
  notion?: (token: string) => NotionLike;
  now?: Date;
  warn?: (m: string) => void;
  /** Max rows written to the shared feed. */
  feedLimit?: number;
  /** Max picked and skipped examples each. */
  feedbackLimit?: number;
}

export interface UserRunResult {
  userId: string;
  email?: string;
  candidates: number;
  scored: number;
  scoringFailed: number;
  queued: number;
  seenMarked: number;
  digestSent: boolean;
  /** Push notifications delivered (one per subscribed browser). */
  pushSent: number;
  notion?: { created: number; updated: number; failed: number };
  error?: string;
}

export interface MultiRunResult {
  provider: string;
  results: SourceResult[];
  fetched: number;
  deduped: number;
  feedRows: number;
  users: UserRunResult[];
  warnings: string[];
}

const CUSTOM_FEED_CONCURRENCY = 4;

/** Fetch each distinct custom feed URL once. Failures are logged and yield no items. */
async function fetchCustomFeeds(
  users: RadarUser[],
  fetchFn: FetchFn,
  resolve: Resolver | undefined,
  warn: (m: string) => void,
): Promise<Map<string, RawItem[]>> {
  const urls = [...new Set(users.flatMap((u) => (u.customFeeds ?? []).map((f) => f.url)))];
  const out = new Map<string, RawItem[]>();
  await mapLimit(urls, CUSTOM_FEED_CONCURRENCY, async (url) => {
    try {
      const { text } = await fetchPublicText(url, {
        fetch: fetchFn,
        ...(resolve ? { resolve } : {}),
      });
      out.set(url, parseFeed(text));
    } catch (e) {
      warn(`custom feed ${url}: ${(e as Error).message}`);
    }
  });
  return out;
}

/** Does a missing `ai` verdict or a "skip" format keep the item out of the queue? */
const queueable = (i: Enriched) => i.ai?.format !== 'skip';

export async function runForUsers(
  config: RadarConfig,
  store: RadarStore,
  opts: MultiRunOptions = {},
): Promise<MultiRunResult> {
  const now = opts.now ?? new Date();
  const env = opts.env ?? process.env;
  const warnings: string[] = [];
  const warn = (m: string) => {
    warnings.push(m);
    opts.warn?.(m);
  };

  // 1. Fetch every configured source once, shared by all users.
  const collected = await collectItems(config, { now, env, fetch: opts.fetch, warn }, warn);

  // 2. Shared feed: default niches, keyword + momentum rank only (the `none` provider).
  const always = (i: Item) => collected.alwaysIds.has(i.id);
  const feed = rank(prefilter(collected.items, config.niches, always), opts.feedLimit ?? 100);
  const feedRows = await store.upsertFeed(feed, now);

  // 3. Per Pro user.
  const provider = createProvider(config, env, warn, opts.fetch);
  const fetchFn = opts.fetch ?? createFetch(config.fetchTimeoutMs);
  const pushSender = opts.push === undefined ? createPushSender(env) : opts.push;
  const users = (await store.listProUsers(now)).filter((u) => u.niches.length > 0);
  // Custom feeds: each distinct URL fetched once, never written to the public feed.
  const customRaw = await fetchCustomFeeds(users, fetchFn, opts.resolve, warn);
  const sharedIds = new Set(collected.items.map((i) => i.id));
  const out: UserRunResult[] = [];

  for (const user of users) {
    const res: UserRunResult = {
      userId: user.id,
      ...(user.email ? { email: user.email } : {}),
      candidates: 0,
      scored: 0,
      scoringFailed: 0,
      queued: 0,
      seenMarked: 0,
      digestSent: false,
      pushSent: 0,
    };
    out.push(res);
    const uwarn = (m: string) => warn(`${user.email ?? user.id}: ${m}`);
    try {
      const wanted = new Set(user.sources);
      const shared = collected.items.filter(
        (i) => wanted.size === 0 || wanted.has(collected.sourceIds.get(i.id) ?? ''),
      );
      const ownIds = new Set(sharedIds);
      const own: Item[] = [];
      for (const feed of user.customFeeds ?? []) {
        for (const raw of customRaw.get(feed.url) ?? []) {
          const item = normalizeItem(raw, { name: feed.title, kind: 'rss' }, now);
          if (!item || ownIds.has(item.id)) continue;
          ownIds.add(item.id);
          own.push(item);
        }
      }
      const mine = [...shared, ...own];
      const seen = await store.seenUrls(
        user.id,
        mine.map((i) => i.url),
      );
      const unseen = mine.filter((i) => !seen.has(i.url));
      const ranked = rank(prefilter(unseen, user.niches, always), user.topN);
      res.candidates = ranked.length;

      const feedback = await store.feedback(user.id, opts.feedbackLimit ?? 10);
      const scored = await scoreItems(provider, ranked, {
        niches: user.niches,
        feedback,
        limit: user.topN,
        concurrency: config.scoring.concurrency,
        warn: uwarn,
      });
      res.scored = scored.items.length;
      res.scoringFailed = scored.failed.length;
      const toQueue = scored.items.filter(queueable);

      // Optional Notion sink; items it fails on are retried next run (left unseen).
      const failedUrls = new Set<string>();
      let delivered = toQueue;
      if (user.notion) {
        try {
          const client = (opts.notion ?? createNotionClient)(user.notion.token);
          const ds = await resolveDataSourceId(client, user.notion.dbId);
          const n = await upsertAll(client, ds, toQueue, now, uwarn);
          for (const u of n.failed) failedUrls.add(u);
          delivered = toQueue.filter((i) => !failedUrls.has(i.url));
          res.notion = { created: n.created, updated: n.updated, failed: n.failed.length };
        } catch (e) {
          uwarn(`notion: ${(e as Error).message}`);
        }
      }

      res.queued = await store.insertQueue(user.id, toQueue);

      if (user.telegramChatId) {
        try {
          res.digestSent = await sendDigest(
            fetchFn,
            { ...env, TELEGRAM_CHAT_ID: user.telegramChatId },
            delivered.slice(0, config.digest.top),
            res.queued,
          );
        } catch (e) {
          uwarn(`telegram: ${(e as Error).message}`);
          if (e instanceof TelegramError && e.status === 403) {
            // The user blocked the bot: stop sending until they reconnect.
            await store
              .clearTelegram(user.id)
              .catch((err: Error) => uwarn(`telegram: ${err.message}`));
          }
        }
      }

      const subs = user.pushSubscriptions ?? [];
      if (pushSender && res.queued > 0 && subs.length > 0) {
        try {
          const top = delivered.length > 0 ? delivered : toQueue;
          const sent = await sendPush(pushSender, subs, formatPush(top, res.queued));
          res.pushSent = sent.sent;
          for (const m of new Set(sent.errors)) uwarn(m);
          if (sent.gone.length > 0) await store.deletePushSubscriptions(sent.gone);
        } catch (e) {
          uwarn(`push: ${(e as Error).message}`);
        }
      }

      // Same rule as the single-user run: failed scoring or sink items stay unseen.
      const done = scored.items.filter((i) => !failedUrls.has(i.url)).map((i) => i.url);
      await store.markSeen(user.id, done, now);
      res.seenMarked = done.length;
    } catch (e) {
      res.error = (e as Error).message;
      uwarn(`run failed: ${res.error}`);
    }
  }

  return {
    provider: provider.id,
    results: collected.results,
    fetched: collected.counts.fetched,
    deduped: collected.counts.afterDedupe,
    feedRows,
    users: out,
    warnings,
  };
}
