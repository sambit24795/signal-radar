import { api, ApiError } from './api';
import { showGate } from './gate';
import { createStore } from './store';

/** One page's summary as the reader sees it. `open` is whether the panel under the story is showing. */
export interface SummaryState {
  open: boolean;
  status: 'idle' | 'pending' | 'ok' | 'unreadable' | 'error';
  tldr?: string;
  points?: string[];
  message?: string;
}

export type SummaryAction =
  | { type: 'toggle' }
  | { type: 'start' }
  | { type: 'ok'; tldr: string; points: string[] }
  | { type: 'unreadable' }
  | { type: 'fail'; message: string }
  | { type: 'reset' };

export const IDLE: SummaryState = { open: false, status: 'idle' };

export function summaryReduce(s: SummaryState, a: SummaryAction): SummaryState {
  switch (a.type) {
    case 'toggle':
      return { ...s, open: !s.open };
    case 'start':
      return { open: true, status: 'pending' };
    case 'ok':
      return { open: true, status: 'ok', tldr: a.tldr, points: a.points };
    case 'unreadable':
      return { open: true, status: 'unreadable' };
    case 'fail':
      return { open: true, status: 'error', message: a.message };
    case 'reset':
      return IDLE;
  }
}

/** Opening a panel that has no answer yet (or a failed one) asks the server; a finished one just shows. */
export function needsRequest(s: SummaryState): boolean {
  return s.status === 'idle' || s.status === 'error';
}

/** Summaries read this session, by URL, so they survive the list re-rendering. */
export const summaries = createStore<ReadonlyMap<string, SummaryState>>(new Map());

export function dispatchSummary(url: string, action: SummaryAction): void {
  summaries.set((m) => new Map(m).set(url, summaryReduce(m.get(url) ?? IDLE, action)));
}

/** New summaries a free account has left today; null until the server has said (Pro never sets it). */
export const freeLeft = createStore<{ remaining: number; limit: number } | null>(null);

interface SummarizeReply {
  remaining?: number;
  limit?: number;
  status: 'ok' | 'unreadable';
  tldr?: string;
  points?: string[];
}

/** `POST /api/summarize`: reads the page and updates the stored state. 401 returns 'auth' for the caller. */
export async function requestSummary(url: string): Promise<'done' | 'auth'> {
  dispatchSummary(url, { type: 'start' });
  try {
    const res = await api<SummarizeReply>('/api/summarize', { method: 'POST', json: { url } });
    if (typeof res.remaining === 'number' && typeof res.limit === 'number') {
      freeLeft.set({ remaining: res.remaining, limit: res.limit });
    }
    if (res.status === 'ok' && res.tldr) {
      dispatchSummary(url, { type: 'ok', tldr: res.tldr, points: res.points ?? [] });
    } else {
      dispatchSummary(url, { type: 'unreadable' });
    }
    return 'done';
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      // Signed out: nothing was read, so the button goes back to "Summarize" and the sign-in sheet opens.
      dispatchSummary(url, { type: 'reset' });
      showGate('summary');
      return 'auth';
    }
    dispatchSummary(url, {
      type: 'fail',
      message: e instanceof Error ? e.message : 'Could not summarize that page.',
    });
    return 'done';
  }
}
