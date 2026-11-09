import { useSyncExternalStore } from 'react';

/** A tiny external store: module-level state shared by every component that reads it. */
export function createStore<T>(initial: T) {
  let state = initial;
  const subs = new Set<() => void>();
  const get = () => state;
  const set = (next: T | ((prev: T) => T)) => {
    state = typeof next === 'function' ? (next as (prev: T) => T)(state) : next;
    subs.forEach((fn) => fn());
  };
  const subscribe = (fn: () => void) => {
    subs.add(fn);
    return () => {
      subs.delete(fn);
    };
  };
  const use = () => useSyncExternalStore(subscribe, get);
  return { get, set, use };
}
