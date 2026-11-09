import { useCallback, useEffect, useState } from 'react';
import { fetchDefaults, fetchFeed, type Defaults, type Feed } from './lib/feed';

export type Data =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; defaults: Defaults; feed: Feed; failedRefresh: boolean };

/** Loads defaults and feed; a failed refresh keeps showing the data already on screen. */
export function useRadarData() {
  const [data, setData] = useState<Data>({ status: 'loading' });

  const load = useCallback(() => {
    Promise.all([fetchDefaults(), fetchFeed()])
      .then(([defaults, feed]) =>
        setData({ status: 'ready', defaults, feed, failedRefresh: false }),
      )
      .catch((e: unknown) =>
        setData((prev) =>
          prev.status === 'ready'
            ? { ...prev, failedRefresh: true }
            : { status: 'error', message: e instanceof Error ? e.message : String(e) },
        ),
      );
  }, []);

  useEffect(() => {
    load();
    window.addEventListener('online', load);
    return () => window.removeEventListener('online', load);
  }, [load]);

  const retry = useCallback(() => {
    setData({ status: 'loading' });
    load();
  }, [load]);

  return { data, retry };
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

interface InstallEvent extends Event {
  prompt(): Promise<unknown>;
}

/** Exposes an install action only after the browser fires `beforeinstallprompt`. */
export function useInstallPrompt(): (() => void) | null {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => setEvent(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  if (!event) return null;
  return () => {
    void event.prompt();
    setEvent(null);
  };
}

/** Re-renders once a minute so ages and "updated" labels stay honest. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
