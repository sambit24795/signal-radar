import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { z } from 'zod';
import { HttpError, type FetchFn } from './http.js';
import { fetchPublicText, type Resolver } from './netguard.js';
import type { Provider } from './score/types.js';

/** Below this many characters of article text the page counts as unreadable. */
export const MIN_ARTICLE_CHARS = 400;
/** Article text sent to the model is cut to this many characters. */
export const MAX_INPUT_CHARS = 12_000;
export const SUMMARY_FETCH_MAX_BYTES = 2_000_000;

export const PageSummarySchema = z.object({
  tldr: z.string().trim().min(1),
  points: z.array(z.string().trim().min(1)).min(1),
});
export type PageSummary = z.infer<typeof PageSummarySchema>;

export type SummarizeResult =
  ({ status: 'ok' } & PageSummary) | { status: 'unreadable'; reason: string };

export const SUMMARY_SYSTEM = [
  'You summarize a web page for a reader deciding whether to read it.',
  'Be plain and factual: say what the page claims and shows, with concrete names, numbers and dates from the text.',
  'No hype, no filler, no opinions of your own, nothing that is not in the text.',
  'Reply with one JSON object only: {"tldr": string, "points": string[]}.',
  '"tldr" is 1 to 2 sentences, under 50 words. "points" is 3 to 5 short bullets, each under 20 words, no leading dash.',
].join('\n');

export function buildSummaryPrompt(title: string, text: string): string {
  return `Title: ${title || '(none)'}\n\nPage text:\n${text.slice(0, MAX_INPUT_CHARS)}`;
}

/** Readable article text and title from raw HTML, or null when the page has no article body. */
export function extractArticle(html: string, url: string): { title: string; text: string } | null {
  try {
    const { document } = parseHTML(html);
    // Readability resolves relative links against the document URL.
    try {
      Object.defineProperty(document, 'documentURI', { value: url, configurable: true });
    } catch {
      /* not needed for text extraction */
    }
    const article = new Readability(
      document as unknown as ConstructorParameters<typeof Readability>[0],
      {
        charThreshold: 200,
      },
    ).parse();
    const text = (article?.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return null;
    return { title: (article?.title ?? '').trim(), text };
  } catch {
    return null;
  }
}

/** Parse the model's reply: tolerates code fences, trims to 5 points, 2 sentences stay as given. */
export function parsePageSummary(reply: string): PageSummary {
  const cleaned = reply.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('no JSON object in reply');
  const parsed = PageSummarySchema.parse(JSON.parse(cleaned.slice(start, end + 1)));
  return {
    tldr: parsed.tldr,
    points: parsed.points.map((p) => p.replace(/^[-*•]\s*/, '')).slice(0, 5),
  };
}

const isYouTube = (url: string): boolean => {
  const h = new URL(url).hostname.replace(/^www\./, '');
  return h === 'youtu.be' || h === 'youtube.com' || h.endsWith('.youtube.com');
};

export interface SummarizeOptions {
  provider: Provider;
  fetch?: FetchFn;
  resolve?: Resolver;
}

/**
 * Fetch a page (SSRF-pinned, 2 MB cap), extract the article and summarize it.
 * `unreadable` is a stable property of the page (video, paywall, too little text) and safe to cache.
 * Throws UnsafeUrlError for blocked URLs and plain Errors for transient failures
 * (network, model); those must not be cached.
 */
export async function summarizePage(url: string, o: SummarizeOptions): Promise<SummarizeResult> {
  if (isYouTube(url)) return { status: 'unreadable', reason: 'video' };
  let html: string;
  try {
    ({ text: html } = await fetchPublicText(url, {
      headers: { accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' },
      maxBytes: SUMMARY_FETCH_MAX_BYTES,
      ...(o.fetch ? { fetch: o.fetch } : {}),
      ...(o.resolve ? { resolve: o.resolve } : {}),
    }));
  } catch (e) {
    // 4xx (paywall, 404, bot wall) is stable; 5xx, 429 and network errors are transient.
    if (e instanceof HttpError && e.status >= 400 && e.status < 500 && e.status !== 429) {
      return { status: 'unreadable', reason: `http ${e.status}` };
    }
    throw e;
  }
  const article = extractArticle(html, url);
  if (!article || article.text.length < MIN_ARTICLE_CHARS) {
    return { status: 'unreadable', reason: 'too little text' };
  }
  const user = buildSummaryPrompt(article.title, article.text);
  // One retry: JSON mode occasionally returns an unusable reply.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const reply = await o.provider.complete({ system: SUMMARY_SYSTEM, user });
      return { status: 'ok', ...parsePageSummary(reply) };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}
