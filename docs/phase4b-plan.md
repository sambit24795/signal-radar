# Phase 4b plan: clearer Read nav, an understandable queue with AI summaries, neutral defaults

Context: user review on 2026-11-09 of the local app. Style + banned list: `docs/phase2-plan.md`. Branch `master`
(revamp was merged), local commits only, never push. No `Co-authored-by` or AI attribution in commits. pnpm
`minimumReleaseAge` enforced: never bypass. Node 24: `export PATH=$HOME/.local/opt/node24/bin:$PATH`. Keep output small.

User feedback:

1. Read view nav (source text-tabs row + a row of boxed niche chips that overflows off-screen) looks bad.
2. The Make queue is confusing: nothing says what it is or what Pick/Skip do. Items without AI show only a title.
   Wants AI summarization.
3. Customize sheet is confusing (walls of Name/Keywords inputs), and "Reset to defaults" resets to the owner's
   personal niches (from `radar.config.ts`). Defaults must be what _the user_ chose when starting out.

## Step A: AI summary (API + pipeline) — Sonnet

- `AiScoreSchema` gains `summary`: 1–2 plain sentences on what the story actually is (facts, no hype, ≤ 45 words;
  clamp like `hook`). Update the scoring prompt and its tests. Also keep `why` (currently dropped): store it.
- `queue_item` gains `summary text` and `why text` (Drizzle migration). Store `effort` too (`effort text`; closes the
  phase 3 open issue). `insertQueue` writes them.
- `none` provider fallback so the queue is never bare: `summary` = the item's `snippet` cleaned (strip HTML, collapse
  whitespace, ≤ 280 chars, cut at a sentence/word boundary) when present, else null. `why` = the matched niche +
  top keyword reasons in plain words ("Matches AI tools: claude, agent").
- `GET /api/queue` items expose `summary`, `why`, `effort` (alongside existing hook/angle/titleDraft/format/reasons).
- Tests: schema clamp, prompt includes summary, none fallback (HTML snippet → clean text; no snippet → null),
  queue API returns the new fields. Commit `feat: AI summaries and why/effort on queue items`.

## Step B: web — Sonnet with the `impeccable` skill

Field contract from step A (can be built in parallel): queue items get `summary: string|null`, `why: string|null`,
`effort: 'S'|'M'|'L'|null`.

**1. Read view nav.** Replace the two stacked rows with one calm, editorial control. Topics (the user's niches) are what
people care about; sources are secondary. Suggested direction (impeccable may refine): a single row of text tabs for
topics ("All" + niches) that scrolls horizontally with a soft edge fade and no boxed chips; sources move into a compact
"All sources" filter menu (or a quiet secondary line) instead of a tab row. Must work at 360 px without awkward
overflow and keep keyboard/ARIA tab semantics. No boxed button-chips.

**2. Queue that explains itself.**

- Rename to something self-explaining (e.g. "Ideas" in nav, page title "Your ideas"). Under the title, one plain
  line: what it is and how Pick/Skip work, e.g. "Stories picked for your topics after each run. Pick the ones worth
  making something about; skip the rest. Signal Radar learns from both." Move the keyboard hints into a small "Keys"
  disclosure or a `?` popover, not the subtitle.
- Item layout: title (links to source, new tab), meta line (source · topic · age · effort if present), then
  **summary** (what it is), then hook and angle when present, labeled plainly ("Hook", "Angle", "Why it's here").
  Long items collapse to summary + "More" on mobile. Pick/Skip stay, but say what they do via `title`/aria and a
  one-time inline hint on the first item for new users (dismissed on first action, stored in localStorage).
- Picked tab: makes clear these are the user's saved ideas (copy the hook/title quickly: a small "Copy" action).
- Empty state explains when items arrive ("after the next run, usually every few hours").

**3. Defaults are the user's own, and Customize is understandable.**

- Visitors no longer inherit the owner's niches. `/api/feed/defaults` keeps sources but returns `niches: []`
  (API change is one line; do it in this step and fix its test). The owner's `radar.config.ts` niches stay for the
  pipeline only.
- First visit to `/read` with no saved niches: an inline "Pick your topics" panel above the feed using the preset
  library from `apps/web/src/lib/presets.ts` (reuse the Welcome step 1 component; extract it if needed). "Skip, show
  everything" ranks by momentum only. Signed-in users use their saved config as now.
- Customize sheet: topics shown as the same preset picker (selected first, tap to toggle) plus "Add your own topic";
  the raw keywords field hides behind "Edit keywords" per topic. Sources section stays below as simple toggles.
- "Reset to defaults" becomes "Start over": clears the user's topics (confirm first) and shows the picker. Never
  restores someone else's niches.
- Unit tests for prefs (no owner niches; start over), picker selection logic. Lint, typecheck, tests,
  `pnpm web:build` clean. Screenshot with Playwright at 360 and 1280, light and dark (Read with picker, Read with
  topics, Queue with AI fields and with none-fallback, Customize) into the job tmp dir given in the prompt.
  Commit `feat(web): topic-first Read nav, self-explaining Ideas queue, user-owned defaults`.

## Step C: checks (Opus)

Full checks; run `pnpm radar run` with DeepSeek for the local test user to see real summaries; review screenshots.
