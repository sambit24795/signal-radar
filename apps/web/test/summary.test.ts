import { describe, expect, it } from 'vitest';
import { IDLE, needsRequest, summaryReduce } from '../src/lib/summary';

describe('summaryReduce', () => {
  it('walks pending, ok, hide and show without losing the summary', () => {
    let s = summaryReduce(IDLE, { type: 'start' });
    expect(s).toMatchObject({ open: true, status: 'pending' });
    s = summaryReduce(s, { type: 'ok', tldr: 'T', points: ['a'] });
    expect(s).toMatchObject({ open: true, status: 'ok', tldr: 'T' });
    s = summaryReduce(s, { type: 'toggle' });
    expect(s).toMatchObject({ open: false, tldr: 'T' });
    expect(needsRequest(s)).toBe(false);
    expect(summaryReduce(s, { type: 'toggle' }).open).toBe(true);
  });
  it('asks again after a failure or a reset, not after unreadable', () => {
    expect(needsRequest(summaryReduce(IDLE, { type: 'fail', message: 'x' }))).toBe(true);
    expect(needsRequest(summaryReduce(IDLE, { type: 'reset' }))).toBe(true);
    expect(needsRequest(summaryReduce(IDLE, { type: 'unreadable' }))).toBe(false);
  });
});
