import { ItemSchema, type Item, type RawItem, type SourceKind } from './schema.js';
import { stripHtml, truncate } from './text.js';
import { canonicalUrl, cleanUrl, urlId } from './url.js';

export interface SourceMeta {
  name: string;
  kind: SourceKind;
}

export function toIso(v: RawItem['publishedAt'], now: Date): string | undefined {
  if (v === undefined || v === '') return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return undefined;
  return (d.getTime() > now.getTime() ? now : d).toISOString();
}

/** Points (or stars) per hour of age; age is floored at 1h so brand-new items aren't infinite. */
export function perHour(
  value: number | undefined,
  publishedAt: string | undefined,
  now: Date,
): number {
  if (!value || !publishedAt) return 0;
  const hours = Math.max((now.getTime() - new Date(publishedAt).getTime()) / 3_600_000, 1);
  return Math.round((value / hours) * 100) / 100;
}

export function normalizeItem(raw: RawItem, source: SourceMeta, now: Date): Item | null {
  let url: string;
  let id: string;
  try {
    url = cleanUrl(raw.url);
    id = urlId(canonicalUrl(url));
  } catch {
    return null;
  }
  const publishedAt = toIso(raw.publishedAt, now);
  const parsed = ItemSchema.safeParse({
    id,
    url,
    title: truncate(stripHtml(raw.title), 300),
    snippet: truncate(stripHtml(raw.snippet ?? ''), 400),
    source: raw.sourceName ?? source.name,
    sourceKind: source.kind,
    ...(raw.author ? { author: raw.author } : {}),
    ...(publishedAt ? { publishedAt } : {}),
    momentum: {
      ...(raw.points !== undefined ? { points: raw.points } : {}),
      ...(raw.comments !== undefined ? { comments: raw.comments } : {}),
      ...(raw.stars !== undefined ? { stars: raw.stars } : {}),
      ...(raw.views !== undefined ? { views: raw.views } : {}),
      perHour: perHour(raw.views ?? raw.points ?? raw.stars, publishedAt, now),
    },
    tags: [...new Set((raw.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))],
    media: raw.media ?? { type: 'article' },
  });
  return parsed.success ? parsed.data : null;
}
