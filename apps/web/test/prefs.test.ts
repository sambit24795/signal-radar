import { describe, expect, it } from 'vitest';
import type { Defaults } from '../src/lib/feed';
import {
  PREFS_KEY,
  emptyPrefs,
  loadPrefs,
  resetPrefs,
  resolvePrefs,
  savePrefs,
  type PrefsStorage,
} from '../src/lib/prefs';

const memory = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  const storage: PrefsStorage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
  return { storage, data };
};

const defaults: Defaults = {
  niches: [{ id: 'ai', name: 'AI', weight: 1, keywords: ['claude'] }],
  sources: [
    { id: 'hn', name: 'Hacker News', type: 'hn' },
    { id: 'reddit', name: 'Reddit', type: 'reddit' },
    { id: 'rss:verge', name: 'The Verge', type: 'rss' },
  ],
};

const custom = {
  id: 'go',
  name: 'Go',
  weight: 2,
  keywords: ['golang', { term: 'gopher', weight: 2 }],
};

describe('prefs storage', () => {
  it('falls back to empty prefs when nothing is saved', () => {
    expect(loadPrefs(memory().storage)).toEqual(emptyPrefs());
  });

  it('round-trips saved prefs', () => {
    const { storage } = memory();
    const prefs = {
      ...emptyPrefs(),
      niches: [custom],
      disabledSources: ['reddit'],
      theme: 'dark' as const,
    };
    expect(savePrefs(storage, prefs)).toBe(true);
    expect(loadPrefs(storage)).toEqual(prefs);
  });

  it('ignores corrupt JSON, other versions and malformed fields', () => {
    expect(loadPrefs(memory({ [PREFS_KEY]: '{nope' }).storage)).toEqual(emptyPrefs());
    const old = JSON.stringify({ version: 0, niches: [custom], theme: 'dark' });
    expect(loadPrefs(memory({ [PREFS_KEY]: old }).storage)).toEqual(emptyPrefs());
    const bad = JSON.stringify({
      version: 1,
      niches: [{ id: 'x', name: 'X', weight: 1, keywords: [] }],
      disabledSources: ['hn', 5],
      theme: 'neon',
    });
    expect(loadPrefs(memory({ [PREFS_KEY]: bad }).storage)).toEqual({
      ...emptyPrefs(),
      disabledSources: ['hn'],
    });
  });

  it('reports a failed write instead of throwing', () => {
    const storage: PrefsStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {},
    };
    expect(savePrefs(storage, emptyPrefs())).toBe(false);
  });

  it('reset clears niches and sources but keeps the theme', () => {
    const { storage } = memory();
    savePrefs(storage, {
      ...emptyPrefs(),
      niches: [custom],
      disabledSources: ['hn'],
      theme: 'light',
    });
    expect(resetPrefs(storage)).toEqual({ ...emptyPrefs(), theme: 'light' });
    expect(loadPrefs(storage)).toEqual({ ...emptyPrefs(), theme: 'light' });
  });
});

describe('resolvePrefs', () => {
  it('uses the API defaults when nothing is customized', () => {
    expect(resolvePrefs(emptyPrefs(), defaults)).toEqual({
      niches: defaults.niches,
      sources: defaults.sources,
      theme: 'system',
    });
  });

  it('applies custom niches and disabled sources over the defaults', () => {
    const out = resolvePrefs(
      { ...emptyPrefs(), niches: [custom], disabledSources: ['reddit', 'gone'], theme: 'dark' },
      defaults,
    );
    expect(out.niches).toEqual([custom]);
    expect(out.sources.map((s) => s.id)).toEqual(['hn', 'rss:verge']);
    expect(out.theme).toBe('dark');
  });
});
