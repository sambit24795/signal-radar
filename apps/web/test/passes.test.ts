import { describe, expect, it } from 'vitest';
import {
  daysLeft,
  durationLabel,
  endingSoonNote,
  formatMoney,
  perMonth,
  proUntilNote,
} from '../src/lib/passes';

const NOW = Date.parse('2026-11-09T12:00:00Z');

describe('pass prices', () => {
  it('shows whole units, and cents when they are not zero', () => {
    expect(formatMoney(9900, 'INR')).toBe('₹99');
    expect(formatMoney(200, 'USD')).toBe('$2');
    expect(formatMoney(167, 'USD')).toBe('$1.67');
    expect(formatMoney(1500, 'USD')).toBe('$15');
  });

  it('works out the price per 30 days', () => {
    expect(perMonth(9900, 30, 'INR')).toBe('₹99 a month');
    expect(perMonth(24900, 90, 'INR')).toBe('₹83 a month');
    expect(perMonth(79900, 365, 'INR')).toBe('₹67 a month');
    expect(perMonth(1500, 365, 'USD')).toBe('$1.25 a month');
  });

  it('names the pass length', () => {
    expect(durationLabel(30)).toBe('30 days');
    expect(durationLabel(90)).toBe('90 days');
    expect(durationLabel(365)).toBe('1 year');
  });
});

describe('a pass about to end', () => {
  it('counts whole days and tolerates junk', () => {
    expect(daysLeft('2026-11-12T12:00:00Z', NOW)).toBe(3);
    expect(daysLeft('2026-11-12T13:00:00Z', NOW)).toBe(4);
    expect(daysLeft('2026-11-01T12:00:00Z', NOW)).toBe(0);
    expect(daysLeft(null, NOW)).toBeNull();
    expect(daysLeft('nope', NOW)).toBeNull();
  });

  it('says the date it runs to', () => {
    expect(proUntilNote('2026-11-16T12:00:00Z')).toBe('Pro until 16 Nov 2026');
    expect(proUntilNote(null)).toBe('');
    expect(proUntilNote('nope')).toBe('');
  });

  it('warns only in the last three days', () => {
    expect(endingSoonNote('2026-11-12T12:00:00Z', NOW)).toBe('Pro ends in 3 days.');
    expect(endingSoonNote('2026-11-10T12:00:00Z', NOW)).toBe('Pro ends in 1 day.');
    expect(endingSoonNote('2026-11-09T12:00:00Z', NOW)).toBe('Pro ends today.');
    expect(endingSoonNote('2026-11-13T12:00:00Z', NOW)).toBe('');
    expect(endingSoonNote(null, NOW)).toBe('');
  });
});
