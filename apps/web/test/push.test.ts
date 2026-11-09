import { afterEach, describe, expect, it, vi } from 'vitest';
import { needsInstall, pushSupported, resolveStatus, status } from '../src/lib/push';

afterEach(() => vi.unstubAllGlobals());

const facts = (over = {}) => ({
  supported: true,
  hasKey: true,
  permission: 'default' as NotificationPermission,
  subscribed: false,
  ...over,
});

describe('resolveStatus', () => {
  it('ranks unsupported, then unavailable, then denied', () => {
    expect(resolveStatus(facts({ supported: false, hasKey: false }))).toBe('unsupported');
    expect(resolveStatus(facts({ hasKey: false, permission: 'denied' }))).toBe('unavailable');
    expect(resolveStatus(facts({ permission: 'denied', subscribed: true }))).toBe('denied');
  });

  it('is on only with a subscription and granted permission', () => {
    expect(resolveStatus(facts())).toBe('off');
    expect(resolveStatus(facts({ subscribed: true }))).toBe('off');
    expect(resolveStatus(facts({ permission: 'granted' }))).toBe('off');
    expect(resolveStatus(facts({ permission: 'granted', subscribed: true }))).toBe('on');
  });
});

function stubBrowser(opts: { key?: boolean; permission?: string; sub?: boolean; ua?: string }) {
  const reg = {
    pushManager: { getSubscription: async () => (opts.sub ? { endpoint: 'e' } : null) },
  };
  vi.stubGlobal('window', { PushManager: class {}, Notification: {} });
  vi.stubGlobal('navigator', {
    userAgent: opts.ua ?? 'Mozilla/5.0 (X11; Linux)',
    serviceWorker: { getRegistration: async () => reg },
  });
  vi.stubGlobal('Notification', { permission: opts.permission ?? 'default' });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      opts.key === false
        ? new Response('{"error":"off"}', { status: 404 })
        : new Response('{"publicKey":"abc"}', { status: 200 }),
    ),
  );
}

describe('status()', () => {
  it('is unsupported without a PushManager', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', { serviceWorker: {} });
    expect(pushSupported()).toBe(false);
    expect(await status()).toBe('unsupported');
  });

  it('is unavailable when the server has no key', async () => {
    stubBrowser({ key: false });
    expect(await status()).toBe('unavailable');
  });

  it('reads denied, off and on from the browser', async () => {
    stubBrowser({ permission: 'denied' });
    expect(await status()).toBe('denied');
    stubBrowser({});
    expect(await status()).toBe('off');
    stubBrowser({ permission: 'granted', sub: true });
    expect(await status()).toBe('on');
  });
});

describe('needsInstall', () => {
  it('is true only for iOS outside the installed app', () => {
    const ios = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)';
    vi.stubGlobal('navigator', { userAgent: ios, standalone: false });
    expect(needsInstall()).toBe(true);
    vi.stubGlobal('navigator', { userAgent: ios, standalone: true });
    expect(needsInstall()).toBe(false);
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux)' });
    expect(needsInstall()).toBe(false);
  });
});
