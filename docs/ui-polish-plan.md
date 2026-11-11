# UI polish pass: make the web app feel like a real, consistent product

Why: on a phone (2026-11-10) the app looked cluttered and inconsistent: sheets cut off, wrong selected states,
mixed fonts, mismatched buttons. Goal: one coherent design system applied to every screen, so it feels
hand-made and calm, like a real app people want to open daily.

Scope: `apps/web/src/components/*`, `apps/web/src/styles.css` (2.4k lines), `apps/web/src/lib/*` only where
a label or state comes from there. No backend changes. No new deps (never bypass pnpm `minimumReleaseAge`).
No AI attribution in anything. Don't commit.

## Taste rules (from the user; these are hard requirements)

- Hand-crafted, calm, mobile-first (test at 360px and 390px first, then desktop). Installable PWA feel.
- No AI tells: no coloured accent/left borders, gradient text, emoji bullets, glassmorphism, purple SaaS look.
- Underlines only for real inline links. Actions use quieter affordances (icon buttons, text buttons
  without underline, or an overflow menu).
- No divider lines between list rows; use spacing. No stacked rules + underlines on tabs.
- No horizontally scrolling tab strips that grow with content; use dropdown menus.
- No duplicated controls. No hover-only information (phones have no hover).
- Plain words in meta lines, no jargon ("score 57", "40/h").

## Bugs seen on the phone (fix first)

1. **Bottom sheets** (`FilterMenu`, `TopicMenu`, `SourceMenu`, `CustomizeSheet`, any other sheet): they
   don't span the full width on mobile (stop ~70% across, feed visible beside them) and the bottom of long
   lists is cut off. Sheets must be full width on phones, have a max height with internal scroll,
   bottom safe-area padding (`env(safe-area-inset-bottom)`), and a visible end of list.
2. **Source menu selected state:** "All sources" and every individual source are ticked at once, and some
   rows (Hacker News, DEV) are shaded like a stuck hover/focus. Define one rule: either "All" is ticked
   or specific sources are; shading is only for keyboard focus (`:focus-visible`), never a sticky
   `:hover` on touch (wrap hover styles in `@media (hover: hover)`).
3. **Topic names:** the topic menu shows short names ("Steam Deck", "Gamedev") next to a full name
   ("Go and TypeScript dev tools"). Use one naming rule everywhere (menu, chips, settings, item meta).
4. **Header:** theme toggle and account ("D") button differ in size, border and radius. Same size, same
   style, aligned with the logo baseline.
5. **Filter row:** "All topics" (underlined), "All sources" (plain) and "Customize" (floating right) use
   three styles. Make them one control style; the active/filtered state must be clear and consistent.

## Design system (define once in `styles.css`, then apply everywhere)

- **Type:** max two families in the UI chrome. Serif for headlines/story titles only; one sans for all
  UI (controls, menus, placeholders, buttons); mono only if it truly earns a place (probably nowhere in
  meta lines). Fix the serif search placeholder and the mono "Updated 8 h ago" / meta lines.
  A small type scale (e.g. 12/14/16/20/28) as custom properties; no ad-hoc font sizes.
- **Spacing:** a 4px-based scale as custom properties; replace ad-hoc paddings/margins.
- **Colour:** audit tokens; one text, one muted text, one surface, one raised surface, one accent.
  Check light and dark mode both.
- **Controls:** one button style family (primary, quiet, icon) with the same height, radius and focus
  ring; one menu/sheet component style; one input style. Touch targets at least 44px.
- **Story row (`ItemList`, `QueueRow`, `SearchResults`):** title, then one short meta line (source · age ·
  one signal like "4.3k stars" or "885 pts"). Drop "matches agents, claude, mcp" from the default row (or
  show at most one matched topic name). Actions (Save to Ideas, Summarize) become quiet icon/text
  buttons or an overflow menu, not underlined links, and must not make rows feel busy. All three lists
  use the same row component/styles.
- Remove dead CSS after consolidating (the file has grown by accretion).

## Screens to go through (each at 360px, 390px, 1280px; light and dark)

Landing, Pricing, SignIn, Welcome/onboarding, Read (feed, filters, menus, empty/loading/error states),
Search (local + live results), Ideas/Queue, Customize sheet, Settings (TopicPicker, Feeds, Notifications,
AccountMenu), Gate/upgrade prompts.

## How to verify

- Use the cached Chromium at `~/.cache/ms-playwright/chromium-1243/chrome-linux*/chrome` (headless,
  driven via the DevTools protocol from a small Node script in `$CLAUDE_JOB_DIR/tmp` or a temp dir, no
  new deps) to take before/after screenshots at 390×844. Dev server: web `http://localhost:5173`, API
  `:8787` (both already running). Demo login: `demo@radar.test` / `demo-radar-2026`.
- Open each screenshot and check it against the rules above, including open menus/sheets.
- `pnpm` typecheck, lint, and web tests must pass; update tests whose labels changed.
