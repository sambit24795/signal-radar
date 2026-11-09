import { createHmac } from 'node:crypto';
import { createApp } from '../src/app.js';
import { parseEnv } from '../src/env.js';
import { openTestDb, resetTestDb, testDbAvailable } from '@radar/db/testing';
import type { Db } from '@radar/db';

export const WEB_ORIGIN = 'http://localhost:3000';
export const WEBHOOK_SECRET = 'whsec_test_secret';

export const dbAvailable = await testDbAvailable();

export async function setup(overrides: Record<string, string | undefined> = {}) {
  const db: Db = await openTestDb();
  const env = parseEnv({
    BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-1234',
    BETTER_AUTH_URL: 'http://localhost:8787',
    WEB_ORIGIN,
    LEMONSQUEEZY_WEBHOOK_SECRET: WEBHOOK_SECRET,
    NODE_ENV: 'test',
    ...overrides,
  });
  const app = createApp({ db, env });
  return { db, app, reset: () => resetTestDb(db), close: () => db.$client.end({ timeout: 1 }) };
}

export type TestApp = Awaited<ReturnType<typeof setup>>['app'];

export interface TestUser {
  id: string;
  email: string;
  cookie: string;
}

export async function signUp(app: TestApp, email: string): Promise<TestUser> {
  const res = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
    body: JSON.stringify({ name: email.split('@')[0], email, password: 'correct-horse-battery' }),
  });
  if (res.status !== 200) throw new Error(`sign-up failed: ${res.status} ${await res.text()}`);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const body = (await res.json()) as { user: { id: string } };
  return { id: body.user.id, email, cookie };
}

export function call(
  app: TestApp,
  path: string,
  opts: { method?: string; user?: TestUser; json?: unknown } = {},
) {
  const headers: Record<string, string> = { origin: WEB_ORIGIN };
  if (opts.user) headers.cookie = opts.user.cookie;
  if (opts.json !== undefined) headers['content-type'] = 'application/json';
  return app.request(path, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.json === undefined ? undefined : JSON.stringify(opts.json),
  });
}

export function sign(body: string, secret = WEBHOOK_SECRET) {
  return createHmac('sha256', secret).update(body).digest('hex');
}

// Response bodies in tests are asserted structurally; typing them adds nothing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;
