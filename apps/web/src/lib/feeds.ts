import { api } from './api';
import type { CustomFeed } from './config';

export const MAX_CUSTOM_FEEDS = 15;

export interface FeedCheck extends CustomFeed {
  itemCount: number;
  sample: string[];
}

/** Asks the server to fetch and read a feed URL (Pro only). Throws `ApiError` with a readable message. */
export function checkFeed(url: string): Promise<FeedCheck> {
  return api<FeedCheck>('/api/me/feeds/check', { method: 'POST', json: { url } });
}

/** `example.com` for display; falls back to the raw text. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
