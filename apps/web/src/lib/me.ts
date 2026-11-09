import { useEffect } from 'react';
import { api, ApiError } from './api';
import { createStore } from './store';

export interface Subscription {
  plan: 'free' | 'pro';
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'none';
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  isPro: boolean;
}

export interface Me {
  user: { id: string; name: string; email: string };
  subscription: Subscription;
}

export type MeState =
  | { status: 'loading' }
  | { status: 'anon' }
  | { status: 'error'; message: string }
  | { status: 'ready'; me: Me };

const store = createStore<MeState>({ status: 'loading' });
let inflight: Promise<void> | null = null;
let lastFetch = 0;

/** Fetches `/api/me`; 401 means signed out. A failed refresh keeps whatever was already shown. */
export function refreshMe(): Promise<void> {
  if (inflight) return inflight;
  lastFetch = Date.now();
  inflight = api<Me>('/api/me')
    .then((me) => store.set({ status: 'ready', me }))
    .catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 401) store.set({ status: 'anon' });
      else if (store.get().status !== 'ready') {
        store.set({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function clearMe(): void {
  store.set({ status: 'anon' });
}

/** Session state, fetched on first use and again whenever the tab regains focus. */
export function useMe(): MeState {
  const state = store.use();
  useEffect(() => {
    if (store.get().status === 'loading') void refreshMe();
    const onFocus = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetch > 5000) void refreshMe();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);
  return state;
}
