# Phase 4c plan: multi-select sources, more sources, add your own items to Ideas

Context: user review 2026-11-10. Style + banned list: `docs/phase2-plan.md`; prior UI work `docs/phase4b-plan.md`.
Branch `master`, local commits only, never push. No `Co-authored-by` or AI attribution. pnpm `minimumReleaseAge`
enforced: never bypass. Node 24: `export PATH=$HOME/.local/opt/node24/bin:$PATH`. Keep output small. Sources must be
free and keyless (handoff "Sources" rule); verify every endpoint live once with curl before using it.

## Step A: API + core (Sonnet)

**More sources** (new fetchers in `packages/core/src/sources/`, each with a recorded fixture test like the existing ones):

- **Lobsters**: `https://lobste.rs/hottest.json` (score, comment_count, tags → item tags). Kind `lobsters`.
- **DEV Community**: `https://dev.to/api/articles?top=1&per_page=30` (positive_reactions_count, comments_count,
  tag_list). Kind `devto`.
- **Mastodon trending links**: `https://mastodon.social/api/v1/trends/links?limit=20` (history[0].uses/accounts as
  momentum). Kind `mastodon`.
- **Product Hunt**: its public feed `https://www.producthunt.com/feed` via the existing RSS fetcher. Kind stays `rss`
  but give the source a stable id/name.
- **YouTube**: split YouTube channel feeds into their own kind `youtube` (the RSS fetcher sets kind from the URL host
  `youtube.com/feeds/...`), so videos can be filtered apart from articles.
- Add them to `radar.config.ts` and to the public `/api/feed/defaults` sources. Update `SourceKind`, the momentum
  normalization if it is per kind, and the client ranker if it switches on kind. Drop any source whose endpoint
  fails live; say so in the report.

**Add to Ideas** — `POST /api/queue` (auth + Pro, else 402/401), body `{ url, title?, snippet?, source?, niche? }`:

- URL must pass `assertPublicUrlSyntax`. If `title` is missing, fetch the page with `fetchPublicText` (pinned SSRF
  guard, 1 MB cap) and read `og:title`/`<title>` and `og:description`/meta description as snippet.
- Enrich the single item: run the configured provider (env from `process.env`, same `createProvider` path as the
  pipeline, the user's feedback few-shots, 20 s timeout). On any failure or `none`, use the none fallback
  (snippet-based summary). Never fail the add because AI failed.
- Insert with `status: 'picked'`, `decidedAt` now, `source` = given source or `'Added by you'`. Same user+url
  already queued → set it to picked and return it (200), else 201 with the row (same shape as `GET /api/queue`).
- Cap: 30 adds per user per rolling 24 h (count rows where the user added them: add a `addedByUser boolean` column,
  default false, migration) → 429 with a clear message.
- Tests: add with title (no fetch), add by URL only (mocked fetch + og tags), SSRF-blocked URL → 400, AI failure
  falls back, duplicate → 200 picked, cap → 429, free user → 402.

Lint, typecheck, tests clean. Commit `feat: Lobsters, DEV, Mastodon, Product Hunt and YouTube sources; add to Ideas
endpoint`.

## Step B: web (Sonnet, `impeccable` skill)

Contract from step A (build in parallel): new `sourceKind` values `lobsters`, `devto`, `mastodon`, `youtube` (keep
`rss` for articles/blogs). `POST /api/queue { url, title?, snippet?, source?, niche? }` → queue item (201/200);
errors 400/401/402/429 with `{ error }`.

- **Source menu → multi-select.** Checkbox rows (real `role="menuitemcheckbox"` or a checkbox list in a popover),
  one per source kind present: Hacker News, Reddit, GitHub, Lobsters, DEV, Mastodon, YouTube, News and blogs
  (`rss`). "All sources" toggles all. Trigger label summarizes: "All sources", "Hacker News", or "3 sources".
  Persist the selection in prefs (localStorage; schema bump with migration of the old single value). Keep it quiet:
  same text-trigger style, no boxed chips. Empty selection is not allowed (last checkbox can't be unchecked).
- **Add to Ideas from Read.** Each Read item gets a small quiet "Save to Ideas" text action (shown on hover/focus on
  desktop, always visible but subtle on mobile). Pro: POSTs with title/url/source/niche, then shows "Saved to Ideas"
  inline with an "Open" link; already saved shows "Saved". Signed out or free: the action opens a short note linking
  to Pricing/Sign in. No toast library; inline state only.
- **Add a link on Ideas.** On the Ideas page, under the intro: a single "Add a link" input + button. Paste a URL →
  POST → item appears at the top of the Picked tab with its summary (show a "Reading the page…" pending state, then
  the result; errors inline, incl. the 429 message). Update the intro line to mention both ways: "…or save anything
  from Read, or paste a link."
- Unit tests: prefs migration + multi-select logic + label summary. Lint, typecheck, tests, `pnpm web:build` clean.
  Screenshots at 360 and 1280, light and dark (source menu open with several checked, Read item saved state, Ideas
  add-a-link pending and done). Commit `feat(web): multi-select sources, save to Ideas, add a link`.

## Step C: checks (Opus)

Full checks; `pnpm radar run` to confirm new sources fetch; add a real link via the API as the local user.

## Step D: on-demand page summaries (after A and B land)

User clarified (2026-11-10): "AI summary" means a button that summarizes the whole linked page so the reader doesn't
have to open it.

- **API** `POST /api/summarize { url }` (auth + Pro; 402 otherwise). Shared cache table
  `page_summary { url pk, tldr, points jsonb, status ('ok'|'unreadable'), model, createdAt }`: hit → return
  immediately. Miss → `fetchPublicText` (pinned SSRF guard, 2 MB) → extract the article with `@mozilla/readability` +
  `linkedom` (pin versions older than `minimumReleaseAge`) → if < ~400 chars of text, store/return
  `status: 'unreadable'` → else DeepSeek via the existing provider: `{ tldr: 1–2 sentences, points: 3–5 short
bullets }`, plain and factual, input truncated to ~12k chars, 25 s timeout. Per-user cap 100 new (uncached)
  summaries per 24 h → 429. HN/Reddit items summarize the linked article URL (the item url already is that).
  YouTube: return `unreadable` for now.
- **Web**: a quiet "Summarize" text action on Read items and Ideas rows (next to "Save to Ideas"). Expands inline
  under the item: pending "Reading the page…", then TL;DR + points, or "Couldn't read this page" with an "Open"
  link. Free/signed-out: inline note linking to Pricing. Remember expanded summaries for the session.
- Tests: cache hit skips fetch and AI, unreadable path, SSRF-blocked URL → 400, cap → 429, free → 402; web unit test
  for the summary state reducer. Commit `feat: on-demand page summaries`.

## Step E: search (after B and D-web land)

User asked (2026-11-10) to search for an article or topic from the app.

- **Instant (client):** a search field at the top of Read filters loaded items by title, tags, source name (diacritic-
  and case-insensitive, debounced, `/` focuses it, Esc clears). Works offline, free tier included.
- **Search everywhere (API):** `GET /api/search?q=&sources=` (public, no auth; per-IP rate limit 30/min, in-memory
  token bucket; q 2–100 chars). Fans out in parallel with 6 s timeouts, keyless only: HN Algolia
  (`hn.algolia.com/api/v1/search?query=&tags=story`), Google News RSS (`news.google.com/rss/search?q=&hl=en`),
  Reddit (`/search.json?q=&sort=relevance&t=month`, RSS fallback like the existing fetcher), GitHub
  (`/search/repositories?q=&sort=stars`, uses GITHUB_TOKEN if set), DEV (`/api/articles?tag=` when q is one word).
  Normalize to RawItem, dedupe, rank by keyword relevance to q + momentum, return top 40 as feed items. Cache
  identical queries 10 min in memory. Failures per source are isolated.
- **Web:** under the instant results, a quiet "Search everywhere for "q"" row → results list in the same ItemList
  style (with Summarize / Save to Ideas). Empty, loading and error states. Query in the URL (`/read?q=`).
- Tests: API fan-out with mocked fetch (one source failing), rate limit, dedupe; web filter + URL sync.
  Commit `feat: search the feed and live sources`.

## Step F: a useful free account (after D-web + E land)

Decided with the user 2026-11-10. AI spend stays Pro-only; free accounts get the no-AI parts.

- **Pipeline:** `listProUsers` → `listQueueUsers` returning Pro users and signed-in free users (with topics). Free users
  get the `none` provider (keyword rank + snippet summary + plain "why"), `topN` capped at 10, no Telegram, push,
  Notion or custom feeds. Pro unchanged. Add `RadarUser.plan: 'pro'|'free'`.
- **API gating:** `/api/queue` (list, pick/skip/reset, POST add) opens to any signed-in user. Free adds skip AI
  enrichment (page metadata only) and are capped at 10/24 h (Pro stays 30). `/api/summarize`: cached results free
  and unlimited for any signed-in user; new (uncached) summaries: free 3/24 h, Pro 100/24 h; 429 message for free
  says how Pro differs. Custom feeds, Telegram, push stay Pro.
- **Web:** Ideas, Save to Ideas, Add a link, Summarize work for free accounts. On free queue rows, one quiet locked
  line where Hook/Angle/Title draft would be ("Hooks, angles and title drafts come with Pro" → Pricing). Summarize
  shows remaining free count only after the first use ("2 left today"). Gates for signed-out users stay (sign-in
  prompt). Update Pricing page's Free vs Pro lists and the landing page's tier summary to match.
- Tests: pipeline gives free users none-scored items capped at 10 and no digest; gating per route; summarize cache
  hit free for free users; free daily caps. Commit `feat: free accounts get the Ideas queue and 3 summaries a day`.

## Step G: marketing page (after F lands)

User approved 2026-11-10. The phase 3b landing predates Ideas, Summarize, Search and the free-account changes.

- **Rewrite `/`** around the current product, in the existing editorial parchment style (impeccable; phase 2 banned
  list applies: no hero gradients, no feature-card grids, no emoji, no fake logos/testimonials/numbers). Beats, each
  with a real product screenshot (light theme, captured from the running app with Playwright at 2x, cropped,
  committed as optimized WebP under `apps/web/public/marketing/`, with a dark-theme variant via `<picture>` +
  `prefers-color-scheme`): read the radar (topics) → search anything → summarize without opening → save to Ideas →
  hooks, angles and title drafts (Pro) → digest on Telegram or push (Pro). Keep the live top-5 strip. Free vs Pro
  matches Pricing exactly (single source of truth: reuse the same tier data module). CTAs: "Open the radar",
  "Create a free account", "Start 7-day trial".
- **FAQ** (plain `<details>`): what's free, what Pro costs ($5/mo, 7-day trial, cancel anytime), where stories come
  from (list the sources), does it post anywhere (no, never), what the AI does and doesn't do, data and privacy in
  one line, self-hosting (AGPL, link to the GitHub repo https://github.com/sambit24795/signal-radar).
- **SEO/share:** one `<h1>`; per-route `<title>`/description for `/` and `/pricing`; Open Graph + Twitter card tags
  (`summary_large_image`) with absolute URLs from a `VITE_SITE_URL` env (default `http://localhost:5173`, documented
  in `.env.example` and README); a 1200x630 OG image in the parchment style generated from an HTML template via
  Playwright → `apps/web/public/og.png`; `robots.txt` and `sitemap.xml` (/, /read, /pricing) generated at build from
  `VITE_SITE_URL`.
- **Pre-render** `/` and `/pricing` to static HTML at build (a small post-build script that renders the routes with
  `react-dom/server` or Playwright against `vite preview` and writes `dist/index.html` + `dist/pricing/index.html`;
  hydrate on load; the live top-5 strip fills in client-side). No new heavy framework. The SPA fallback must still
  work for other routes.
- Lighthouse (mobile) on the built landing: report Performance, Accessibility, Best Practices, SEO; fix anything
  under 90 that's in reach.
- Tests: tier data shared by Landing and Pricing; build script writes the pre-rendered files with the h1 and OG tags.
  Commit `feat(web): marketing landing, FAQ, OG/SEO and pre-rendered landing and pricing`.
