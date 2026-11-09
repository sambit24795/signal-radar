import { createHash } from 'node:crypto';

const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'yclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'ref',
  'ref_src',
  'ref_url',
  'cmpid',
  'spm',
  's_cid',
  '_ga',
  '_gl',
  'mkt_tok',
  'oly_enc_id',
  'vero_id',
]);

function isTracking(key: string): boolean {
  const k = key.toLowerCase();
  return k.startsWith('utm_') || TRACKING_PARAMS.has(k);
}

/** Strip tracking params and the fragment, keeping the URL otherwise as published. */
export function cleanUrl(input: string): string {
  const u = new URL(input.trim());
  u.hash = '';
  for (const key of [...u.searchParams.keys()]) {
    if (isTracking(key)) u.searchParams.delete(key);
  }
  return u.toString();
}

/**
 * Stable identity for a URL: https, no `www.`, no tracking params or fragment,
 * sorted query, no trailing slash, youtu.be folded into youtube.com/watch.
 */
export function canonicalUrl(input: string): string {
  const u = new URL(cleanUrl(input));
  u.protocol = 'https:';
  let host = u.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1);
    return `https://youtube.com/watch?v=${id}`;
  }
  if (host === 'm.youtube.com') host = 'youtube.com';
  if (host === 'youtube.com') u.searchParams.delete('si');
  u.hostname = host;
  u.searchParams.sort();
  const path = u.pathname.replace(/\/+$/, '');
  const query = u.searchParams.toString();
  return `https://${u.host}${path}${query ? `?${query}` : ''}`;
}

export function urlId(canonical: string): string {
  return createHash('sha1').update(canonical).digest('hex').slice(0, 16);
}
