import { mapLimit } from './concurrency.js';
import { dedupe } from './dedupe.js';
import { createFetch, type FetchFn } from './http.js';
import { normalizeItem } from './normalize.js';
import { prefilter } from './prefilter.js';
import { rank } from './rank.js';
import type { Item, RadarConfig, RawItem, ScoredItem } from './schema.js';
import { filterUnseen, type SeenStore } from './seen.js';
import { buildSources, type Source, type SourceContext } from './sources/index.js';

export interface SourceResult {
  source: Source;
  items: RawItem[];
  /** Set when the source was skipped (disabled) or failed. */
  error?: string;
  skipped?: boolean;
  ms: number;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/** Fetch every source; any failure becomes a warning and an empty result. */
export async function fetchAll(
  sources: Source[],
  ctx: SourceContext,
  opts: { concurrency: number; timeoutMs: number },
): Promise<SourceResult[]> {
  return mapLimit(sources, opts.concurrency, async (source): Promise<SourceResult> => {
    const start = Date.now();
    if (!source.status.ok) {
      return { source, items: [], skipped: true, error: source.status.reason ?? 'disabled', ms: 0 };
    }
    try {
      const items = await withTimeout(source.fetch(ctx), opts.timeoutMs * 4, source.id);
      return { source, items, ms: Date.now() - start };
    } catch (e) {
      const msg = (e as Error).message;
      ctx.warn(`${source.id}: ${msg}`);
      return { source, items: [], error: msg, ms: Date.now() - start };
    }
  });
}

export interface PipelineOptions {
  seen: SeenStore;
  fetch?: FetchFn;
  now?: Date;
  env?: Record<string, string | undefined>;
  warn?: (msg: string) => void;
}

export interface PipelineResult {
  items: ScoredItem[];
  results: SourceResult[];
  warnings: string[];
  counts: {
    fetched: number;
    normalized: number;
    afterDedupe: number;
    afterSeen: number;
    afterPrefilter: number;
    final: number;
  };
}

export interface Collected {
  /** Normalized and de-duplicated, before any seen/niche filtering. */
  items: Item[];
  /** Ids of items that skip the zero-keyword-hit drop (their source is alwaysInclude). */
  alwaysIds: Set<string>;
  /** item id -> id of the source that produced it. */
  sourceIds: Map<string, string>;
  results: SourceResult[];
  counts: { fetched: number; normalized: number; afterDedupe: number };
}

/** Fetch every source once, normalize and de-duplicate. Shared by single- and multi-user runs. */
export async function collectItems(
  config: RadarConfig,
  opts: Omit<PipelineOptions, 'seen'>,
  warn: (m: string) => void,
): Promise<Collected> {
  const now = opts.now ?? new Date();
  const sources = buildSources(config.sources, { rsshubBase: config.rsshubBase });
  const ctx: SourceContext = {
    fetch: opts.fetch ?? createFetch(config.fetchTimeoutMs),
    now,
    niches: config.niches,
    env: opts.env ?? process.env,
    state: new Map(),
    warn,
  };

  const results = await fetchAll(sources, ctx, {
    concurrency: config.concurrency,
    timeoutMs: config.fetchTimeoutMs,
  });

  const alwaysIds = new Set<string>();
  const sourceIds = new Map<string, string>();
  const normalized: Item[] = [];
  let fetched = 0;
  for (const r of results) {
    fetched += r.items.length;
    for (const raw of r.items) {
      const item = normalizeItem(raw, r.source, now);
      if (!item) continue;
      normalized.push(item);
      if (!sourceIds.has(item.id)) sourceIds.set(item.id, r.source.id);
      if (r.source.alwaysInclude) alwaysIds.add(item.id);
    }
  }

  const items = dedupe(normalized, config.dedupeThreshold).items;
  return {
    items,
    alwaysIds,
    sourceIds,
    results,
    counts: { fetched, normalized: normalized.length, afterDedupe: items.length },
  };
}

export async function runPipeline(
  config: RadarConfig,
  opts: PipelineOptions,
): Promise<PipelineResult> {
  const warnings: string[] = [];
  const warn = (m: string) => {
    warnings.push(m);
    opts.warn?.(m);
  };
  const { items: deduped, alwaysIds, results, counts: c } = await collectItems(config, opts, warn);
  const unseen = filterUnseen(deduped, opts.seen);
  const filtered = prefilter(unseen, config.niches, (i) => alwaysIds.has(i.id));
  const items = rank(filtered, config.topN);

  return {
    items,
    results,
    warnings,
    counts: {
      fetched: c.fetched,
      normalized: c.normalized,
      afterDedupe: c.afterDedupe,
      afterSeen: unseen.length,
      afterPrefilter: filtered.length,
      final: items.length,
    },
  };
}
