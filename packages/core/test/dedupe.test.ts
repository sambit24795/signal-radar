import { describe, expect, it } from 'vitest';
import { dedupe, jaccard, titleTokens } from '../src/dedupe.js';
import { normalizeItem } from '../src/normalize.js';
import { NOW } from './helpers.js';

const mk = (url: string, title: string, points = 0, source = 'S') =>
  normalizeItem({ url, title, points, publishedAt: NOW }, { name: source, kind: 'rss' }, NOW)!;

describe('dedupe', () => {
  it('merges items whose canonical URLs match, keeping the one with more points', () => {
    const out = dedupe([
      mk('https://www.a.com/x/?utm_source=hn', 'Some post', 10, 'HN'),
      mk('https://a.com/x', 'Some post', 50, 'Reddit'),
    ]);
    expect(out.items).toHaveLength(1);
    expect(out.items[0]?.source).toBe('Reddit');
    expect(out.dropped).toBe(1);
  });

  it('merges near-identical titles at Jaccard >= 0.85', () => {
    const a = 'OpenAI releases new GPT model with better coding agent support today';
    const b = 'OpenAI releases new GPT model with better coding agent support today!';
    expect(jaccard(titleTokens(a), titleTokens(b))).toBeGreaterThanOrEqual(0.85);
    const out = dedupe([mk('https://a.com/1', a, 5), mk('https://b.com/2', b, 9)]);
    expect(out.items).toHaveLength(1);
    expect(out.items[0]?.url).toBe('https://b.com/2');
  });

  it('keeps distinct stories', () => {
    const out = dedupe([
      mk('https://a.com/1', 'Steam Deck OLED gets a new firmware update'),
      mk('https://b.com/2', 'Neovim 0.12 released with native LSP completion'),
    ]);
    expect(out.items).toHaveLength(2);
  });

  it('does not fuzzy-merge very short titles', () => {
    const out = dedupe([mk('https://a.com/1', 'Launch day'), mk('https://b.com/2', 'Launch day!')]);
    expect(out.items).toHaveLength(2);
  });

  it('respects a custom threshold', () => {
    const a = mk('https://a.com/1', 'one two three four five');
    const b = mk('https://b.com/2', 'one two three four six');
    expect(dedupe([a, b], 0.85).items).toHaveLength(2);
    expect(dedupe([a, b], 0.6).items).toHaveLength(1);
  });
});
