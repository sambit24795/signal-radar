import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as ranking from '../src/ranking.js';

const entry = fileURLToPath(new URL('../src/ranking.ts', import.meta.url));

/** Runtime import specifiers of a module; `import type` / `export type` lines are erased and skipped. */
function runtimeImports(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  const out: string[] = [];
  const re = /^\s*(?:import|export)\s+(type\s+)?(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;
  for (const m of src.matchAll(re)) if (!m[1]) out.push(m[2]!);
  return out;
}

describe('core/ranking entry', () => {
  it('exposes prefilter and rank', () => {
    expect(typeof ranking.prefilter).toBe('function');
    expect(typeof ranking.rank).toBe('function');
    expect(typeof ranking.rankScore).toBe('function');
  });

  it('pulls in no Node built-ins or packages, only relative modules', () => {
    const seen = new Set<string>();
    const queue = [entry];
    while (queue.length) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      for (const spec of runtimeImports(file)) {
        expect(spec, `${file} imports ${spec}`).toMatch(/^\.\.?\//);
        const target = resolve(dirname(file), spec.replace(/\.js$/, '.ts'));
        expect(existsSync(target), target).toBe(true);
        queue.push(target);
      }
    }
    expect([...seen].map((f) => f.split('/').pop()).sort()).toEqual([
      'creatorProfile.ts',
      'prefilter.ts',
      'rank.ts',
      'ranking.ts',
      'topicSources.ts',
    ]);
  });
});
