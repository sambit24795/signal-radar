export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

interface Init {
  method?: string;
  json?: unknown;
}

/** Same-origin JSON call (cookies ride along). Non-2xx and network failures throw `ApiError`. */
export async function api<T>(path: string, init: Init = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers: init.json === undefined ? undefined : { 'content-type': 'application/json' },
      body: init.json === undefined ? undefined : JSON.stringify(init.json),
    });
  } catch {
    throw new ApiError(0, 'Could not reach the server.');
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const o = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const msg =
      typeof o.error === 'string' ? o.error : typeof o.message === 'string' ? o.message : '';
    throw new ApiError(
      res.status,
      msg || `Request failed (${res.status}).`,
      typeof o.code === 'string' ? o.code : undefined,
    );
  }
  return body as T;
}
