import { mapLimit } from '../concurrency.js';
import { createFetch, type FetchFn } from '../http.js';
import type { RadarConfig, ScoredItem } from '../schema.js';
import { anthropicProvider } from './anthropic.js';
import { deepseekProvider } from './deepseek.js';
import { noneProvider } from './none.js';
import { buildSystemPrompt, buildUserPrompt } from './prompt.js';
import {
  AiScoreSchema,
  emptyFeedback,
  type AiScore,
  type Enriched,
  type Feedback,
  type Provider,
} from './types.js';

export * from './types.js';
export { buildSystemPrompt, buildUserPrompt } from './prompt.js';
export { noneProvider } from './none.js';
export { deepseekProvider } from './deepseek.js';
export { anthropicProvider } from './anthropic.js';

const KEY_ENV = { deepseek: 'DEEPSEEK_API_KEY', anthropic: 'ANTHROPIC_API_KEY' } as const;

/** Build the configured provider; a missing key falls back to `none` with a warning. */
export function createProvider(
  config: RadarConfig,
  env: Record<string, string | undefined>,
  warn: (m: string) => void,
  fetchFn?: FetchFn,
): Provider {
  if (config.provider === 'none') return noneProvider;
  const keyName = KEY_ENV[config.provider];
  const apiKey = env[keyName];
  if (!apiKey) {
    warn(
      `provider "${config.provider}" needs ${keyName}; falling back to "none" (keyword rank only)`,
    );
    return noneProvider;
  }
  const s = config.scoring;
  const fetch = fetchFn ?? createFetch(s.timeoutMs);
  return config.provider === 'deepseek'
    ? deepseekProvider({
        apiKey,
        model: s.deepseekModel,
        baseUrl: s.deepseekBaseUrl,
        maxTokens: s.maxTokens,
        fetch,
      })
    : anthropicProvider({ apiKey, model: s.anthropicModel, maxTokens: s.maxTokens, fetch });
}

/** Pull the JSON object out of a reply, tolerating code fences or stray prose. */
export function parseAiScore(text: string): AiScore {
  const cleaned = text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('no JSON object in reply');
  return AiScoreSchema.parse(JSON.parse(cleaned.slice(start, end + 1)));
}

/** Score one item; one retry on any failure, then give up (null). */
export async function scoreOne(
  provider: Provider,
  system: string,
  item: ScoredItem,
  warn: (m: string) => void,
): Promise<AiScore | null> {
  const user = buildUserPrompt(item);
  let lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return parseAiScore(await provider.complete({ system, user }));
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  warn(`scoring failed twice, skipping "${item.title.slice(0, 60)}": ${lastErr.slice(0, 120)}`);
  return null;
}

export interface ScoreResult {
  /** Successfully scored items, best first. Without a provider: the input order, no `ai`. */
  items: Enriched[];
  /** Items the model failed twice on; they are not marked seen, so a later run retries them. */
  failed: ScoredItem[];
}

/** Score the top `limit` items (input is already rank-ordered) and re-sort by the AI score. */
export async function scoreItems(
  provider: Provider,
  items: ScoredItem[],
  opts: {
    niches: RadarConfig['niches'];
    feedback?: Feedback;
    limit: number;
    concurrency: number;
    warn: (m: string) => void;
  },
): Promise<ScoreResult> {
  const top = items.slice(0, opts.limit);
  if (provider.id === 'none') return { items: top, failed: [] };
  const system = buildSystemPrompt(opts.niches, opts.feedback ?? emptyFeedback());
  const scored = await mapLimit(top, opts.concurrency, async (item) => ({
    item,
    ai: await scoreOne(provider, system, item, opts.warn),
  }));
  const ok: Enriched[] = [];
  const failed: ScoredItem[] = [];
  for (const { item, ai } of scored) {
    if (ai) ok.push({ ...item, ai });
    else failed.push(item);
  }
  // Array.sort is stable, so equal AI scores keep their keyword-rank order.
  ok.sort((a, b) => (b.ai?.score ?? 0) - (a.ai?.score ?? 0));
  return { items: ok, failed };
}
