import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createFetch, HttpError, USER_AGENT, type FetchFn } from './http.js';

/** Resolves a hostname to every address it points at. Injectable for tests. */
export type Resolver = (host: string) => Promise<string[]>;

export const resolveHost: Resolver = async (host) =>
  (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

const v4ToInt = (ip: string): number => ip.split('.').reduce((acc, p) => acc * 256 + Number(p), 0);

/** [network, prefix length] pairs that are never reachable public unicast. */
const BLOCKED_V4: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

export function isBlockedV4(ip: string): boolean {
  const n = v4ToInt(ip);
  return BLOCKED_V4.some(([net, bits]) => {
    const size = 2 ** (32 - bits);
    const base = v4ToInt(net);
    return n >= base && n < base + size;
  });
}

/** Expand an IPv6 literal into its 8 16-bit groups, or null when malformed. */
function groupsV6(ip: string): number[] | null {
  let s = ip.toLowerCase().split('%')[0] ?? '';
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (dotted) {
    const v4 = dotted[1] as string;
    if (isIP(v4) !== 4) return null;
    const n = v4ToInt(v4);
    s =
      s.slice(0, -v4.length) + ((n >>> 16) & 0xffff).toString(16) + ':' + (n & 0xffff).toString(16);
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const parts = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  const out = parts.map((p) => parseInt(p, 16));
  return out.length === 8 && out.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff)
    ? out
    : null;
}

const embeddedV4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

export function isBlockedV6(ip: string): boolean {
  const g = groupsV6(ip);
  if (!g) return true; // unparseable: refuse
  const [a, b, c, d, e, f, hi, lo] = g as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (g.every((x) => x === 0)) return true; // ::
  if (g.slice(0, 7).every((x) => x === 0) && lo === 1) return true; // ::1
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d): judge the embedded address
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && (f === 0xffff || f === 0)) {
    return isBlockedV4(embeddedV4(hi, lo));
  }
  // NAT64 (64:ff9b::/96): judge the embedded address
  if (a === 0x64 && b === 0xff9b && c === 0 && d === 0 && e === 0 && f === 0) {
    return isBlockedV4(embeddedV4(hi, lo));
  }
  if (a === 0x2002) return isBlockedV4(embeddedV4(b, c)); // 6to4
  if ((a & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((a & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((a & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local
  if ((a & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (a === 0x2001 && b === 0x0db8) return true; // documentation
  if (a === 0x100 && b === 0 && c === 0 && d === 0) return true; // 100::/64 discard
  return false;
}

export function isBlockedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isBlockedV4(ip);
  if (v === 6) return isBlockedV6(ip);
  return true;
}

const BLOCKED_NAME = /(^|\.)(localhost|local|internal|localdomain|home\.arpa)$/i;

/**
 * Synchronous checks on a URL: http(s) only, no credentials, and no literal private
 * address or obviously internal hostname. Returns the parsed URL.
 */
export function assertPublicUrlSyntax(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UnsafeUrlError('not a valid URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new UnsafeUrlError('only http and https URLs are allowed');
  }
  if (u.username || u.password) throw new UnsafeUrlError('URLs with credentials are not allowed');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host) throw new UnsafeUrlError('URL has no host');
  if (isIP(host)) {
    if (isBlockedIp(host)) throw new UnsafeUrlError('that address is not publicly reachable');
  } else if (BLOCKED_NAME.test(host.replace(/\.$/, '')) || !host.includes('.')) {
    throw new UnsafeUrlError('that host is not publicly reachable');
  }
  return u;
}

/** Syntax checks plus DNS: every address the host resolves to must be public. */
export async function assertPublicUrl(raw: string, resolve: Resolver = resolveHost): Promise<URL> {
  const u = assertPublicUrlSyntax(raw);
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return u;
  let addrs: string[];
  try {
    addrs = await resolve(host);
  } catch {
    throw new UnsafeUrlError(`could not resolve ${host}`);
  }
  if (addrs.length === 0) throw new UnsafeUrlError(`could not resolve ${host}`);
  if (addrs.some(isBlockedIp)) throw new UnsafeUrlError('that host resolves to a private address');
  return u;
}

export interface SafeFetchOptions {
  fetch?: FetchFn;
  resolve?: Resolver;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
}

export const SAFE_TIMEOUT_MS = 8_000;
export const SAFE_MAX_BYTES = 2 * 1024 * 1024;
export const SAFE_MAX_REDIRECTS = 3;

async function readCapped(res: Response, maxBytes: number, url: string): Promise<string> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel();
    throw new Error(`response from ${url} is larger than ${maxBytes} bytes`);
  }
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`response from ${url} is larger than ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * GET a user-supplied URL as text, safely: public hosts only (re-checked on every redirect, max 3),
 * an overall timeout and a body size cap. Throws UnsafeUrlError for blocked targets.
 */
export async function fetchPublicText(
  rawUrl: string,
  opts: SafeFetchOptions = {},
): Promise<{ text: string; url: string }> {
  const timeoutMs = opts.timeoutMs ?? SAFE_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? SAFE_MAX_BYTES;
  const maxRedirects = opts.maxRedirects ?? SAFE_MAX_REDIRECTS;
  const base = opts.fetch ?? createFetch(timeoutMs);
  const signal = AbortSignal.timeout(timeoutMs);
  const headers = {
    'user-agent': USER_AGENT,
    accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml, */*',
    ...opts.headers,
  };

  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicUrl(current, opts.resolve);
    const res = await base(current, { headers, redirect: 'manual', signal });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      await res.body?.cancel();
      if (!loc) throw new HttpError(res.status, current);
      current = new URL(loc, current).href;
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new HttpError(res.status, current);
    }
    return { text: await readCapped(res, maxBytes, current), url: current };
  }
  throw new Error(`too many redirects (more than ${maxRedirects})`);
}

/** Stable id for a user-supplied feed: `custom:` plus a short hash of its URL. */
export function customFeedId(url: string): string {
  return 'custom:' + createHash('sha1').update(url).digest('hex').slice(0, 10);
}
