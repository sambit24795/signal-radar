import type { ScoredItem } from '@radar/core/ranking';
import { api } from './api';
import { createStore } from './store';
import type { QueueItem, QueueStatus } from './queue';

/** What the Ideas page opens on; read once, so a save from Read lands on Picked. */
const nextTab = createStore<QueueStatus>('new');
export const openQueueOn = (status: QueueStatus) => nextTab.set(status);
export function takeQueueTab(): QueueStatus {
  const tab = nextTab.get();
  nextTab.set('new');
  return tab;
}

/** Turns what was typed into a URL: adds https:// when there is no scheme; null when it cannot be a link. */
export function normalizeLink(input: string): string | null {
  const text = input.trim();
  if (!text || /\s/.test(text)) return null;
  const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    // The server only fetches public pages, so a bare host like `localhost` is refused here too.
    if (!u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export interface AddResult {
  item: QueueItem;
  /** The link was already in the queue (HTTP 200); it is picked now. */
  existed: boolean;
}

interface AddBody {
  url: string;
  title?: string;
  snippet?: string;
  source?: string;
  niche?: string;
}

/** `POST /api/queue`: puts a link in the Picked list. 201 is new, 200 was already there. */
export async function addToIdeas(body: AddBody): Promise<AddResult> {
  let status = 201;
  const res = await api<{ item: QueueItem }>('/api/queue', {
    method: 'POST',
    json: body,
    onStatus: (s) => (status = s),
  });
  return { item: res.item, existed: status === 200 };
}

/** The request body for saving a Read item: its own title and source, and the first topic it matched. */
export function ideaBody(item: ScoredItem, niche: string | null): AddBody {
  return {
    url: item.url,
    title: item.title,
    ...(item.snippet ? { snippet: item.snippet.slice(0, 500) } : {}),
    source: item.source,
    ...(niche ? { niche } : {}),
  };
}

/** Links saved this session, so a row keeps its "Saved" after the list re-renders. */
export const savedLinks = createStore<ReadonlyMap<string, 'saved' | 'existing'>>(new Map());
export const markSaved = (url: string, how: 'saved' | 'existing') =>
  savedLinks.set((m) => new Map(m).set(url, how));
