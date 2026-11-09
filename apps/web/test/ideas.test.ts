import { describe, expect, it } from 'vitest';
import { normalizeLink } from '../src/lib/ideas';
import { initialQueue, queueReducer, type QueueItem } from '../src/lib/queue';

const q = (id: string): QueueItem => ({
  id,
  url: `https://example.com/${id}`,
  title: id,
  source: 'Added by you',
  niche: null,
  score: 0,
  hook: null,
  angle: null,
  titleDraft: null,
  format: null,
  reasons: [],
  status: 'picked',
  createdAt: '2026-11-10T00:00:00Z',
  decidedAt: null,
});

describe('normalizeLink', () => {
  it('accepts web links and adds https when the scheme is missing', () => {
    expect(normalizeLink(' https://example.com/a?b=1 ')).toBe('https://example.com/a?b=1');
    expect(normalizeLink('example.com/post')).toBe('https://example.com/post');
  });

  it('refuses text that is not a link', () => {
    expect(normalizeLink('')).toBeNull();
    expect(normalizeLink('two words')).toBeNull();
    expect(normalizeLink('ftp://example.com/file')).toBeNull();
    expect(normalizeLink('javascript:alert(1)')).toBeNull();
    expect(normalizeLink('nodots')).toBeNull();
  });
});

describe('queue prepend', () => {
  it('puts an added link first and moves a repeat up instead of doubling it', () => {
    const state = { ...initialQueue, items: [q('a'), q('b')], selected: 'a' };
    const added = queueReducer(state, { type: 'prepend', item: q('c') });
    expect(added.items.map((i) => i.id)).toEqual(['c', 'a', 'b']);
    const again = queueReducer(added, { type: 'prepend', item: q('b') });
    expect(again.items.map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });
});
