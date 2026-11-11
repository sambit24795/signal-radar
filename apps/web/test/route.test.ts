import { describe, expect, it } from 'vitest';
import { hrefFor, parseRoute } from '../src/lib/route';

describe('parseRoute', () => {
  it('maps each path to its route', () => {
    expect(parseRoute('/').name).toBe('landing');
    expect(parseRoute('/read').name).toBe('read');
    expect(parseRoute('/welcome').name).toBe('welcome');
    expect(parseRoute('/queue').name).toBe('queue');
    expect(parseRoute('/settings').name).toBe('settings');
    expect(parseRoute('/pricing').name).toBe('pricing');
    expect(parseRoute('/signin').name).toBe('signin');
  });

  it('ignores a trailing slash and falls back to Read for unknown paths', () => {
    expect(parseRoute('/queue/').name).toBe('queue');
    expect(parseRoute('/nope').name).toBe('read');
    expect(parseRoute('').name).toBe('landing');
  });

  it('serves the landing page at /about without the returning-visitor redirect', () => {
    expect(parseRoute('/about')).toEqual({ name: 'landing', signup: false, about: true });
    expect(parseRoute('/').about).toBe(false);
  });

  it('reads the signup mode only on the sign-in screen', () => {
    expect(parseRoute('/signin', '?mode=signup').signup).toBe(true);
    expect(parseRoute('/signin', '').signup).toBe(false);
    expect(parseRoute('/pricing', '?mode=signup').signup).toBe(false);
  });
});

describe('hrefFor', () => {
  it('round-trips through parseRoute', () => {
    for (const name of [
      'landing',
      'welcome',
      'read',
      'queue',
      'settings',
      'pricing',
      'signin',
    ] as const) {
      expect(parseRoute(hrefFor(name)).name).toBe(name);
    }
    const [path, query] = hrefFor('signin', { signup: true }).split('?');
    expect(parseRoute(path!, `?${query}`).signup).toBe(true);
  });
});
