import { describe, expect, it } from 'vitest';
import type { Subscription } from '../src/lib/me';
import { formatDate, planSummary } from '../src/lib/plan';

const sub = (over: Partial<Subscription>): Subscription => ({
  plan: 'pro',
  status: 'active',
  trialEndsAt: null,
  currentPeriodEnd: null,
  isPro: true,
  ...over,
});
const NOW = Date.parse('2026-11-09T12:00:00Z');

describe('planSummary', () => {
  it('describes a running trial with days left', () => {
    const p = planSummary(sub({ status: 'trialing', trialEndsAt: '2026-11-16T12:00:00Z' }), NOW);
    expect(p).toMatchObject({ kind: 'trial', canUpgrade: true, canCancel: false });
    expect(p.detail).toBe('Ends 16 Nov 2026, in 7 days.');
  });

  it('describes an active pass as time running to a date', () => {
    const p = planSummary(sub({ currentPeriodEnd: '2026-12-09T00:00:00Z' }), NOW);
    expect(p).toMatchObject({ kind: 'active', canCancel: false, canUpgrade: false });
    expect(p.detail).toBe('Pro until 9 Dec 2026.');
  });

  it('keeps access visible after cancel until the period ends', () => {
    const p = planSummary(
      sub({ status: 'canceled', currentPeriodEnd: '2026-12-09T00:00:00Z' }),
      NOW,
    );
    expect(p).toMatchObject({ kind: 'canceled', canCancel: false });
    expect(p.detail).toContain('9 Dec 2026');
  });

  it('falls back to Free for expired trials and no subscription', () => {
    expect(planSummary(sub({ status: 'trialing', isPro: false, plan: 'pro' }), NOW).kind).toBe(
      'free',
    );
    expect(planSummary(sub({ status: 'none', plan: 'free', isPro: false }), NOW).kind).toBe('free');
  });

  it('formats dates in UTC and tolerates junk', () => {
    expect(formatDate('2026-01-01T23:30:00Z')).toBe('1 Jan 2026');
    expect(formatDate('nope')).toBe('');
    expect(formatDate(null)).toBe('');
  });
});
