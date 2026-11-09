import type { Niche } from '@radar/core/ranking';
import type { Defaults, SourceRef } from './feed';

export const PREFS_KEY = 'signal-radar:prefs';
export const PREFS_VERSION = 1;

export type Theme = 'system' | 'light' | 'dark';

/** What is persisted. `null`/empty means "follow the API defaults". */
export interface StoredPrefs {
  version: typeof PREFS_VERSION;
  niches: Niche[] | null;
  /** Ids of default sources the user switched off (new default sources stay on). */
  disabledSources: string[];
  theme: Theme;
}

export interface Prefs {
  niches: Niche[];
  sources: SourceRef[];
  theme: Theme;
}

export type PrefsStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const emptyPrefs = (): StoredPrefs => ({
  version: PREFS_VERSION,
  niches: null,
  disabledSources: [],
  theme: 'system',
});

const isKeyword = (k: unknown): boolean =>
  (typeof k === 'string' && k.length > 0) ||
  (!!k &&
    typeof k === 'object' &&
    typeof (k as { term?: unknown }).term === 'string' &&
    (k as { term: string }).term.length > 0 &&
    typeof (k as { weight?: unknown }).weight === 'number' &&
    (k as { weight: number }).weight > 0);

const isNiche = (n: unknown): n is Niche => {
  if (!n || typeof n !== 'object') return false;
  const { id, name, weight, keywords } = n as Record<string, unknown>;
  return (
    typeof id === 'string' &&
    typeof name === 'string' &&
    typeof weight === 'number' &&
    weight > 0 &&
    Array.isArray(keywords) &&
    keywords.length > 0 &&
    keywords.every(isKeyword)
  );
};

/** Reads saved prefs; corrupt data or a different schema version falls back to the defaults. */
export function loadPrefs(storage: PrefsStorage): StoredPrefs {
  let raw: unknown;
  try {
    const text = storage.getItem(PREFS_KEY);
    raw = text ? JSON.parse(text) : null;
  } catch {
    return emptyPrefs();
  }
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (p.version !== PREFS_VERSION) return emptyPrefs();
  return {
    version: PREFS_VERSION,
    niches:
      Array.isArray(p.niches) && p.niches.length > 0 && p.niches.every(isNiche) ? p.niches : null,
    disabledSources: Array.isArray(p.disabledSources)
      ? p.disabledSources.filter((s): s is string => typeof s === 'string')
      : [],
    theme: p.theme === 'light' || p.theme === 'dark' ? p.theme : 'system',
  };
}

/** Returns false when the browser refuses the write (private mode, quota). */
export function savePrefs(storage: PrefsStorage, prefs: StoredPrefs): boolean {
  try {
    storage.setItem(PREFS_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}

/** Back to the API's niches and sources; the theme choice is kept. */
export function resetPrefs(storage: PrefsStorage): StoredPrefs {
  const next = { ...emptyPrefs(), theme: loadPrefs(storage).theme };
  savePrefs(storage, next);
  return next;
}

/** Applies saved choices on top of the API defaults. */
export function resolvePrefs(stored: StoredPrefs, defaults: Defaults): Prefs {
  const off = new Set(stored.disabledSources);
  return {
    niches: stored.niches ?? defaults.niches,
    sources: defaults.sources.filter((s) => !off.has(s.id)),
    theme: stored.theme,
  };
}
