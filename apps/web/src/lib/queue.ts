import { api } from './api';
import { formatUpdated } from './format';

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
  /** Plain description of the story, from the AI or cleaned from the source snippet. */
  summary?: string | null;
  /** Why the story is in the list, in plain words. */
  why?: string | null;
  effort?: 'S' | 'M' | 'L' | null;
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

const EFFORT: Record<'S' | 'M' | 'L', string> = {
  S: 'small effort',
  M: 'medium effort',
  L: 'large effort',
};

/** "small effort" for S/M/L; empty when the item has none. */
export function effortLabel(effort: QueueItem['effort']): string {
  return effort ? (EFFORT[effort] ?? '') : '';
}

/** The meta line: source, topic, age, effort; whatever is missing is left out. */
export function queueMeta(item: QueueItem, now: number = Date.now()): string[] {
  const age = formatUpdated(item.createdAt, now);
  return [item.source, item.niche, age, effortLabel(item.effort)].filter((p): p is string => !!p);
}

/** What the Copy action puts on the clipboard: the hook, else the title draft, else the title. */
export function copyText(item: QueueItem): { label: string; text: string } {
  if (item.hook) return { label: 'Copy hook', text: item.hook };
  if (item.titleDraft) return { label: 'Copy title', text: item.titleDraft };
  return { label: 'Copy title', text: item.title };
}

export const HINT_KEY = 'signal-radar:queue-hint-seen';

export function hintSeen(storage: Pick<Storage, 'getItem'>): boolean {
  try {
    return storage.getItem(HINT_KEY) !== null;
  } catch {
    return false;
  }
}

export function markHintSeen(storage: Pick<Storage, 'setItem'>): void {
  try {
    storage.setItem(HINT_KEY, '1');
  } catch {
    /* private mode: the hint just shows again next time */
  }
}
