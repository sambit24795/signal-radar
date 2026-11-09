import { getJson } from '../http.js';
import type { RawItem, SourceConfig } from '../schema.js';
import type { BuildOptions, Source, SourceContext } from './types.js';

type DevtoConfig = Extract<SourceConfig, { type: 'devto' }>;

interface DevtoArticle {
  title?: string;
  url?: string;
  description?: string;
  positive_reactions_count?: number;
  public_reactions_count?: number;
  comments_count?: number;
  published_at?: string;
  published_timestamp?: string;
  tag_list?: string[] | string;
  cover_image?: string | null;
  user?: { username?: string; name?: string };
}

export function parseDevto(json: unknown): RawItem[] {
  if (!Array.isArray(json)) return [];
  const out: RawItem[] = [];
  for (const a of json as DevtoArticle[]) {
    if (!a.title || !a.url) continue;
    const tags = Array.isArray(a.tag_list)
      ? a.tag_list
      : typeof a.tag_list === 'string'
        ? a.tag_list.split(',').map((t) => t.trim())
        : [];
    const item: RawItem = {
      url: a.url,
      title: a.title,
      snippet: a.description ?? '',
      points: a.positive_reactions_count ?? a.public_reactions_count ?? 0,
      comments: a.comments_count ?? 0,
      tags,
      media: { type: 'article', ...(a.cover_image ? { thumbnail: a.cover_image } : {}) },
    };
    const author = a.user?.username ?? a.user?.name;
    if (author) item.author = author;
    const published = a.published_at ?? a.published_timestamp;
    if (published) item.publishedAt = published;
    out.push(item);
  }
  return out;
}

export function createDevto(cfg: DevtoConfig, _opts: BuildOptions): Source {
  return {
    id: cfg.id ?? 'devto',
    name: 'DEV Community',
    kind: 'devto',
    alwaysInclude: cfg.alwaysInclude,
    status: { ok: cfg.enabled, ...(cfg.enabled ? {} : { reason: 'disabled in config' }) },
    async fetch(ctx: SourceContext) {
      // top=1: the most-reacted articles of the last day.
      const url = `https://dev.to/api/articles?top=1&per_page=${cfg.perPage}`;
      return parseDevto(await getJson(ctx.fetch, url));
    },
  };
}
