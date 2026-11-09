import { getJson } from '../http.js';
import type { RawItem, SourceConfig } from '../schema.js';
import { stripHtml } from '../text.js';
import type { BuildOptions, Source, SourceContext } from './types.js';

type HnConfig = Extract<SourceConfig, { type: 'hn' }>;

interface AlgoliaHit {
  objectID: string;
  title?: string | null;
  url?: string | null;
  author?: string;
  points?: number | null;
  num_comments?: number | null;
  created_at_i?: number;
  story_text?: string | null;
}

const BASE = 'https://hn.algolia.com/api/v1/search';

export function parseHn(json: unknown): RawItem[] {
  const hits = (json as { hits?: AlgoliaHit[] }).hits ?? [];
  const out: RawItem[] = [];
  for (const h of hits) {
    if (!h.title) continue;
    const item: RawItem = {
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      title: h.title,
      snippet: h.story_text ? stripHtml(h.story_text) : '',
      points: h.points ?? 0,
      comments: h.num_comments ?? 0,
      tags: ['hn'],
      media: { type: 'article' },
    };
    if (h.author) item.author = h.author;
    if (h.created_at_i) item.publishedAt = h.created_at_i * 1000;
    out.push(item);
  }
  return out;
}

export function createHn(cfg: HnConfig, _opts: BuildOptions): Source {
  return {
    id: cfg.id ?? 'hn',
    name: 'Hacker News',
    kind: 'hn',
    alwaysInclude: cfg.alwaysInclude,
    status: { ok: cfg.enabled, ...(cfg.enabled ? {} : { reason: 'disabled in config' }) },
    async fetch(ctx: SourceContext) {
      const urls: string[] = [];
      if (cfg.frontPage) {
        urls.push(`${BASE}?tags=front_page&hitsPerPage=${cfg.hitsPerPage}`);
      }
      if (cfg.keywordSearch) {
        const since = Math.floor(ctx.now.getTime() / 1000 - cfg.daysBack * 86400);
        for (const niche of ctx.niches) {
          const words = niche.keywords
            .map((k) => (typeof k === 'string' ? k : k.term))
            .filter((k) => !/\s/.test(k))
            .slice(0, cfg.keywordsPerNiche);
          if (words.length === 0) continue;
          const q = encodeURIComponent(words.join(' '));
          urls.push(
            `${BASE}?tags=story&query=${q}&optionalWords=${q}` +
              `&numericFilters=${encodeURIComponent(`created_at_i>${since},points>=${cfg.minPoints}`)}` +
              `&hitsPerPage=${cfg.hitsPerPage}`,
          );
        }
      }
      const results = await Promise.allSettled(urls.map((u) => getJson(ctx.fetch, u)));
      const items: RawItem[] = [];
      const seen = new Set<string>();
      let failed = 0;
      for (const r of results) {
        if (r.status === 'rejected') {
          failed++;
          ctx.warn(`hn: ${(r.reason as Error).message}`);
          continue;
        }
        for (const it of parseHn(r.value)) {
          if (seen.has(it.url)) continue;
          seen.add(it.url);
          items.push(it);
        }
      }
      if (failed === urls.length && urls.length > 0) throw new Error('all HN requests failed');
      return items;
    },
  };
}
