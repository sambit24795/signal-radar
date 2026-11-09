import { z } from 'zod';

export const SourceKindSchema = z.enum(['hn', 'reddit', 'github', 'rss']);
export type SourceKind = z.infer<typeof SourceKindSchema>;

export const MediaTypeSchema = z.enum(['article', 'video', 'short', 'repo', 'social']);
export type MediaType = z.infer<typeof MediaTypeSchema>;

export const MomentumSchema = z.object({
  points: z.number().optional(),
  comments: z.number().optional(),
  stars: z.number().optional(),
  perHour: z.number(),
});
export type Momentum = z.infer<typeof MomentumSchema>;

export const ItemSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  title: z.string().min(1),
  snippet: z.string(),
  source: z.string(),
  sourceKind: SourceKindSchema,
  author: z.string().optional(),
  publishedAt: z.string().datetime({ offset: true }).optional(),
  momentum: MomentumSchema,
  tags: z.array(z.string()),
  media: z.object({ type: MediaTypeSchema, thumbnail: z.string().optional() }),
});
export type Item = z.infer<typeof ItemSchema>;

/** What a fetcher returns before normalization. */
export interface RawItem {
  url: string;
  title: string;
  snippet?: string;
  author?: string;
  publishedAt?: Date | string | number;
  points?: number;
  comments?: number;
  stars?: number;
  tags?: string[];
  media?: { type: MediaType; thumbnail?: string };
  /** Overrides the source's display name for this item (e.g. `r/SteamDeck`). */
  sourceName?: string;
}

/** Item plus pipeline-only fields (never published). */
export interface ScoredItem extends Item {
  /** Weighted keyword relevance (0 for alwaysInclude items with no hits). */
  keywordScore: number;
  /** Final ranking score used for ordering. */
  score: number;
  niches: string[];
}

/** Public fields written to data/feed.json. */
export const FeedItemSchema = ItemSchema.pick({
  title: true,
  url: true,
  source: true,
  snippet: true,
  momentum: true,
  media: true,
  publishedAt: true,
});
export type FeedItem = z.infer<typeof FeedItemSchema>;

// ---- config ----

const KeywordSchema = z.union([
  z.string().min(1),
  z.object({ term: z.string().min(1), weight: z.number().positive().default(1) }),
]);

export const NicheSchema = z.object({
  id: z.string(),
  name: z.string(),
  weight: z.number().positive().default(1),
  keywords: z.array(KeywordSchema).min(1),
});
export type Niche = z.infer<typeof NicheSchema>;

const sourceBase = {
  /** Unique id; defaults are derived per type. */
  id: z.string().optional(),
  /** Items from this source skip the zero-keyword-hit drop. */
  alwaysInclude: z.boolean().default(false),
  enabled: z.boolean().default(true),
};

export const SourceConfigSchema = z.discriminatedUnion('type', [
  z.object({
    ...sourceBase,
    type: z.literal('hn'),
    frontPage: z.boolean().default(true),
    keywordSearch: z.boolean().default(true),
    keywordsPerNiche: z.number().int().positive().default(8),
    minPoints: z.number().int().nonnegative().default(15),
    daysBack: z.number().positive().default(3),
    hitsPerPage: z.number().int().positive().default(30),
  }),
  z.object({
    ...sourceBase,
    type: z.literal('reddit'),
    /** Fetched as one multireddit request (r/a+b+c): Reddit allows ~1 unauthenticated request per 30s. */
    subreddits: z.array(z.string()).min(1),
    limit: z.number().int().positive().default(100),
  }),
  z.object({
    ...sourceBase,
    type: z.literal('github'),
    topics: z.array(z.string()).min(1),
    daysBack: z.number().positive().default(7),
    perTopic: z.number().int().positive().default(15),
  }),
  z.object({
    ...sourceBase,
    type: z.literal('rss'),
    name: z.string(),
    /** http(s) feed URL, or `rsshub:/path` resolved against rsshubBase. */
    url: z.string(),
    mediaType: MediaTypeSchema.optional(),
    tags: z.array(z.string()).default([]),
  }),
]);
export type SourceConfig = z.infer<typeof SourceConfigSchema>;
export type SourceConfigInput = z.input<typeof SourceConfigSchema>;

export const RadarConfigSchema = z.object({
  niches: z.array(NicheSchema).min(1),
  sources: z.array(SourceConfigSchema),
  /** Base URL of an RSSHub instance, e.g. http://localhost:1200. Unset = rsshub sources disabled. */
  rsshubBase: z.string().url().optional(),
  provider: z.enum(['none', 'deepseek', 'anthropic']).default('none'),
  /** How many items survive the keyword prefilter into scoring (and ranking). */
  topN: z.number().int().positive().default(30),
  scoring: z
    .object({
      deepseekModel: z.string().default('deepseek-flash'),
      deepseekBaseUrl: z.string().url().default('https://api.deepseek.com'),
      anthropicModel: z.string().default('claude-haiku-5-5'),
      maxTokens: z.number().int().positive().default(700),
      timeoutMs: z.number().int().positive().default(60000),
      concurrency: z.number().int().positive().default(4),
      /** Max Picked and Skipped rows (each) read from Notion as few-shot examples. */
      feedbackLimit: z.number().int().nonnegative().default(10),
    })
    .prefault({}),
  digest: z.object({ top: z.number().int().positive().default(5) }).prefault({}),
  dataDir: z.string().default('data'),
  fetchTimeoutMs: z.number().int().positive().default(15000),
  concurrency: z.number().int().positive().default(4),
  seenTtlDays: z.number().positive().default(30),
  dedupeThreshold: z.number().min(0).max(1).default(0.85),
});
export type RadarConfig = z.infer<typeof RadarConfigSchema>;
export type RadarConfigInput = z.input<typeof RadarConfigSchema>;

export function defineConfig(input: RadarConfigInput): RadarConfig {
  return RadarConfigSchema.parse(input);
}
