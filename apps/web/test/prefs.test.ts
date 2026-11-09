import { describe, expect, it } from 'vitest';
import type { Defaults } from '../src/lib/feed';
import {
  PREFS_KEY,
  emptyPrefs,
  loadPrefs,
  startOver,
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
  niches: [],
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
      version: 2,
      niches: [{ id: 'x', name: 'X', weight: 1, keywords: [] }],
      disabledSources: ['hn', 5],
      sourceKinds: ['reddit', 'nope', 3],
      theme: 'neon',
    });
    expect(loadPrefs(memory({ [PREFS_KEY]: bad }).storage)).toEqual({
      ...emptyPrefs(),
      disabledSources: ['hn'],
      sourceKinds: ['reddit'],
    });
  });

  it('carries version 1 prefs over with every source on', () => {
    const v1 = JSON.stringify({
      version: 1,
      niches: [custom],
      disabledSources: ['reddit'],
      showAll: false,
      theme: 'dark',
    });
    expect(loadPrefs(memory({ [PREFS_KEY]: v1 }).storage)).toEqual({
      ...emptyPrefs(),
      niches: [custom],
      disabledSources: ['reddit'],
      theme: 'dark',
    });
  });

  it('keeps the ticked sources through resolve', () => {
    const stored = { ...emptyPrefs(), sourceKinds: ['hn' as const] };
    expect(resolvePrefs(stored, defaults).sourceKinds).toEqual(['hn']);
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

  it('start over clears topics and the show-everything choice, keeps sources and theme', () => {
    const { storage } = memory();
    savePrefs(storage, {
      ...emptyPrefs(),
      niches: [custom],
      showAll: true,
      disabledSources: ['hn'],
      theme: 'light',
    });
    const next = { ...emptyPrefs(), disabledSources: ['hn'], theme: 'light' };
    expect(startOver(storage)).toEqual(next);
    expect(loadPrefs(storage)).toEqual(next);
  });

  it('round-trips the show-everything choice', () => {
    const { storage } = memory();
    savePrefs(storage, { ...emptyPrefs(), showAll: true });
    expect(loadPrefs(storage).showAll).toBe(true);
  });
});

describe('resolvePrefs', () => {
  it('has no topics of its own to offer: nothing chosen means ask', () => {
    expect(resolvePrefs(emptyPrefs(), defaults)).toEqual({
      niches: [],
      sources: defaults.sources,
      theme: 'system',
      sourceKinds: [],
      needsTopics: true,
    });
  });

  it('does not ask again after "skip, show everything"', () => {
    const out = resolvePrefs({ ...emptyPrefs(), showAll: true }, defaults);
    expect(out.niches).toEqual([]);
    expect(out.needsTopics).toBe(false);
  });

  it('never needs to ask once the user has topics', () => {
    expect(resolvePrefs({ ...emptyPrefs(), niches: [custom] }, defaults).needsTopics).toBe(false);
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
