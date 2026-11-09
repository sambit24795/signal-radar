# Phase 3b plan: landing page, onboarding, custom feeds

Context: `docs/phase3-plan.md` (Pro UI, done), `docs/phase2-plan.md` (style + banned list), handoff
`~/personal/revamps/signal-radar-handoff.md`. Branch `revamp`, local commits only, never push. No `Co-authored-by` or
AI attribution in commits. pnpm `minimumReleaseAge` is enforced: never add excludes, pin older versions.

Why: niches only rank items from the built-in sources (tech/gaming), so a niche like "space" or "personal finance"
returns nothing. Users need to pick niches up front and, on Pro, bring their own RSS feeds.

## Step 1: custom feeds (API + pipeline)

- `user_config.custom_feeds` jsonb `{ id, url, title }[]`, default `[]`; Drizzle migration in `packages/db/drizzle`.
  Max 15 per user. Pro only (free users can't use them: the shared feed has only server-fetched sources).
- `POST /api/me/feeds/check { url }` (auth + Pro): fetch server-side and return `{ title, itemCount, sample: [3 titles] }`
  or a clear error. Reuse the core RSS/Atom parser. **SSRF guard:** http(s) only, resolve DNS and reject private,
  loopback, link-local and metadata ranges (IPv4 + IPv6), and re-check on each redirect (max 3). 8 s timeout, 2 MB cap.
  Put the guard in core so the pipeline uses it too.
- `PUT /api/me/config` accepts `customFeeds` (validated: URL format, max 15, ids `custom:<short hash of url>`).
- Pipeline (`runForUsers`): after the shared fetch, fetch the union of all Pro users' custom feed URLs once each
  (dedupe by URL, bounded concurrency, failures isolated and logged), and add those items only to the candidate pool of
  the users who own that feed. Custom items never go into the public `feed_item` table.
- Tests: SSRF guard (private IPs, redirect to a private IP, non-http scheme), check endpoint (mocked fetch), config
  validation, pipeline (a custom feed reaches only its owner).

## Step 2: web (use the `impeccable` skill)

- **Landing (`/`):** for first-time visitors. Read view moves to `/read`. Redirect `/` → `/read` when signed in or
  when localStorage shows the radar was opened before (set a flag on first `/read` visit). Masthead "Read" points to `/read`.
  Content: a sharp headline and one-paragraph pitch (an algorithm-free radar for creators: what's moving in your niches,
  and on Pro a queue of ready hooks), a live preview strip of the top 5 real feed items (from `/api/feed`), a short
  "how it works" in 3 plain steps (no icon grid), Free vs Pro summary linking to Pricing, CTAs "Open the radar" and
  "Start 7-day trial". Banned look from phase 2 applies: no hero gradients, no feature-card grids, no emoji, no
  testimonials or fake logos/numbers. It must feel like an editorial page in the Cursor parchment style.
- **Onboarding (`/welcome`):** shown once after sign-up (and to signed-in users whose config has never been saved by
  them: track `onboardedAt` in user_config, set when they finish or skip). Two steps with a step indicator, skippable:
  1. **Niches:** a preset library in `apps/web/src/lib/presets.ts` (~16 presets across AI, dev tools, web dev,
     security, startups, gaming, handhelds/Steam Deck, indie games, science, space, design, personal finance,
     productivity, open source, hardware, creator economy), each with keywords and, for topics the built-in sources
     don't cover, 1–3 suggested RSS feeds. Tap to select (multi-select chips/rows), expand to edit keywords, "Add your
     own". Pre-select the user's localStorage niches (this replaces the phase 3 import offer for new users) or the
     defaults. Max 20.
  2. **Sources:** built-in source toggles, the suggested feeds from chosen presets (pre-checked), and "Add a feed URL"
     that calls `/api/me/feeds/check` and shows title + sample before adding. Finish saves config and goes to `/queue`
     with a line explaining the queue fills on the next run.
     **Verify every preset feed URL** by fetching it once during development; drop any that fail. No guessed URLs.
- **Settings:** add a "Your feeds" section (list, add via check, remove). Free users see it locked with a link to Pricing.
- Unit tests for presets shape and redirect logic. Lint, typecheck, tests, `pnpm web:build` clean.

## Step 3: checks (Opus)

- Full checks; smoke: new user → `/welcome` → pick presets incl. a non-tech one → add a real feed → `radar run` with
  `none` → queue contains items from that feed. Screenshots at 360 and 1280, light and dark. Update handoff.
