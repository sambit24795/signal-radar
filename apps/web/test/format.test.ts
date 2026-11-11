import { describe, expect, it } from 'vitest';
import { compact, domainOf, formatAge, formatUpdated } from '../src/lib/format';

const now = Date.parse('2026-11-09T12:00:00Z');
const ago = (s: number) => new Date(now - s * 1000).toISOString();

describe('format', () => {
  it('compacts counts', () => {
    expect([950, 1240, 10_000, 15_300].map(compact)).toEqual(['950', '1.2k', '10k', '15k']);
    expect(compact(2000)).toBe('2k');
  });

  it('formats short ages', () => {
    expect(formatAge(ago(20), now)).toBe('now');
    expect(formatAge(ago(12 * 60), now)).toBe('12m');
    expect(formatAge(ago(3 * 3600), now)).toBe('3h');
    expect(formatAge(ago(2 * 86_400), now)).toBe('2d');
    expect(formatAge(ago(15 * 86_400), now)).toBe('2w');
    expect(formatAge(ago(6 * 86_400), now)).toBe('6d');
    expect(formatAge(ago(7 * 86_400), now)).toBe('1w');
    expect(formatAge(ago(34 * 86_400), now)).toBe('4w');
    expect(formatAge(undefined, now)).toBe('');
    expect(formatAge('nope', now)).toBe('');
  });

  it('switches to months after five weeks and years after a year', () => {
    const day = 86_400;
    expect(formatAge(ago(35 * day), now)).toBe('1mo');
    expect(formatAge(ago(100 * day), now)).toBe('3mo');
    expect(formatAge(ago(364 * day), now)).toBe('11mo');
    expect(formatAge(ago(365 * day), now)).toBe('1y');
    expect(formatAge(ago(480 * 7 * day), now)).toBe('9y');
  });

  it('formats the updated label', () => {
    expect(formatUpdated(ago(5), now)).toBe('just now');
    expect(formatUpdated(ago(12 * 60), now)).toBe('12 min ago');
    expect(formatUpdated(ago(3 * 3600), now)).toBe('3 h ago');
    expect(formatUpdated(ago(90 * 86_400), now)).toBe('2 mo ago');
    expect(formatUpdated(ago(800 * 86_400), now)).toBe('2 y ago');
    expect(formatUpdated(null, now)).toBe('');
  });

  it('extracts the domain', () => {
    expect(domainOf('https://www.example.com/a?b=1')).toBe('example.com');
    expect(domainOf('not a url')).toBe('');
  });
});
