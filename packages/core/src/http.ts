export const USER_AGENT =
  'signal-radar/0.1 (personal news radar; +https://github.com/sambit24795/signal-radar)';

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    /** Seconds until the rate limit resets, from retry-after / x-ratelimit-reset. */
    public readonly retryAfterSec?: number,
  ) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpError';
  }
}

/** Real fetch with a descriptive User-Agent and a hard timeout. */
export function createFetch(timeoutMs: number): FetchFn {
  return (url, init) =>
    fetch(url, {
      ...init,
      headers: { 'user-agent': USER_AGENT, ...(init?.headers as Record<string, string>) },
      signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
    });
}

export async function getText(
  fetchFn: FetchFn,
  url: string,
  headers?: Record<string, string>,
): Promise<string> {
  const res = await fetchFn(url, headers ? { headers } : undefined);
  if (!res.ok) {
    const hint = Number(res.headers.get('retry-after') ?? res.headers.get('x-ratelimit-reset'));
    throw new HttpError(res.status, url, Number.isFinite(hint) && hint > 0 ? hint : undefined);
  }
  return res.text();
}

export async function getJson(
  fetchFn: FetchFn,
  url: string,
  headers?: Record<string, string>,
): Promise<unknown> {
  const text = await getText(fetchFn, url, { accept: 'application/json', ...headers });
  return JSON.parse(text) as unknown;
}
