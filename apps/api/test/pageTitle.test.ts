import { describe, expect, it } from 'vitest';
import { cleanPageTitle } from '../src/routes/queue.js';

describe('cleanPageTitle', () => {
  it('keeps owner/repo from GitHub titles', () => {
    expect(
      cleanPageTitle('GitHub - microsoft/TypeScript: TypeScript is a superset of JavaScript'),
    ).toBe('microsoft/TypeScript');
    expect(cleanPageTitle('GitHub - a/b.js')).toBe('a/b.js');
  });

  it('drops a short site suffix after a pipe, but not from short titles', () => {
    expect(cleanPageTitle('How we cut our build time in half | Acme Blog')).toBe(
      'How we cut our build time in half',
    );
    expect(cleanPageTitle('Docs | Acme')).toBe('Docs | Acme');
    expect(cleanPageTitle('Plain title - with a dash')).toBe('Plain title - with a dash');
  });
});
