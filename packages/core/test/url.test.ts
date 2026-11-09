import { describe, expect, it } from 'vitest';
import { canonicalUrl, cleanUrl, urlId } from '../src/url.js';

describe('canonicalUrl', () => {
  it('strips utm/tracking params, www, trailing slash, fragment and scheme differences', () => {
    const a = canonicalUrl('http://www.Example.com/post/?utm_source=x&utm_medium=y&id=3#top');
    expect(a).toBe('https://example.com/post?id=3');
    expect(canonicalUrl('https://example.com/post?id=3&fbclid=abc')).toBe(a);
  });

  it('sorts query params so order does not matter', () => {
    expect(canonicalUrl('https://a.com/x?b=2&a=1')).toBe(canonicalUrl('https://a.com/x?a=1&b=2'));
  });

  it('keeps meaningful params and the root path', () => {
    expect(canonicalUrl('https://www.youtube.com/watch?v=abc&utm_campaign=z')).toBe(
      'https://youtube.com/watch?v=abc',
    );
    expect(canonicalUrl('https://example.com/')).toBe('https://example.com');
  });

  it('folds youtu.be links into youtube.com/watch', () => {
    expect(canonicalUrl('https://youtu.be/abc?si=zzz')).toBe('https://youtube.com/watch?v=abc');
  });

  it('cleanUrl keeps the host and path as published', () => {
    expect(cleanUrl('https://www.example.com/a/?utm_source=x&k=1#frag')).toBe(
      'https://www.example.com/a/?k=1',
    );
  });

  it('urlId is stable for equivalent URLs', () => {
    expect(urlId(canonicalUrl('https://www.a.com/p/?utm_source=q'))).toBe(
      urlId(canonicalUrl('http://a.com/p')),
    );
  });

  it('throws on garbage input', () => {
    expect(() => canonicalUrl('not a url')).toThrow();
  });
});
