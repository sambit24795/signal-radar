import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { emptySeen, filterUnseen, loadSeen, markSeen, pruneSeen, saveSeen } from '../src/seen.js';
import { NOW } from './helpers.js';

const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

describe('seen store', () => {
  it('prunes entries older than the TTL and keeps recent ones', () => {
    const store = {
      version: 1 as const,
      entries: { old: daysAgo(31), edge: daysAgo(29.9), fresh: daysAgo(1), bad: 'nonsense' },
    };
    const pruned = pruneSeen(store, NOW, 30);
    expect(Object.keys(pruned.entries).sort()).toEqual(['edge', 'fresh']);
  });

  it('marks and filters', () => {
    const marked = markSeen(emptySeen(), ['a', 'b'], NOW);
    expect(filterUnseen([{ id: 'a' }, { id: 'c' }], marked)).toEqual([{ id: 'c' }]);
    // marking again does not reset the first-seen time
    const later = markSeen(marked, ['a'], new Date(NOW.getTime() + 1e9));
    expect(later.entries['a']).toBe(NOW.toISOString());
  });

  it('round-trips through disk and tolerates a missing or corrupt file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'seen-'));
    try {
      const path = join(dir, 'sub', 'seen.json');
      expect(await loadSeen(path)).toEqual(emptySeen());
      await saveSeen(path, markSeen(emptySeen(), ['b', 'a'], NOW));
      const text = await readFile(path, 'utf8');
      expect(text.indexOf('"a"')).toBeLessThan(text.indexOf('"b"'));
      expect(Object.keys((await loadSeen(path)).entries)).toEqual(['a', 'b']);

      const warnings: string[] = [];
      await writeFile(path, '{not json');
      expect(await loadSeen(path, (m) => warnings.push(m))).toEqual(emptySeen());
      expect(warnings).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
