# Phase 2 plan: design + free Read view

Context: `~/personal/revamps/signal-radar-handoff.md` ("Direction", "UI requirements"). Branch `revamp`, local commits only, never push.
Commits: conventional style (`feat(web): ...`), **no `Co-authored-by` or any AI attribution**.
Node 24: `export PATH=$HOME/.local/opt/node24/bin:$PATH` before any node/pnpm command. Pipe output through `tail`/`grep`.

## Style reference: Refero "Cursor" (warm parchment editorial)

Use it as a reference only: no Cursor name, logo or proprietary fonts. The tokens below are the source of truth.

- Light palette: canvas `#f7f7f4`, surface `#f2f1ed`, raised/secondary fill `#e6e5e0`, border `#cdcdc9`, text `#26251e`,
  text-2 `#84847e`, text-3 `#a1a19f`, icon/meta `#7a7974`. Accents: ember `#f54e00` (text links only, never fills),
  amber `#c08532`, forest `#34785c`, verdant `#1f8a65`, crimson `#cf2d56`. Selection `#8BC4F8`.
- Dark palette (derive it; the source has none): warm charcoal, no pure black/white, e.g. canvas `#1b1a16`, surface `#22211c`,
  raised `#2c2b25`, border `#3a3933`, text `#ecebe6`, text-2 `#a3a29b`. Follow `prefers-color-scheme` plus a manual toggle.
- Fonts (self-host via `@fontsource`): sans **Instrument Sans** (400/500; headings stay 400), serif **EB Garamond** (item titles,
  editorial text), mono **JetBrains Mono** 12–13px (metadata: source, age, points, score).
- Type scale is 1.2 from 15px: 12 / 14 / 15 / 18 / 22 / 26 / 36. Tighten tracking as the size grows. Spacing uses a 4px base.
  Radius is 4px everywhere (8px for sheets/modals), never pills.
- Depth comes from layering canvas, surface and 1px borders. Shadows only on popovers/sheets, and they must be warm and subtle.
- Banned: gradients, glows, glassmorphism, colored accent borders (left-border cards), gradient text, emoji bullets,
  weights ≥600 on headings, pure `#fff`/`#000`, Ember fills. The impeccable skill's anti-pattern checks apply.

## Step 1: data plumbing (Sonnet)

- `packages/core`: add a browser-safe subpath export `"./ranking"` (prefilter + rank + the `Item`/`Niche` types only, no Node or
  SDK imports). Add a test that this entry pulls in no Node built-ins.
- `apps/api`:
  - `GET /api/feed` raises the `limit` max to 500 and adds `Cache-Control: public, max-age=300`.
  - New `GET /api/feed/defaults` returns the default niches and the source list (id, name, type) from `radar.config.ts`.
  - Tests for both.
- `apps/web` (`@radar/web`): Vite + React + TS. The dev proxy sends `/api` to `API_PORT`. Add root scripts `web:dev` and
  `web:build`, and hook the app into lint, typecheck and vitest.
- `apps/web/src/lib`:
  - `feed.ts`: fetch the feed and map `feed_item` rows to core `Item`.
  - `prefs.ts`: localStorage niches/sources/theme, versioned, falling back to the API defaults.
  - `rankClient.ts`: run core prefilter + rank against the user's niches.
  - Unit tests for each.

## Step 2: UI (Sonnet, using the `impeccable` skill)

- One page, mobile-first. A header with the wordmark "Signal Radar", the theme toggle and a "Customize" button.
- View tabs: **Top** (client-ranked across all), then one per source type (**Hacker News**, **Reddit**, **GitHub**, **Videos/RSS**).
  Niche filter chips sit under the tabs. These are square 4px chips, not pills.
- Item row:
  - Rank number in mono.
  - Title in Garamond, linking out with `rel="noopener"`.
  - A mono metadata line: source · domain · age · points/comments or stars · momentum/h.
  - Matched niche keywords in text-3.
  - Type-specific details: the GitHub row shows language/stars, and the Reddit row shows the subreddit.
  - Dense but airy, with dividers rather than cards.
- **Customize** sheet: a bottom sheet on mobile, a side panel on desktop. Edit niches (name + keywords), toggle sources, reset to defaults.
- States: loading skeleton, empty (no matches, with a hint to edit niches), error, and offline (shows the cached feed with a
  "last updated" time).
- Accessibility: keyboard nav, visible focus, contrast AA, `prefers-reduced-motion`. Motion is minimal: short fades only.
- A quiet footer line points to Pro ("AI-scored hooks and a personal queue, coming soon"). No pricing yet (phase 3).

## Step 3: PWA (same Sonnet agent as step 2, or a separate small one)

- `vite-plugin-pwa`: a manifest (name, warm canvas theme/background colors, icons 192/512 + maskable, generated from a simple
  SVG mark: a radar arc, not an emoji). The service worker precaches the app shell, and `/api/feed*` uses NetworkFirst with a
  cache fallback so the last feed works offline.
- Add an install prompt affordance, shown only when `beforeinstallprompt` fires.

## Step 4: checks (Opus)

- `pnpm lint`, `pnpm typecheck`, `pnpm test` clean. The 119 existing tests still pass.
- Screenshots at 360, 768 and 1280, in light and dark, against a dev API with real `feed_item` rows (`radar run` with `none`).
  Judge them against the style reference and banned list above, plus a Lighthouse PWA/a11y pass.
- Update the handoff progress, then `/clear`.
