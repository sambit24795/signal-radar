import { describe, expect, it } from 'vitest';
import type { Item } from '@radar/core/ranking';
import { filterItems, parseSearch, searchHref } from '../src/lib/search';

const item = (title: string, tags: string[] = [], source = 'Hacker News'): Item => ({
  id: title,
  url: `https://example.com/${encodeURIComponent(title)}`,
  title,
  snippet: '',
  source,
  sourceKind: 'hn',
  tags,
  momentum: { perHour: 0 },
  media: { type: 'article' },
});

describe('filterItems', () => {
  const items = [
    item('Café culture in Lisbon'),
    item('Rust 2.0 released', ['programming']),
    item('Gardening basics', [], 'r/gardening'),
  ];
  it('matches case- and diacritic-insensitively, on title, tags and source', () => {
    expect(filterItems(items, 'CAFE').map((i) => i.title)).toEqual(['Café culture in Lisbon']);
    expect(filterItems(items, 'programming').map((i) => i.title)).toEqual(['Rust 2.0 released']);
    expect(filterItems(items, 'r/gardening')).toHaveLength(1);
  });
  it('needs every word, in any order, and keeps everything for a blank query', () => {
    expect(filterItems(items, 'lisbon cafe')).toHaveLength(1);
    expect(filterItems(items, 'lisbon rust')).toHaveLength(0);
    expect(filterItems(items, '  ')).toHaveLength(3);
  });
});

describe('search URL', () => {
  it('reads and writes q and the everywhere flag', () => {
    expect(parseSearch('?q=rust%20async&all=1')).toEqual({ q: 'rust async', all: true });
    expect(parseSearch('?all=1')).toEqual({ q: '', all: false });
    expect(parseSearch('?q=a&all=1').all).toBe(false);
    expect(searchHref('/read', { q: ' rust ', all: true })).toBe('/read?q=rust&all=1');
    expect(searchHref('/read', { q: 'rust', all: false })).toBe('/read?q=rust');
    expect(searchHref('/read', { q: '  ', all: true })).toBe('/read');
  });
});
