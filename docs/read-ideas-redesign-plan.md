# Read + Ideas redesign: fewer lines, no tab strip, paging

Feedback (2026-11-10): too many lines and underlines; the topic tab strip grows with each topic and turns into a
sideways swipe; Ideas stacks a tab underline, a tab rule and a current-row highlight; Read stops at 100.

Rule for this pass: **a line has to separate two things nobody could otherwise tell apart.** Spacing and type
weight do the rest. Keep the parchment/editorial style; no pills-with-borders, no colored stripes, no cards.

## Read

```
Signal Radar      Read  Ideas  Pricing                    ☀  S
⌕ Search stories, topics, sources                          /     ← filled field, no underline

Showing  All topics ▾  from  All sources ▾        Customize      ← one sentence, replaces tab strip
Updated 21 min ago

1  Google Gemini routes personal Drive files…                     ← no row dividers; 28px gap
   Hacker News · github.com · 9h · 464 pts · 112 comments · gemini
2  Claude Fable 5.2 scores 65 on Artificial Analysis…
   …
                       Show 30 more                              ← quiet text button
```

- **Topics leave the tab strip.** They go into a "Showing [topic ▾]" menu next to the existing sources menu.
  The menu is a popover on desktop and a bottom sheet on mobile, with the same component as SourceMenu, and
  "Customize topics" sits at the bottom. With 20 topics, nothing grows sideways. Keyboard: `t` opens the menu;
  `[`/`]` move to the previous/next topic. The URL keeps the topic.
- **Search** becomes a quiet filled field (`--surface` background, radius, no border or underline).
  Focus shows a 1px `--text` outline.
- **Rows** lose their hairline dividers; spacing separates them. The keywords join the meta line. "Score",
  "/h" and "comments" stay in the mono meta line, which is still muted. Rank numbers become lighter.
- **Links** in the toolbar (sources, Customize) look like plain text and get an underline only on hover or
  focus.

## Ideas

```
New 12   Picked 3   Skipped 1                                     ← text weight + count, no underline/rule
```

- The tab strip becomes a text switch: the active option is in `--text` and weight 600, the rest muted.
  There is no underline and no rule under the strip. Same `role="tablist"` semantics.
- **Current row**: no fill, no hairline. In keyboard mode only (j/k), a small `›` marker sits in the left
  margin, the same glyph colour as the rank numbers. The pointer never shows it.
- Rows lose their dividers (spacing only, as in Read). The labels Hook/Angle/Title draft/Why it's here are
  set as small caps in muted text, so the eye lands on the content.
- The Pick/Skip hint ("Got it") moves to a single line under the first row only. It stays dismissible.

## Paging (Read): yes, add it

Read ranks on the client from the most recent 500 feed rows and cuts to `topN = 100` (`lib/rankClient.ts`).
Plan:

- Rank the whole pool (no 100 cap), show 30, and put a "Show 30 more" button after the last row. Rows that
  were already shown keep their rank numbers. The button disappears when the list is exhausted. Then the list
  ends with "That's everything from the last N days."
- No API change. The 500-row pool covers several days, and older stories decay out of the ranking anyway.
  Don't add an infinite scroll: a button keeps j/k and the footer reachable.
- Search results and Ideas get the same "Show more" if they ever exceed 30.

## Steps

1. Topic menu + sentence filter bar; remove the Tabs strip from Read (Sonnet, `impeccable`).
2. Line diet: search field, row dividers, toolbar links, Ideas switch, keyboard marker (Sonnet).
3. Paging in Read (Sonnet; unit test: the ranked list is longer than 100, the button reveals the next 30).
4. Checks: typecheck, lint, tests, build. Screenshots at mobile and desktop, light and dark (Opus reviews).

Commit: `feat(web): topic menu, quieter lines, paging on Read`.
