import { describe, expect, it } from 'vitest';
import {
  copyText,
  effortLabel,
  hintSeen,
  initialQueue,
  markHintSeen,
  queueMeta,
  queueReducer,
  type QueueItem,
  type QueueState,
} from '../src/lib/queue';

const item = (id: string): QueueItem => ({
  id,
  url: `https://example.com/${id}`,
  title: id,
  source: 'Hacker News',
  niche: null,
  score: 1,
  hook: null,
  angle: null,
  titleDraft: null,
  format: null,
  reasons: [],
  status: 'new',
  createdAt: '2026-01-01T00:00:00Z',
  decidedAt: null,
});

const load = (ids: string[], next: string | null = null): QueueState =>
  queueReducer(initialQueue, {
    type: 'loaded',
    page: { items: ids.map(item), nextCursor: next },
    append: false,
  });

const ids = (s: QueueState) => s.items.map((i) => i.id);

describe('queueReducer', () => {
  it('selects the first row after a load and keeps the selection when appending', () => {
    const s = load(['a', 'b'], 'c1');
    expect(s.selected).toBe('a');
    const moved = queueReducer(s, { type: 'move', delta: 1 });
    const more = queueReducer(moved, {
      type: 'loaded',
      page: { items: [item('b'), item('c')], nextCursor: null },
      append: true,
    });
    expect(ids(more)).toEqual(['a', 'b', 'c']);
    expect(more.selected).toBe('b');
    expect(more.nextCursor).toBeNull();
  });

  it('removes a decided row and moves the selection to its neighbour', () => {
    const s = load(['a', 'b', 'c']);
    const afterFirst = queueReducer(s, { type: 'remove', id: 'a' });
    expect(ids(afterFirst)).toEqual(['b', 'c']);
    expect(afterFirst.selected).toBe('b');

    const last = queueReducer(queueReducer(afterFirst, { type: 'move', delta: 1 }), {
      type: 'remove',
      id: 'c',
    });
    expect(last.selected).toBe('b');
    expect(
      queueReducer(queueReducer(last, { type: 'remove', id: 'b' }), { type: 'remove', id: 'zz' })
        .selected,
    ).toBeNull();
  });

  it('restores a removed row at its old position (rollback and undo)', () => {
    const s = load(['a', 'b', 'c']);
    const removed = queueReducer(s, { type: 'remove', id: 'b' });
    const back = queueReducer(removed, { type: 'restore', item: item('b'), index: 1 });
    expect(ids(back)).toEqual(['a', 'b', 'c']);
    expect(back.selected).toBe('b');
    expect(queueReducer(back, { type: 'restore', item: item('b'), index: 0 })).toBe(back);
    expect(ids(queueReducer(removed, { type: 'restore', item: item('x'), index: 99 }))).toEqual([
      'a',
      'c',
      'x',
    ]);
  });

  it('clamps j/k at the ends and ignores an empty list', () => {
    const s = load(['a', 'b']);
    expect(queueReducer(s, { type: 'move', delta: -1 }).selected).toBe('a');
    const end = queueReducer(queueReducer(s, { type: 'move', delta: 1 }), {
      type: 'move',
      delta: 1,
    });
    expect(end.selected).toBe('b');
    expect(queueReducer(initialQueue, { type: 'move', delta: 1 })).toBe(initialQueue);
  });

  it('only selects ids that are in the list', () => {
    const s = load(['a']);
    expect(queueReducer(s, { type: 'select', id: 'nope' })).toBe(s);
  });
});

describe('queue item text', () => {
  const now = Date.parse('2026-01-01T03:00:00Z');

  it('builds the meta line from what is there and skips the rest', () => {
    const full = { ...item('a'), niche: 'AI tools', effort: 'S' as const };
    expect(queueMeta(full, now)).toEqual(['Hacker News', 'AI tools', '3 h ago', 'small effort']);
    expect(queueMeta(item('b'), now)).toEqual(['Hacker News', '3 h ago']);
  });

  it('turns effort letters into words', () => {
    expect(effortLabel('L')).toBe('large effort');
    expect(effortLabel(null)).toBe('');
    expect(effortLabel(undefined)).toBe('');
  });

  it('copies the hook, else the title draft, else the title', () => {
    expect(copyText({ ...item('a'), hook: 'A hook', titleDraft: 'Draft' })).toEqual({
      label: 'Copy hook',
      text: 'A hook',
    });
    expect(copyText({ ...item('a'), titleDraft: 'Draft' }).text).toBe('Draft');
    expect(copyText(item('a'))).toEqual({ label: 'Copy title', text: 'a' });
  });

  it('remembers that the first-item hint was seen', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
    expect(hintSeen(storage)).toBe(false);
    markHintSeen(storage);
    expect(hintSeen(storage)).toBe(true);
  });
});
