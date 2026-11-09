import type { Item, Niche } from '@radar/core/ranking';
import type { SourceKind } from './view';

/** A `feed_item` row as returned by `GET /api/feed`. */
export interface FeedRow {
  url: string;
  title: string;
  source: string;
  sourceType: string;
  publishedAt: string | null;
  fetchedAt: string;
  meta: Record<string, unknown>;
  keywordScore: number;
  nicheIds: string[];
}

export interface SourceRef {
  id: string;
  name: string;
  type: SourceKind;
}

export interface Defaults {
  niches: Niche[];
  sources: SourceRef[];
}

export interface Feed {
  items: Item[];
  /** Newest `fetchedAt` among the rows, for a "last updated" label. */
  updatedAt: string | null;
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

const KINDS: readonly string[] = [
  'hn',
  'reddit',
  'github',
  'rss',
  'lobsters',
  'devto',
  'mastodon',
  'youtube',
];
const MEDIA: readonly string[] = ['article', 'video', 'short', 'repo', 'social'];

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Maps one API row to a core `Item`; returns null for rows the client cannot rank. */
export function rowToItem(row: FeedRow): Item | null {
  if (!row.url || !row.title || !KINDS.includes(row.sourceType)) return null;
  const meta = obj(row.meta);
  const momentum = obj(meta.momentum);
  const media = obj(meta.media);
  const mediaType = typeof media.type === 'string' && MEDIA.includes(media.type) ? media.type : '';
  const published = row.publishedAt && !Number.isNaN(Date.parse(row.publishedAt));
  const points = num(momentum.points);
  const comments = num(momentum.comments);
  const stars = num(momentum.stars);
  const thumbnail = typeof media.thumbnail === 'string' ? media.thumbnail : undefined;

  return {
    id: row.url,
    url: row.url,
    title: row.title,
    snippet: typeof meta.snippet === 'string' ? meta.snippet : '',
    source: row.source,
    sourceKind: row.sourceType as Item['sourceKind'],
    ...(typeof meta.author === 'string' && meta.author ? { author: meta.author } : {}),
    ...(published ? { publishedAt: new Date(row.publishedAt!).toISOString() } : {}),
    momentum: {
      perHour: num(momentum.perHour) ?? 0,
      ...(points !== undefined ? { points } : {}),
      ...(comments !== undefined ? { comments } : {}),
      ...(stars !== undefined ? { stars } : {}),
    },
    tags: Array.isArray(meta.tags) ? meta.tags.filter((t) => typeof t === 'string') : [],
    media: {
      type: (mediaType ||
        (row.sourceType === 'github' ? 'repo' : 'article')) as Item['media']['type'],
      ...(thumbnail ? { thumbnail } : {}),
    },
  };
}

async function getJson<T>(path: string, fetchFn: FetchFn): Promise<T> {
  const res = await fetchFn(path, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

/** Fetches the shared feed (newest first, up to `limit` rows) and maps it to core `Item`s. */
export async function fetchFeed(fetchFn: FetchFn = fetch, limit = 500): Promise<Feed> {
  const { items: rows } = await getJson<{ items: FeedRow[] }>(`/api/feed?limit=${limit}`, fetchFn);
  const items = rows.map(rowToItem).filter((i): i is Item => i !== null);
  const updatedAt = rows.reduce<string | null>(
    (latest, r) => (latest === null || r.fetchedAt > latest ? r.fetchedAt : latest),
    null,
  );
  return { items, updatedAt };
}

export function fetchDefaults(fetchFn: FetchFn = fetch): Promise<Defaults> {
  return getJson<Defaults>('/api/feed/defaults', fetchFn);
}
