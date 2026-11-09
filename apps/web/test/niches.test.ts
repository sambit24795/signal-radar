import { describe, expect, it } from 'vitest';
import { keywordText, newNicheId, parseKeywords } from '../src/lib/niches';

describe('niches', () => {
  it('round-trips keywords and keeps weights', () => {
    const prev = ['rust', { term: 'mcp', weight: 3 }];
    const next = parseKeywords('rust, MCP , zig,, zig', prev);
    expect(next).toEqual(['rust', { term: 'MCP', weight: 3 }, 'zig']);
    expect(keywordText({ id: 'x', name: 'x', weight: 1, keywords: next })).toBe('rust, MCP, zig');
  });

  it('makes unique ids', () => {
    const n = { id: 'custom-2', name: 'a', weight: 1, keywords: ['a'] };
    expect(newNicheId([n])).toBe('custom-3');
  });
});
