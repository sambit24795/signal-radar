import type { Niche } from '@radar/core/ranking';
import type { Defaults, SourceRef } from './feed';
import { isSourceKind, type SourceKind } from './view';

export const PREFS_KEY = 'signal-radar:prefs';
export const PREFS_VERSION = 2;

export type Theme = 'system' | 'light' | 'dark';

/** What is persisted. `null`/empty means "follow the API defaults". */
export interface StoredPrefs {
  version: typeof PREFS_VERSION;
  niches: Niche[] | null;
  /** Ids of default sources the user switched off (new default sources stay on). */
  disabledSources: string[];
  /** Source kinds ticked in the Read menu; empty means every source. */
  sourceKinds: SourceKind[];
  /** Chose "skip, show everything": no topics, ranked by momentum only. */
  showAll: boolean;
  theme: Theme;
}

export interface Prefs {
  niches: Niche[];
  sources: SourceRef[];
  theme: Theme;
  /** Source kinds the Read view is narrowed to; empty means all of them. */
  sourceKinds: SourceKind[];
  /** No topics chosen and not skipped: the Read view asks first. */
  needsTopics: boolean;
}

export type PrefsStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const emptyPrefs = (): StoredPrefs => ({
  version: PREFS_VERSION,
  niches: null,
  disabledSources: [],
  sourceKinds: [],
  showAll: false,
  theme: 'light',
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

/**
 * Reads saved prefs; corrupt data or an unknown schema version falls back to the defaults.
 * Version 1 (no source selection) is carried over as it is.
 */
export function loadPrefs(storage: PrefsStorage): StoredPrefs {
  let raw: unknown;
  try {
    const text = storage.getItem(PREFS_KEY);
    raw = text ? JSON.parse(text) : null;
  } catch {
    return emptyPrefs();
  }
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (p.version !== PREFS_VERSION && p.version !== 1) return emptyPrefs();
  return {
    version: PREFS_VERSION,
    niches:
      Array.isArray(p.niches) && p.niches.length > 0 && p.niches.every(isNiche) ? p.niches : null,
    disabledSources: Array.isArray(p.disabledSources)
      ? p.disabledSources.filter((s): s is string => typeof s === 'string')
      : [],
    sourceKinds: Array.isArray(p.sourceKinds) ? p.sourceKinds.filter(isSourceKind) : [],
    showAll: p.showAll === true,
    theme: p.theme === 'light' || p.theme === 'dark' ? p.theme : 'light',
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

/** Clears the user's topics so the picker shows again. Sources and theme are kept; no one else's topics come back. */
export function startOver(storage: PrefsStorage): StoredPrefs {
  const next = { ...loadPrefs(storage), niches: null, showAll: false };
  savePrefs(storage, next);
  return next;
}

/** Applies saved choices on top of the API's sources. Topics are only ever the user's own. */
export function resolvePrefs(stored: StoredPrefs, defaults: Defaults): Prefs {
  const off = new Set(stored.disabledSources);
  const niches = stored.niches ?? defaults.niches;
  return {
    niches,
    sources: defaults.sources.filter((s) => !off.has(s.id)),
    theme: stored.theme,
    sourceKinds: stored.sourceKinds,
    needsTopics: niches.length === 0 && !stored.showAll,
  };
}
