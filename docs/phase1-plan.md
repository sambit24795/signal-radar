# Phase 1 plan: DB + API

Context: `~/personal/revamps/signal-radar-handoff.md` ("Direction" section). Branch `revamp`, local commits only, never push.
Commits: conventional style (`feat(db): ...`), **no `Co-authored-by` or any AI attribution**.

## Environment

- Node 24: run `export PATH=$HOME/.local/opt/node24/bin:$PATH` before any node/pnpm command.
  Set `engines.node` to `>=24` and add `.nvmrc` with `24`.
- Postgres runs only in Docker locally. No cloud accounts. Everything must also run on a VPS later (no vendor-specific auth/DB/KV).
- Keep output small: pipe test/build output through `tail`/`grep`.

## Step 1: docker-compose

- `docker-compose.yml`: `postgres:18` (named volume, healthcheck), port `5432` (use `5433` if 5432 is taken; check with `ss -ltn`).
  An init script creates a second database `radar_test` for tests. RSSHub as an optional service under `profiles: [rsshub]`.
- `.env.example` gains `DATABASE_URL`, `TEST_DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `WEB_ORIGIN`,
  `API_PORT`, `LEMONSQUEEZY_WEBHOOK_SECRET`. Add the same keys with dev values to the local `.env` (don't touch existing keys).
- Root scripts: `db:up`, `db:down`, `db:generate`, `db:migrate`, `api:dev`.

## Step 2: `packages/db` (`@radar/db`)

- Drizzle ORM + `postgres` (postgres-js) driver, `drizzle-kit` for SQL migrations in `packages/db/drizzle/` (committed).
- Exports: `createDb(url)`, `schema`, `runMigrations(db | url)`, inferred row types.
- Tables:
  - Better Auth core tables `user`, `session`, `account`, `verification` exactly as the Better Auth Drizzle adapter expects
    (check current docs with context7; generating them with the Better Auth CLI is fine).
  - `subscription`: user_id (unique FK), plan (`free`|`pro`), status (`trialing`|`active`|`past_due`|`canceled`|`none`),
    trial_ends_at, current_period_end, provider (`lemonsqueezy`|`stub`), provider_customer_id, provider_subscription_id, updated_at.
  - `user_config`: user_id PK/FK, niches jsonb (same shape as `RadarConfig.niches`), sources jsonb (enabled source ids),
    top_n int default 10, telegram_chat_id nullable, notion jsonb nullable ({token, dbId}), updated_at.
  - `feed_item` (shared public feed, written once per run): url PK, title, source, source_type, published_at, fetched_at,
    momentum fields the core `Item` already has (points/comments/etc. as jsonb `meta`), keyword_score, niche_ids text[].
  - `queue_item`: id, user_id FK, url, title, source, niche, score, hook, angle, title_draft, format, reasons jsonb,
    status (`new`|`picked`|`skipped`), created_at, decided_at; unique(user_id, url); index (user_id, status, created_at).
  - `seen`: (user_id, url) PK, seen_at.
  - `push_subscription`: id, user_id FK, endpoint unique, keys jsonb, created_at.
- All FKs `on delete cascade`.

## Step 3: `apps/api` (`@radar/api`)

- Hono + `@hono/node-server`. `createApp({ db, env })` factory (tests call `app.request()`), `src/server.ts` starts it.
- Better Auth with the Drizzle adapter on our Postgres, email + password enabled, mounted at `/api/auth/*`.
  On sign-up create a `user_config` (empty niches) and a `subscription` row (`plan=pro`, `status=trialing`, trial 7 days, provider `stub`).
- Routes (zod-validated, JSON errors `{error}`):
  - `GET /healthz`
  - `GET /api/feed?limit=&niche=` public, newest/highest `feed_item` rows.
  - `GET /api/me` → user + plan/status/trial end. `GET /api/me/config`, `PUT /api/me/config`.
  - `GET /api/queue?status=new|picked|skipped&cursor=`, `POST /api/queue/:id/pick`, `POST /api/queue/:id/skip`,
    `POST /api/queue/:id/reset`. Only the owner's rows. Pro gate: `trialing` (not expired) or `active`, else 402.
  - `POST /api/push/subscribe`, `DELETE /api/push/subscribe` (by endpoint).
  - `POST /api/webhooks/lemonsqueezy`: verify `X-Signature` HMAC-SHA256 when the secret is set; handle
    `subscription_created|updated|cancelled|expired` → upsert `subscription` (match user by `meta.custom_data.user_id`).
  - `POST /api/dev/upgrade` only when `NODE_ENV !== 'production'`: stub payment, sets the caller to `pro/active`.
- CORS for `WEB_ORIGIN` with credentials.

## Step 4: `radar run` → Postgres

- Refactor `runRadar` (core stays DB-agnostic: pass a storage interface; the DB implementation lives in `@radar/db` or the CLI):
  1. Fetch all sources once (shared, union of every Pro user's enabled sources plus the default config sources).
  2. Rank with the `none` provider (keywords + momentum against the default `radar.config.ts` niches) and upsert `feed_item`.
  3. For each Pro user (trialing-not-expired or active) with ≥1 niche: prefilter by their niches, drop their `seen` urls,
     score their top N with the configured provider, few-shots = their last 10 picked + 10 skipped `queue_item`s,
     insert `queue_item` (on conflict do nothing), mark seen with the same rules as today (failed items not marked).
     Per-user Telegram digest if `telegram_chat_id` is set; Notion sink if `notion` is set (existing upsert code as adapter).
     One user's failure must not stop the others.
- `--dry` still prints the table and writes nothing.
- CLI admin commands: `radar db:migrate`, `radar user:list`, `radar user:pro --email <e>` (dev convenience).
- `data/seen.json` and the Notion-only path are no longer the default; leave `.github/workflows/radar.yml` alone (phase 5 redoes it)
  but add a comment at its top that it is outdated.

## Step 5: tests and checks

- vitest: DB tests use `TEST_DATABASE_URL`, run migrations once, truncate tables between tests; skip with a clear message
  if the DB is unreachable. Cover: sign-up creates config + trial, auth required, queue owner isolation, pick/skip,
  Pro gate 402 after trial expiry, webhook signature + upsert, feed endpoint, per-user run (mocked fetch + scoring) writes
  queue rows and seen, one user's failure isolated.
- Existing 73 tests keep passing. `pnpm lint`, `pnpm typecheck`, `pnpm test` clean.
- Manual smoke: `pnpm db:up && pnpm db:migrate && pnpm api:dev`, sign up with curl, `radar user:pro`, `radar run` with the `none`
  provider, `curl /api/queue` shows rows.
