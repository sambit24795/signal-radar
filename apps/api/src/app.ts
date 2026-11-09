import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import type { FetchFn, Resolver } from '@radar/core';
import type { Db } from '@radar/db';
import { createAuth, type Auth } from './auth.js';
import type { ApiEnv } from './env.js';
import { feedRoutes } from './routes/feed.js';
import { meRoutes } from './routes/me.js';
import { queueRoutes } from './routes/queue.js';
import { searchRoutes } from './routes/search.js';
import { summarizeRoutes } from './routes/summarize.js';
import { telegramRoutes } from './routes/telegram.js';
import { pushRoutes } from './routes/push.js';
import { webhookRoutes } from './routes/webhooks.js';
import { billingRoutes } from './routes/billing.js';
import { devRoutes } from './routes/dev.js';

export interface AppDeps {
  db: Db;
  env: ApiEnv;
  /** Outbound HTTP for user-supplied feed URLs; defaults to real fetch and DNS (tests inject). */
  net?: { fetch?: FetchFn; resolve?: Resolver };
}

export type AuthUser = Auth['$Infer']['Session']['user'];

export interface AppVars {
  Variables: { user: AuthUser };
  Bindings: Record<string, never>;
}

export interface RouteDeps extends AppDeps {
  auth: Auth;
}

export function createApp({ db, env, net }: AppDeps) {
  const auth = createAuth(db, env);
  const deps: RouteDeps = { db, env, auth, ...(net ? { net } : {}) };
  const app = new Hono<AppVars>();

  app.use('/api/*', cors({ origin: env.WEB_ORIGIN, credentials: true }));

  app.get('/healthz', (c) => c.json({ ok: true }));
  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

  app.route('/api/feed', feedRoutes(deps));
  app.route('/api/me', meRoutes(deps));
  app.route('/api/queue', queueRoutes(deps));
  app.route('/api/search', searchRoutes(deps));
  app.route('/api/summarize', summarizeRoutes(deps));
  app.route('/api/billing', billingRoutes(deps));
  app.route('/api/push', pushRoutes(deps));
  app.route('/api/telegram', telegramRoutes(deps));
  app.route('/api/webhooks', webhookRoutes(deps));
  if (env.NODE_ENV !== 'production') app.route('/api/dev', devRoutes(deps));

  app.notFound((c) => c.json({ error: 'not found' }, 404));
  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: 'internal error' }, 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
