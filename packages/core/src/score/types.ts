import { z } from 'zod';
import type { ScoredItem } from '../schema.js';

const words = (s: string, n: number) => s.trim().split(/\s+/).slice(0, n).join(' ');

/** What the model must return for one item. */
export const AiScoreSchema = z.object({
  score: z.coerce.number().min(0).max(100),
  why: z.string().min(1),
  /** Clamped to 45 words rather than rejected, like `hook`. */
  summary: z
    .string()
    .min(1)
    .transform((s) => words(s, 45)),
  /** Clamped to 12 words rather than rejected: the limit is a style rule, not a data error. */
  hook: z
    .string()
    .min(1)
    .transform((s) => words(s, 12)),
  angle: z.string().min(1),
  title: z.string().min(1),
  format: z.enum(['short', 'long', 'skip']),
  effort: z.enum(['S', 'M', 'L']),
});
export type AiScore = z.infer<typeof AiScoreSchema>;

/** A scored item: the keyword-ranked item plus the model's verdict (absent in `none` mode). */
export interface Enriched extends ScoredItem {
  ai?: AiScore;
  /** Plain-text stand-in for `ai.summary` / `ai.why` when no model ran (`none` mode). */
  fallback?: { summary: string | null; why: string };
}

export type ProviderId = 'none' | 'deepseek' | 'anthropic';

export interface Provider {
  id: ProviderId;
  /** Send one system+user prompt, return the raw text of the reply (expected to be JSON). */
  complete(req: { system: string; user: string }): Promise<string>;
}

/** A row the user already judged in Notion, used as a few-shot example. */
export interface FeedbackExample {
  title: string;
  source?: string;
  hook?: string;
  angle?: string;
  niches?: string[];
}

export interface Feedback {
  picked: FeedbackExample[];
  skipped: FeedbackExample[];
}

export const emptyFeedback = (): Feedback => ({ picked: [], skipped: [] });
