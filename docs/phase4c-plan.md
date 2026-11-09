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
