import { useMemo, useSyncExternalStore } from 'react';

export type RouteName = 'read' | 'queue' | 'settings' | 'pricing' | 'signin';

export interface Route {
  name: RouteName;
  /** `/signin?mode=signup` opens the sign-in screen on its "create account" side. */
  signup: boolean;
}

const PATHS: Record<RouteName, string> = {
  read: '/',
  queue: '/queue',
  settings: '/settings',
  pricing: '/pricing',
  signin: '/signin',
};

const BY_PATH = new Map<string, RouteName>(
  (Object.entries(PATHS) as [RouteName, string][]).map(([name, path]) => [path, name]),
);

/** Unknown paths fall back to the Read view; a trailing slash is ignored. */
export function parseRoute(pathname: string, search = ''): Route {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const name = BY_PATH.get(clean || '/') ?? 'read';
  const signup = name === 'signin' && new URLSearchParams(search).get('mode') === 'signup';
  return { name, signup };
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
