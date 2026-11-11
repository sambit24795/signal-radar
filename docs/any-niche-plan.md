# Any niche: search and topics for everyone, not only tech

Feedback (2026-11-10): searching "fashion" gave 9-year-old HN posts and star-sorted GitHub repos first, with weeks
shown as "480w". Every default source is tech. Adding a non-tech topic only re-ranks tech stories, so a fashion,
cooking or finance creator gets an empty radar. Project rule for sources: free and keyless, and each endpoint
verified live once with curl before use (see `docs/phase4c-plan.md`).

## 1. Search freshness (`packages/core/src/search.ts`, web)

- **HN Algolia:** restrict to the last 12 months with `numericFilters=created_at_i>…`. Keep relevance order.
- **GitHub:** add `pushed:>` (the date 12 months ago) to the query, and sort by `updated` (or best-match plus that
  filter, whichever gives better results; check with curl for "fashion" and "rust").
- **Merged order:** rank by relevance × recency, so a fresh Google News item beats a stale high-score one. Use a
  pure, tested function.
- **`formatAge`:** under 5 weeks keep `Nd`/`Nw`; under 12 months use `Nmo`; then `Ny`. Update the tests.
- **While searching,** hide the filter bar actions (Customize, Install). Nothing sits alone above the results and
  there is no empty gap.

## 2. Topics bring their own sources

When a topic is added (onboarding, Customize, or from search), it also gets **topic sources**, all keyless:

- **Google News search RSS** for the topic's name and keywords:
  `https://news.google.com/rss/search?q=…&hl=en-US&gl=US&ceid=US:en`.
- **Up to 2 matching subreddits,** found via Reddit's public subreddit search. Verify that it works keyless with
  the project's existing Reddit fetch and User-Agent. If it doesn't, skip Reddit and say so in the report.
  Fetched like the existing Reddit source.

Rules:

- They are stored with the topic, so removing the topic removes its sources. They don't count against the
  custom-feed cap.
- They are visible in Customize under the topic as quiet lines (e.g. "Google News: fashion", "r/fashion"), each
  removable.
- They must reach **both** Read and the nightly Ideas run for that user. First find how custom feeds reach Read
  today (shared `/api/feed` plus per-user feeds?) and use the same path. Document the decision in the report.
- Existing users' topics: backfill topic sources lazily (on next config save or first load), not in a migration
  that makes network calls.

## 3. "Add as a topic" from search

- When a search query matches none of the user's topics (by name or keyword, case-insensitive), show a quiet
  line above the results: "Not one of your topics. **Add “fashion” as a topic**". Keep the house style: a text
  action, no pill or card.
- Adding it creates a topic named after the query (title-cased), with keywords `[query]`, its topic sources
  (part 2), and keeps the user on the results. Then: "Added. Your radar will include fashion from the next
  refresh." with an "Edit keywords" link that opens Customize at that topic.
- Signed-out users: the topic is saved in local prefs, as topics already work for them. Respect `MAX_NICHES`
  (when full, the line says so and links to Customize).

## Tests

- Search ordering and the date filters (pure functions with fixtures).
- `formatAge` boundaries.
- Topic-source generation (Google News URL encoding, subreddit pick), and removing a topic removes its sources.
- Search → add topic: helper logic (match detection, name casing, cap).
- API: config round-trip with topic sources; invalid values return 400.

Checks: typecheck, lint, tests, web build. Screenshots: a search for "fashion" (results plus the add line), the
Customize sheet showing the topic sources, and Read after adding Fashion, at 390 and 1280. Commit is left to the
user.
