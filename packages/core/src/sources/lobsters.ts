import { getJson } from '../http.js';
import type { RawItem, SourceConfig } from '../schema.js';
import type { BuildOptions, Source, SourceContext } from './types.js';

type LobstersConfig = Extract<SourceConfig, { type: 'lobsters' }>;

interface LobstersStory {
  title?: string;
  url?: string;
  score?: number;
  comment_count?: number;
  created_at?: string;
  description_plain?: string;
  submitter_user?: string | { username?: string };
  tags?: string[];
  comments_url?: string;
  short_id_url?: string;
}

const URL_HOTTEST = 'https://lobste.rs/hottest.json';

export function parseLobsters(json: unknown): RawItem[] {
  if (!Array.isArray(json)) return [];
  const out: RawItem[] = [];
  for (const s of json as LobstersStory[]) {
    // Text posts have an empty url; point them at the discussion.
    const url = s.url || s.comments_url || s.short_id_url;
    if (!s.title || !url) continue;
    const author =
      typeof s.submitter_user === 'string' ? s.submitter_user : s.submitter_user?.username;
    const item: RawItem = {
      url,
      title: s.title,
      snippet: s.description_plain ?? '',
      points: s.score ?? 0,
      comments: s.comment_count ?? 0,
      tags: s.tags ?? [],
      media: { type: 'article' },
    };
    if (author) item.author = author;
    if (s.created_at) item.publishedAt = s.created_at;
    out.push(item);
  }
  return out;
}

export function createLobsters(cfg: LobstersConfig, _opts: BuildOptions): Source {
  return {
    id: cfg.id ?? 'lobsters',
    name: 'Lobsters',
    kind: 'lobsters',
    alwaysInclude: cfg.alwaysInclude,
    status: { ok: cfg.enabled, ...(cfg.enabled ? {} : { reason: 'disabled in config' }) },
    async fetch(ctx: SourceContext) {
      return parseLobsters(await getJson(ctx.fetch, URL_HOTTEST));
    },
  };
}
