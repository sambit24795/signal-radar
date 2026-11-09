# Phase 3 plan: Pro UI

Context: `~/personal/revamps/signal-radar-handoff.md` ("Direction", "UI requirements"), `docs/phase2-plan.md` (style).
Branch `revamp`, local commits only, never push. No `Co-authored-by` or AI attribution in commits.
pnpm `minimumReleaseAge` is enforced: never add excludes, pin an older version instead.

Goal: sign-in, a Make queue with Pick/Skip, settings (niches/sources/Notion/Telegram fields), a pricing page, a payment
stub and plan gating, all inside the existing `apps/web` PWA with the same look (Refero "Cursor" warm parchment, light + dark).

## Existing API (phase 1, do not break)

- Better Auth email/password at `/api/auth/*` (cookies; web uses the Vite `/api` proxy, so same origin in dev).
  Sign-up gives a 7-day Pro trial.
- `GET /api/me` → `{ user, subscription: { plan, status, trialEndsAt, currentPeriodEnd, isPro } }`.
- `GET/PUT /api/me/config` (Notion token is write-only, never returned).
- `GET /api/queue?status=new|picked|skipped&cursor=` → `{ items, nextCursor }`; `POST /api/queue/:id/{pick,skip,reset}`.
  Returns 402 when not Pro.
- `POST /api/dev/upgrade` (non-production only).

## Step 1: API additions (Sonnet, small)

- `POST /api/billing/checkout` (auth required): when `PAYMENTS_PROVIDER` is `stub` (the default), it upgrades like
  `/api/dev/upgrade` (provider `stub`) and returns `{ url: null, upgraded: true }`. When it is `lemonsqueezy`, it returns
  501 for now (phase 5 does the real checkout). This one works in production too, so the UI never calls `/api/dev/*`.
- `POST /api/billing/cancel` (stub: sets status `canceled`, keeps access until `currentPeriodEnd`). Check that `isPro` honours this.
- Tests for both, using the existing throwaway-Postgres test setup. Lint, typecheck and tests must pass.

## Step 2: web Pro UI (Sonnet, the main step; use the `impeccable` skill)

- **Routing:** no router library. Use a small hash or `history` router in `src/lib/route.ts` with routes `/` (Read),
  `/queue`, `/settings`, `/pricing`, `/signin`. The masthead gets a quiet nav: Read · Queue · Pricing, plus an account
  control (Sign in, or the user's initial with a menu: Settings, Sign out).
- **Auth:** `better-auth/react` client (`createAuthClient`, same-origin base) if its version passes the release-age
  rule, else plain fetch to the Better Auth endpoints. Sign in and sign up on one screen with a toggle, inline errors,
  no modal. After sign-up, show a one-line "Your 7-day Pro trial has started".
- **Session state:** `useMe()` hook (fetch `/api/me`, cache in memory, refetch on focus). Free users and signed-out users
  see the Queue route as a gate: a short explanation plus Start trial / Sign in, never a blank page.
- **Make queue (`/queue`):** segmented control New / Picked / Skipped. Each row shows title, source, score, hook, angle,
  format, effort and niches (check the `queue_item` columns in `packages/db`). Pick and Skip buttons, plus keyboard
  `j/k` to move, `p` pick, `s` skip, `u` undo (reset). Optimistic update with rollback on error and a small undo toast.
  "Load more" with `nextCursor`. Mobile: the actions stay reachable with the thumb (bottom of the row), no swipe gestures.
- **Settings (`/settings`):** niches and sources (reuse the Customize sheet's editors where they fit), a Notion token
  (write-only field: "Saved" state, Replace / Remove), Notion DB id, a Telegram chat id field, and a Plan section
  (plan, trial end or renewal date, Upgrade or Cancel). Save via `PUT /api/me/config`. When signed in, the Read view's
  niches come from the server config; localStorage stays the source for signed-out users. On first sign-in, offer once
  to import the localStorage niches/sources.
- **Pricing (`/pricing`):** two plans side by side (stacked on mobile): Free (Read view, local niches, no signup) and
  Pro ($5/mo, 7-day trial: AI scoring, hooks and angles, Make queue that learns your Pick/Skip, Telegram digest,
  Notion sync). One plain CTA per plan. Pro's CTA calls `/api/billing/checkout`; on `upgraded: true`, go to `/queue`.
  Mark it honestly as test mode while the provider is `stub` (a small "Payments are in test mode" line).
  Replace the phase 2 footer line "coming soon" with a link to Pricing.
- **Service worker:** `/api/me*`, `/api/queue*`, `/api/auth/*` and `/api/billing/*` must be NetworkOnly (never cached).
- Banned look (same as phase 2): no colored accent borders, no gradient text, no emoji bullets, no glassmorphism, no
  purple SaaS gradients, no card grids for the queue. Pricing must not look like a template: no "Most popular" ribbon.
- Unit tests for the router and any pure logic (queue optimistic reducer). Lint, typecheck, tests, `pnpm web:build` clean.

## Step 3: checks (Opus)

- `pnpm lint`, `pnpm typecheck`, `pnpm test` clean (153+ tests).
- Manual run against `pnpm api:dev` + `pnpm web:dev` with a real user: sign up → trial → queue has rows after
  `radar run` with `none` → pick/skip/undo → settings save → cancel → pricing → upgrade. Screenshots at 360 and 1280,
  light and dark, judged against the banned list.
- Update the handoff progress, then `/clear`.
