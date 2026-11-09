import { describe, expect, it } from 'vitest';
import type { Niche } from '@radar/core/ranking';
import type { ServerConfig } from '../src/lib/config';
import type { Defaults } from '../src/lib/feed';
import { emptyPrefs, type StoredPrefs } from '../src/lib/prefs';
import { importPayload, mergeServerConfig, shouldOfferImport } from '../src/lib/prefsMerge';

const niche = (id: string): Niche => ({ id, name: id, weight: 1, keywords: [id] });
const defaults: Defaults = {
  niches: [niche('d')],
  sources: [
    { id: 'hn', name: 'HN', type: 'hn' },
    { id: 'rd', name: 'Reddit', type: 'reddit' },
    { id: 'gh', name: 'GitHub', type: 'github' },
  ],
};
const config = (over: Partial<ServerConfig> = {}): ServerConfig => ({
  niches: [],
  sources: [],
  topN: 10,
  telegramChatId: null,
  notion: null,
  customFeeds: [],
  onboardedAt: null,
  ...over,
});
const local = (over: Partial<StoredPrefs> = {}): StoredPrefs => ({ ...emptyPrefs(), ...over });

describe('mergeServerConfig', () => {
  it('returns local prefs when signed out or the account has nothing saved', () => {
    const stored = local({ niches: [niche('mine')], disabledSources: ['rd'] });
    expect(mergeServerConfig(stored, null, defaults)).toBe(stored);
    expect(mergeServerConfig(stored, config(), defaults)).toEqual(stored);
  });

  it('lets the account niches and sources win', () => {
    const merged = mergeServerConfig(
      local({ niches: [niche('mine')] }),
      config({ niches: [niche('acct')], sources: ['hn', 'gh'] }),
      defaults,
    );
    expect(merged.niches?.map((n) => n.id)).toEqual(['acct']);
    expect(merged.disabledSources).toEqual(['rd']);
  });
});

describe('import offer', () => {
  it('is offered once, only when the account is empty and this device has choices', () => {
    const mine = local({ niches: [niche('mine')] });
    expect(shouldOfferImport(mine, config(), false)).toBe(true);
    expect(shouldOfferImport(mine, config(), true)).toBe(false);
    expect(shouldOfferImport(mine, config({ niches: [niche('a')] }), false)).toBe(false);
    expect(shouldOfferImport(local(), config(), false)).toBe(false);
    expect(shouldOfferImport(mine, null, false)).toBe(false);
    expect(shouldOfferImport(local({ disabledSources: ['hn'] }), config(), false)).toBe(true);
  });

  it('builds the payload from local niches and the enabled source ids', () => {
    const p = importPayload(local({ niches: [niche('mine')], disabledSources: ['rd'] }), defaults);
    expect(p.niches.map((n) => n.id)).toEqual(['mine']);
    expect(p.sources).toEqual(['hn', 'gh']);
    expect(importPayload(local(), defaults).niches).toBe(defaults.niches);
  });
});
