import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertPublicUrl,
  assertPublicUrlSyntax,
  createPinnedFetch,
  customFeedId,
  fetchPublicText,
  isBlockedIp,
  UnsafeUrlError,
} from '../src/index.js';
import { res, routedFetch } from './helpers.js';

const pub = async () => ['93.184.216.34'];

describe('isBlockedIp', () => {
  it.each([
    '0.0.0.0',
    '10.1.2.3',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:169.254.169.254',
    '64:ff9b::a00:1',
    '2002:7f00:1::',
    '2001:db8::1',
    'not-an-ip',
  ])('blocks %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '93.184.216.34',
    '172.32.0.1',
    '1.1.1.1',
    '2606:4700:4700::1111',
    '2a00:1450:4001::200e',
    '::ffff:8.8.8.8',
  ])('allows %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(false);
  });
});

describe('assertPublicUrl', () => {
  it.each([
    'ftp://example.com/feed',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'gopher://example.com',
    'https://user:pw@example.com/feed',
    'http://127.0.0.1/feed',
    'http://[::1]/feed',
    'http://[::ffff:127.0.0.1]/feed',
    'http://169.254.169.254/latest/meta-data',
    'http://2130706433/',
    'http://0x7f.1/',
    'http://localhost/feed',
    'http://app.localhost/feed',
    'http://printer.local/feed',
    'http://metadata.google.internal/',
    'http://intranet/feed',
    'not a url',
  ])('rejects %s without DNS', (url) => {
    expect(() => assertPublicUrlSyntax(url)).toThrow(UnsafeUrlError);
  });

  it('rejects a name that resolves to a private address, even if only one record is', async () => {
    await expect(assertPublicUrl('https://a.example/', async () => ['10.0.0.1'])).rejects.toThrow(
      /private/,
    );
    await expect(
      assertPublicUrl('https://a.example/', async () => ['93.184.216.34', '127.0.0.1']),
    ).rejects.toThrow(/private/);
    await expect(assertPublicUrl('https://a.example/', async () => ['::1'])).rejects.toThrow(
      UnsafeUrlError,
    );
  });

  it('rejects names that do not resolve', async () => {
    await expect(
      assertPublicUrl('https://a.example/', async () => {
        throw new Error('ENOTFOUND');
      }),
    ).rejects.toThrow(/resolve/);
    await expect(assertPublicUrl('https://a.example/', async () => [])).rejects.toThrow(/resolve/);
  });

  it('accepts a public host', async () => {
    expect((await assertPublicUrl('https://a.example/feed', pub)).hostname).toBe('a.example');
  });
});

describe('fetchPublicText', () => {
  it('returns the body', async () => {
    const fetch = routedFetch({ 'a.example': () => res('<rss/>') });
    expect(await fetchPublicText('https://a.example/feed', { fetch, resolve: pub })).toEqual({
      text: '<rss/>',
      url: 'https://a.example/feed',
    });
  });

  it('refuses a redirect to a private IP and never requests it', async () => {
    const fetch = routedFetch({
      'a.example': () => res('', 302, { location: 'http://169.254.169.254/latest/meta-data' }),
      '169.254.169.254': () => res('secret'),
    });
    await expect(
      fetchPublicText('https://a.example/feed', { fetch, resolve: pub }),
    ).rejects.toThrow(UnsafeUrlError);
    expect(fetch.calls).toEqual(['https://a.example/feed']);
  });

  it('refuses a redirect to a name that resolves privately', async () => {
    const fetch = routedFetch({
      'a.example': () => res('', 301, { location: 'https://b.example/x' }),
      'b.example': () => res('secret'),
    });
    const resolve = async (h: string) => (h === 'b.example' ? ['192.168.0.9'] : ['93.184.216.34']);
    await expect(fetchPublicText('https://a.example/', { fetch, resolve })).rejects.toThrow(
      /private/,
    );
    expect(fetch.calls).toEqual(['https://a.example/']);
  });

  it('refuses a redirect to a non-http scheme', async () => {
    const fetch = routedFetch({
      'a.example': () => res('', 302, { location: 'file:///etc/passwd' }),
    });
    await expect(fetchPublicText('https://a.example/', { fetch, resolve: pub })).rejects.toThrow(
      /http/,
    );
  });

  it('follows up to 3 redirects, relative included, then gives up', async () => {
    let n = 0;
    const ok = routedFetch({
      'a.example': () => (n++ < 3 ? res('', 302, { location: `/r${n}` }) : res('done')),
    });
    expect((await fetchPublicText('https://a.example/', { fetch: ok, resolve: pub })).text).toBe(
      'done',
    );

    const loop = routedFetch({ 'a.example': () => res('', 302, { location: '/again' }) });
    await expect(
      fetchPublicText('https://a.example/', { fetch: loop, resolve: pub }),
    ).rejects.toThrow(/redirects/);
    expect(loop.calls).toHaveLength(4);
  });

  it('fails on HTTP errors and oversized bodies', async () => {
    const bad = routedFetch({ 'a.example': () => res('', 404) });
    await expect(
      fetchPublicText('https://a.example/', { fetch: bad, resolve: pub }),
    ).rejects.toThrow(/404/);
    const big = routedFetch({ 'a.example': () => res('x'.repeat(300)) });
    await expect(
      fetchPublicText('https://a.example/', { fetch: big, resolve: pub, maxBytes: 100 }),
    ).rejects.toThrow(/larger/);
    const declared = routedFetch({
      'a.example': () => res('x', 200, { 'content-length': '999999999' }),
    });
    await expect(
      fetchPublicText('https://a.example/', { fetch: declared, resolve: pub }),
    ).rejects.toThrow(/larger/);
  });

  it('times out slow responses', async () => {
    const slow = (async (_u: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      })) as Parameters<typeof fetchPublicText>[1] extends infer O
      ? NonNullable<O extends { fetch?: infer F } ? F : never>
      : never;
    await expect(
      fetchPublicText('https://a.example/', { fetch: slow, resolve: pub, timeoutMs: 20 }),
    ).rejects.toThrow(/aborted/);
  });
});

describe('customFeedId', () => {
  it('is stable and prefixed', () => {
    expect(customFeedId('https://a.example/rss')).toMatch(/^custom:[0-9a-f]{10}$/);
    expect(customFeedId('https://a.example/rss')).toBe(customFeedId('https://a.example/rss'));
    expect(customFeedId('https://a.example/rss')).not.toBe(customFeedId('https://b.example/rss'));
  });
});

describe('pinned fetch (DNS rebinding)', () => {
  let server: Server;
  let port = 0;
  let hits = 0;
  beforeAll(async () => {
    server = createServer((req, res) => {
      hits++;
      if (req.url === '/gz') {
        res.writeHead(200, { 'content-type': 'application/rss+xml', 'content-encoding': 'gzip' });
        res.end(gzipSync('<rss>zipped</rss>'));
      } else res.end('<rss>plain</rss>');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('refuses a host that rebinds to a private address after the pre-check', async () => {
    let calls = 0;
    const rebinding = async () => (calls++ === 0 ? ['93.184.216.34'] : ['127.0.0.1']);
    const before = hits;
    await expect(
      fetchPublicText(`http://rebind.example:${port}/`, { resolve: rebinding }),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(calls).toBe(2); // pre-check, then the connect-time lookup
    expect(hits).toBe(before); // never connected
  });

  it('connects to the address it checked and decodes gzip', async () => {
    const f = createPinnedFetch(
      async () => ['127.0.0.1'],
      () => false,
    );
    const plain = await f(`http://feed.example:${port}/`);
    expect(await plain.text()).toBe('<rss>plain</rss>');
    const gz = await f(`http://feed.example:${port}/gz`);
    expect(gz.headers.get('content-encoding')).toBeNull();
    expect(await gz.text()).toBe('<rss>zipped</rss>');
  });
});
