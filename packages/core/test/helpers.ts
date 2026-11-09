import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FetchFn } from '../src/http.js';
import type { Niche } from '../src/schema.js';
import type { SourceContext } from '../src/sources/index.js';

export const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');

export const NOW = new Date('2026-11-09T06:00:00Z');

export const niches: Niche[] = [
  { id: 'ai', name: 'AI', weight: 1, keywords: ['claude', 'llm', 'agent', 'openai'] },
  {
    id: 'handheld',
    name: 'Handheld',
    weight: 1,
    keywords: ['steam deck', 'emudeck', { term: 'xenia', weight: 2 }],
  },
];

export function res(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers });
}

/** Fake fetch routed by URL substring; unmatched URLs throw. */
export function routedFetch(routes: Record<string, () => Response>) {
  const calls: string[] = [];
  const fn: FetchFn = async (url) => {
    calls.push(url);
    for (const [needle, make] of Object.entries(routes)) {
      if (url.includes(needle)) return make();
    }
    throw new Error(`no fixture route for ${url}`);
  };
  return Object.assign(fn, { calls });
}

export function makeCtx(
  fetch: FetchFn,
  extra: Partial<SourceContext> = {},
): SourceContext & {
  warnings: string[];
} {
  const warnings: string[] = [];
  return {
    fetch,
    now: NOW,
    niches,
    env: {},
    state: new Map(),
    warn: (m) => warnings.push(m),
    ...extra,
    warnings,
  };
}
