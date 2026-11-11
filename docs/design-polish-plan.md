# Design polish pass

From an audit on 2026-11-10 (mobile 390x844 + desktop 1280x800, light + dark). Web only, mostly `apps/web/src/styles.css`.
House rules: editorial parchment style, mobile-first; no colored accent borders, gradients, card grids, emoji.

## Fixes (in order)

1. **Ideas current row** (`.qrow`, styles.css ~848-860): no fill on `[aria-current]` until keyboard use; show the
   current row only via `:focus-visible`/keyboard mode, as an inset hairline in `--border`. Drop the `-8px` bleed
   on mobile.
2. **Landing beat screenshots** (`Landing.tsx`, `.beat-fig`): explicit width/height (or aspect-ratio) + `--surface`
   background so frames never collapse; `loading="eager"` on the first two. Desktop: keep all six beats, but
   tighten the layout so image sits next to its text (alternate sides or a narrower 2-column grid, no dead gutter).
3. **Topic tabs on mobile** (styles.css ~256-306): right-edge `mask-image` fade + end padding so the scroll is obvious.
4. **Tap targets**: under `@media (pointer: coarse)`, ensure ≥44px hit area for nav links, `.btn`/`.icon-btn`,
   "Skip for now", "Remove", "Edit keywords", `.item-actions .link-quiet`, Summarize/More/Keys (use padding or
   `::after` hit area; don't change desktop visuals).
5. **Sign-in/sign-up on mobile**: remove the void between form and the "Pro adds…" footer (no min-height stretch;
   footer follows the form). Ensure `autocomplete` attrs (email, current-password/new-password). No new features.
6. **Settings save button**: move into the Notion block, label "Save Notion", show a brief "Saved" state.
7. **Settings sources list**: hide the kind label when it matches/echoes the source name.
8. **`.find-input` focus** (styles.css ~2054): replace the removed outline with a visible underline/outline in `--text`.
9. **Type scale**: add `--fs-*` tokens (e.g. 12/14/16/18/22/30/44/64) and map one-off sizes to the nearest step;
   hardcoded radii → tokens.
10. **Colors**: `rgb(127 127 127 / .25)` (~1020) → `color-mix(in srgb, var(--text) 25%, transparent)`. Define the
    dark palette once (shared by the system-dark media query and `[data-theme=dark]`).
11. **Customize sheet on mobile**: keyword lines wrap to 2 lines (line-clamp) instead of a 1-line ellipsis; bottom
    fade so the "Add more" list doesn't hide under the footer.

## Done when

- `pnpm -r typecheck`, lint and tests pass; `pnpm --filter web build` passes (pre-render included).
- Re-captured screenshots of Ideas, landing (desktop), Read (mobile), sign-in (mobile) show the fixes, light + dark.
- One commit: `style(web): design polish pass`.
