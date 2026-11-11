import { useMemo, useSyncExternalStore } from 'react';

export type RouteName =
  | 'landing'
  | 'welcome'
  | 'read'
  | 'queue'
  | 'settings'
  | 'pricing'
  | 'signin'
  | 'terms'
  | 'privacy'
  | 'refunds'
  | 'contact';

export interface Route {
  name: RouteName;
  /** `/signin?mode=signup` opens the sign-in screen on its "create account" side. */
  signup: boolean;
  /** `/about` shows the landing page without sending returning visitors on to Read. */
  about: boolean;
}

const PATHS: Record<RouteName, string> = {
  landing: '/',
  welcome: '/welcome',
  read: '/read',
  queue: '/queue',
  settings: '/settings',
  pricing: '/pricing',
  signin: '/signin',
  terms: '/terms',
  privacy: '/privacy',
  refunds: '/refunds',
  contact: '/contact',
};

const BY_PATH = new Map<string, RouteName>(
  (Object.entries(PATHS) as [RouteName, string][]).map(([name, path]) => [path, name]),
);

/** Unknown paths fall back to the Read view; `/` is the landing page; a trailing slash is ignored. */
export function parseRoute(pathname: string, search = ''): Route {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (clean === '/about') return { name: 'landing', signup: false, about: true };
  const name = BY_PATH.get(clean || '/') ?? 'read';
  const signup = name === 'signin' && new URLSearchParams(search).get('mode') === 'signup';
  return { name, signup, about: false };
}

export function hrefFor(name: RouteName, opts: { signup?: boolean } = {}): string {
  return name === 'signin' && opts.signup ? `${PATHS.signin}?mode=signup` : PATHS[name];
}

const EVENT = 'signal-radar:route';

export function navigate(href: string, replace = false): void {
  if (href === location.pathname + location.search) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', href);
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(fn: () => void): () => void {
  window.addEventListener('popstate', fn);
  window.addEventListener(EVENT, fn);
  return () => {
    window.removeEventListener('popstate', fn);
    window.removeEventListener(EVENT, fn);
  };
}

const snapshot = () => location.pathname + location.search;

export function useRoute(): Route {
  const where = useSyncExternalStore(subscribe, snapshot);
  return useMemo(() => {
    const [path = '/', query = ''] = where.split('?');
    return parseRoute(path, query ? `?${query}` : '');
  }, [where]);
}

/** The current `?query` string (with the leading `?`, or empty); re-renders when the URL changes. */
export function useSearchString(): string {
  return useSyncExternalStore(subscribe, () => location.search);
}
