import { getJson } from '../http.js';
import type { RawItem, SourceConfig } from '../schema.js';
import type { BuildOptions, Source, SourceContext } from './types.js';

type MastodonConfig = Extract<SourceConfig, { type: 'mastodon' }>;

interface TrendLink {
  url?: string;
  title?: string;
  description?: string;
  author_name?: string;
  provider_name?: string;
  image?: string | null;
  published_at?: string | null;
  history?: { day?: string; accounts?: string | number; uses?: string | number }[];
}

/** Trending link cards. Momentum: accounts sharing it today (uses as "comments"), falling back to yesterday. */
export function parseMastodonLinks(json: unknown): RawItem[] {
  if (!Array.isArray(json)) return [];
  const out: RawItem[] = [];
  for (const l of json as TrendLink[]) {
    if (!l.title || !l.url) continue;
    const day = (l.history ?? []).find((h) => Number(h.accounts) > 0);
    const item: RawItem = {
      url: l.url,
      title: l.title,
      snippet: l.description ?? '',
      points: Number(day?.accounts ?? 0),
      comments: Number(day?.uses ?? 0),
      tags: l.provider_name ? [l.provider_name.toLowerCase()] : [],
      media: { type: 'article', ...(l.image ? { thumbnail: l.image } : {}) },
    };
    if (l.author_name) item.author = l.author_name;
    if (l.published_at) item.publishedAt = l.published_at;
    out.push(item);
  }
  return out;
}

export function createMastodon(cfg: MastodonConfig, _opts: BuildOptions): Source {
  return {
    id: cfg.id ?? 'mastodon',
    name: 'Mastodon trending',
    kind: 'mastodon',
    alwaysInclude: cfg.alwaysInclude,
    status: { ok: cfg.enabled, ...(cfg.enabled ? {} : { reason: 'disabled in config' }) },
    async fetch(ctx: SourceContext) {
      const url = `https://${cfg.instance}/api/v1/trends/links?limit=${cfg.limit}`;
      return parseMastodonLinks(await getJson(ctx.fetch, url));
    },
  };
}
