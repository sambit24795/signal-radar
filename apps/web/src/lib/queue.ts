import { api } from './api';

export type QueueStatus = 'new' | 'picked' | 'skipped';

export interface QueueItem {
  id: string;
  url: string;
  title: string;
  source: string;
  niche: string | null;
  score: number;
  hook: string | null;
  angle: string | null;
  titleDraft: string | null;
  format: string | null;
  reasons: string[];
  status: QueueStatus;
  createdAt: string;
  decidedAt: string | null;
}

export interface QueuePage {
  items: QueueItem[];
  nextCursor: string | null;
}

export function fetchQueue(status: QueueStatus, cursor?: string | null): Promise<QueuePage> {
  const q = new URLSearchParams({ status });
  if (cursor) q.set('cursor', cursor);
  return api<QueuePage>(`/api/queue?${q}`);
}

const ACTION: Record<QueueStatus, string> = { new: 'reset', picked: 'pick', skipped: 'skip' };

/** Moves an item to `status` (new = undo). */
export function decideQueueItem(id: string, status: QueueStatus): Promise<unknown> {
  return api(`/api/queue/${id}/${ACTION[status]}`, { method: 'POST' });
}

export interface QueueState {
  items: QueueItem[];
  nextCursor: string | null;
  /** The row the keyboard acts on. */
  selected: string | null;
}

export const initialQueue: QueueState = { items: [], nextCursor: null, selected: null };

export type QueueAction =
  | { type: 'clear' }
  | { type: 'loaded'; page: QueuePage; append: boolean }
  | { type: 'remove'; id: string }
  | { type: 'restore'; item: QueueItem; index: number }
  | { type: 'select'; id: string }
  | { type: 'move'; delta: 1 | -1 };

/** Optimistic list state: a decided item leaves the list at once and can be put back in place. */
export function queueReducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case 'clear':
      return initialQueue;
    case 'loaded': {
      const known = new Set(state.items.map((i) => i.id));
      const items = action.append
        ? [...state.items, ...action.page.items.filter((i) => !known.has(i.id))]
        : action.page.items;
      const keep = action.append && state.selected !== null;
      return {
        items,
        nextCursor: action.page.nextCursor,
        selected: keep ? state.selected : (items[0]?.id ?? null),
      };
    }
    case 'remove': {
      const index = state.items.findIndex((i) => i.id === action.id);
      if (index < 0) return state;
      const items = state.items.filter((i) => i.id !== action.id);
      const selected =
        state.selected === action.id
          ? (items[Math.min(index, items.length - 1)]?.id ?? null)
          : state.selected;
      return { ...state, items, selected };
    }
    case 'restore': {
      if (state.items.some((i) => i.id === action.item.id)) return state;
      const items = [...state.items];
      items.splice(Math.max(0, Math.min(action.index, items.length)), 0, action.item);
      return { ...state, items, selected: action.item.id };
    }
    case 'select':
      return state.items.some((i) => i.id === action.id)
        ? { ...state, selected: action.id }
        : state;
    case 'move': {
      if (state.items.length === 0) return state;
      const at = state.items.findIndex((i) => i.id === state.selected);
      const next = Math.max(0, Math.min(state.items.length - 1, at < 0 ? 0 : at + action.delta));
      return { ...state, selected: state.items[next]!.id };
    }
  }
}

export const STATUS_LABEL: Record<QueueStatus, string> = {
  new: 'New',
  picked: 'Picked',
  skipped: 'Skipped',
};
