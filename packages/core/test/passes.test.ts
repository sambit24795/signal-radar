import { describe, expect, it } from 'vitest';
import { PASSES, currencyFor, extendUntil, formatPrice } from '../src/passes.js';

const NOW = new Date('2026-11-09T06:00:00Z');
const pass = (id: string) => PASSES.find((p) => p.id === id)!;

describe('PASSES', () => {
  it('has the three passes with days and prices in minor units', () => {
    expect(PASSES.map((p) => ({ id: p.id, days: p.days, inr: p.inr, usd: p.usd }))).toEqual([
      { id: 'p30', days: 30, inr: 9900, usd: 200 },
      { id: 'p90', days: 90, inr: 24900, usd: 500 },
      { id: 'p365', days: 365, inr: 79900, usd: 1500 },
    ]);
  });
});

describe('currencyFor', () => {
  it('uses INR for India and USD elsewhere', () => {
    expect(currencyFor('IN', 'en-US')).toBe('INR');
    expect(currencyFor('in', null)).toBe('INR');
    expect(currencyFor('US', 'en-IN,en;q=0.9')).toBe('USD');
    expect(currencyFor('DE', 'de-DE')).toBe('USD');
  });

  it('falls back to Accept-Language, then USD', () => {
    expect(currencyFor(null, 'en-IN,en;q=0.9')).toBe('INR');
    expect(currencyFor(undefined, 'hi-IN')).toBe('INR');
    expect(currencyFor(null, 'en-GB')).toBe('USD');
    expect(currencyFor(null, null)).toBe('USD');
    expect(currencyFor('', '')).toBe('USD');
  });
});

describe('formatPrice', () => {
  it('prints rupees and dollars without decimals', () => {
    expect(formatPrice(pass('p30'), 'INR')).toBe('₹99');
    expect(formatPrice(pass('p90'), 'INR')).toBe('₹249');
    expect(formatPrice(pass('p365'), 'INR')).toBe('₹799');
    expect(formatPrice(pass('p30'), 'USD')).toBe('$2');
    expect(formatPrice(pass('p90'), 'USD')).toBe('$5');
    expect(formatPrice(pass('p365'), 'USD')).toBe('$15');
  });
});

describe('extendUntil', () => {
  it('adds days from now when there is no current Pro time', () => {
    expect(extendUntil(null, NOW, 30)).toEqual(new Date('2026-12-09T06:00:00Z'));
  });

  it('adds days from now when the current Pro time has lapsed', () => {
    const past = new Date('2026-10-01T00:00:00Z');
    expect(extendUntil(past, NOW, 90)).toEqual(new Date('2027-02-07T06:00:00Z'));
  });

  it('adds days to the end of the current Pro time when it is still running', () => {
    const end = new Date('2026-12-01T00:00:00Z');
    expect(extendUntil(end, NOW, 365)).toEqual(new Date('2027-12-01T00:00:00Z'));
  });

  it('does not mutate its inputs', () => {
    const end = new Date('2026-12-01T00:00:00Z');
    const copy = new Date(end);
    extendUntil(end, NOW, 30);
    expect(end).toEqual(copy);
  });
});
