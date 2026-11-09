import { describe, expect, it } from 'vitest';
import { MAX_NICHES, PRESETS, presetToNiche } from '../src/lib/presets';
import { defaultFeedPicks, suggestedFeeds, togglePreset } from '../src/lib/onboarding';

describe('PRESETS', () => {
  it('has about sixteen presets with unique ids and names', () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(16);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    expect(new Set(PRESETS.map((p) => p.name)).size).toBe(PRESETS.length);
  });

  it('covers the topics the plan asks for, including non-tech ones', () => {
    const ids = PRESETS.map((p) => p.id);
    for (const id of ['ai', 'space', 'finance', 'science', 'design', 'creator', 'handheld']) {
      expect(ids).toContain(id);
    }
  });

  it('keeps built-in niche ids so existing choices pre-select', () => {
    const ids = PRESETS.map((p) => p.id);
    for (const id of ['ai', 'handheld', 'gamedev', 'devtools']) expect(ids).toContain(id);
  });

  it('gives every preset usable keywords', () => {
    for (const p of PRESETS) {
      expect(p.id, p.id).toMatch(/^[a-z]+$/);
      expect(p.name.trim().length, p.id).toBeGreaterThan(0);
      expect(p.keywords.length, p.id).toBeGreaterThanOrEqual(5);
      for (const k of p.keywords) expect(k, `${p.id}: ${k}`).toBe(k.trim().toLowerCase());
      expect(new Set(p.keywords).size, p.id).toBe(p.keywords.length);
    }
  });

  it('suggests at most three https feeds per preset, no duplicates', () => {
    const all = new Set<string>();
    for (const p of PRESETS) {
      expect(p.feeds.length, p.id).toBeLessThanOrEqual(3);
      for (const f of p.feeds) {
        expect(f.title.trim().length).toBeGreaterThan(0);
        const u = new URL(f.url);
        expect(u.protocol, f.url).toBe('https:');
        expect(all.has(f.url), `duplicate ${f.url}`).toBe(false);
        all.add(f.url);
      }
    }
  });

  it('suggests feeds for the topics the built-in sources do not cover', () => {
    for (const id of ['space', 'finance', 'science', 'design', 'security']) {
      expect(PRESETS.find((p) => p.id === id)?.feeds.length, id).toBeGreaterThan(0);
    }
  });

  it('turns a preset into a valid niche', () => {
    const n = presetToNiche(PRESETS[0]!);
    expect(n).toMatchObject({ id: 'ai', weight: 1 });
    expect(n.keywords.length).toBeGreaterThan(0);
  });
});

describe('togglePreset', () => {
  it('adds, then removes', () => {
    const on = togglePreset([], 'space');
    expect(on.map((n) => n.id)).toEqual(['space']);
    expect(togglePreset(on, 'space')).toEqual([]);
  });

  it('ignores unknown ids and stops at the cap', () => {
    expect(togglePreset([], 'nope')).toEqual([]);
    const full = Array.from({ length: MAX_NICHES }, (_, i) => ({
      id: `custom-${i}`,
      name: `c${i}`,
      weight: 1,
      keywords: ['x'],
    }));
    expect(togglePreset(full, 'space')).toBe(full);
  });
});

describe('suggestedFeeds', () => {
  it('collects feeds from chosen presets, once each', () => {
    const niches = [presetToNiche(PRESETS.find((p) => p.id === 'space')!)];
    const feeds = suggestedFeeds(niches);
    expect(feeds.map((f) => f.title)).toContain('NASA');
    expect(suggestedFeeds([...niches, ...niches]).length).toBe(feeds.length);
    expect(suggestedFeeds([{ id: 'mine', name: 'Mine', weight: 1, keywords: ['x'] }])).toEqual([]);
  });

  it('defaultFeedPicks pre-checks up to the cap and skips feeds already added', () => {
    const feeds = Array.from({ length: 6 }, (_, i) => ({
      title: `f${i}`,
      url: `https://a.test/${i}`,
    }));
    expect(defaultFeedPicks(feeds).size).toBe(6);
    expect(defaultFeedPicks(feeds, [], 4).size).toBe(4);
    const have = [{ id: 'custom:x', url: 'https://a.test/0', title: 'f0' }];
    const picks = defaultFeedPicks(feeds, have, 4);
    expect(picks.has('https://a.test/0')).toBe(false);
    expect(picks.size).toBe(3);
  });
});
