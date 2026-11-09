import { resolve } from 'node:path';
import { sendDigest } from './digest/telegram.js';
import { writeFeed } from './feed.js';
import { createFetch, type FetchFn } from './http.js';
import {
  createNotionClient,
  fetchFeedback,
  resolveDataSourceId,
  upsertAll,
  type NotionLike,
  type UpsertSummary,
} from './notion/index.js';
import { runPipeline, type PipelineResult } from './pipeline.js';
import type { RadarConfig } from './schema.js';
import { loadSeen, markSeen, pruneSeen, saveSeen } from './seen.js';
import {
  createProvider,
  emptyFeedback,
  scoreItems,
  type Enriched,
  type Feedback,
  type Provider,
} from './score/index.js';

export interface RunOptions {
  /** Directory holding seen.json and feed.json. */
  dataDir: string;
  /** Write nothing and make no Notion or Telegram calls. Scores are still shown if a key is present. */
  dry?: boolean;
  env?: Record<string, string | undefined>;
  /** Overrides the HTTP client for sources, the LLM and Telegram (tests). */
  fetch?: FetchFn;
  /** Overrides the Notion client (tests). */
  notion?: NotionLike;
  now?: Date;
  warn?: (m: string) => void;
}

export interface RunResult {
  pipeline: PipelineResult;
  provider: Provider['id'];
  /** Scored items, best first (what lands in Notion, plus `skip` items). */
  items: Enriched[];
  scoringFailed: number;
  feedback: Feedback;
  notion?: UpsertSummary;
  digestSent: boolean;
  seenMarked: number;
  warnings: string[];
}

export async function runRadar(config: RadarConfig, opts: RunOptions): Promise<RunResult> {
  const now = opts.now ?? new Date();
  const env = opts.env ?? process.env;
  const warnings: string[] = [];
  const warn = (m: string) => {
    warnings.push(m);
    opts.warn?.(m);
  };
  const dry = opts.dry ?? false;
  const seenPath = resolve(opts.dataDir, 'seen.json');

  const seen = pruneSeen(await loadSeen(seenPath, warn), now, config.seenTtlDays);
  // The pipeline's own warn is forwarded through ours, so warnings are not duplicated.
  const pipeline = await runPipeline(config, { seen, now, env, fetch: opts.fetch, warn });

  const provider = createProvider(config, env, warn, opts.fetch);

  let notion: NotionLike | undefined;
  let dataSourceId: string | undefined;
  const token = env.NOTION_TOKEN;
  const dbId = env.NOTION_DB_ID;
  if (!dry) {
    if (!token || !dbId) {
      warn('NOTION_TOKEN / NOTION_DB_ID not set; skipping the Notion upsert');
    } else {
      try {
        notion = opts.notion ?? createNotionClient(token);
        dataSourceId = await resolveDataSourceId(notion, dbId);
      } catch (e) {
        warn(`notion: ${(e as Error).message}; skipping the Notion upsert`);
        notion = undefined;
      }
    }
  }

  let feedback = emptyFeedback();
  if (notion && dataSourceId && provider.id !== 'none') {
    try {
      feedback = await fetchFeedback(notion, dataSourceId, config.scoring.feedbackLimit);
    } catch (e) {
      warn(`notion: could not read feedback rows (${(e as Error).message}); scoring without them`);
    }
  }

  const scored = await scoreItems(provider, pipeline.items, {
    niches: config.niches,
    feedback,
    limit: config.topN,
    concurrency: config.scoring.concurrency,
    warn,
  });
  // The model may mark an item "skip": it is scored (and seen) but not queued.
  const queueable = scored.items.filter((i) => i.ai?.format !== 'skip');

  const result: RunResult = {
    pipeline,
    provider: provider.id,
    items: scored.items,
    scoringFailed: scored.failed.length,
    feedback,
    digestSent: false,
    seenMarked: 0,
    warnings,
  };
  if (dry) return result;

  const failedUrls = new Set<string>();
  let digestItems = queueable;
  if (notion && dataSourceId) {
    result.notion = await upsertAll(notion, dataSourceId, queueable, now, warn);
    for (const u of result.notion.failed) failedUrls.add(u);
    digestItems = queueable.filter((i) => !failedUrls.has(i.url));
  }

  try {
    result.digestSent = await sendDigest(
      opts.fetch ?? createFetch(config.fetchTimeoutMs),
      env,
      digestItems.slice(0, config.digest.top),
      result.notion?.created ?? digestItems.length,
    );
  } catch (e) {
    warn(`telegram: ${(e as Error).message}`);
  }

  await writeFeed(resolve(opts.dataDir, 'feed.json'), pipeline.items, now);
  // Items whose scoring or Notion upsert failed stay unseen, so the next run retries them.
  const done = scored.items.filter((i) => !failedUrls.has(i.url)).map((i) => i.id);
  await saveSeen(seenPath, markSeen(seen, done, now));
  result.seenMarked = done.length;
  return result;
}
