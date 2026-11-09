import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { FeedItemSchema, type FeedItem, type ScoredItem } from './schema.js';

/** Public fields only: no scores, niches or tags. */
export function toFeedItem(item: ScoredItem): FeedItem {
  return FeedItemSchema.parse({
    title: item.title,
    url: item.url,
    source: item.source,
    snippet: item.snippet,
    momentum: item.momentum,
    media: item.media,
    ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}),
  });
}

export async function writeFeed(path: string, items: ScoredItem[], now: Date): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const body = { generatedAt: now.toISOString(), items: items.map(toFeedItem) };
  await writeFile(path, JSON.stringify(body, null, 2) + '\n');
}
