# YouTube in search: Data API first, RSSHub as fallback

Why: non-tech creators (fashion, food, fitness) live on YouTube, and search today covers HN, Google News, GitHub
and DEV only. Context: `docs/any-niche-plan.md`. Search code: `packages/core/src/search.ts` (`SEARCH_SOURCES`, per-source
fetch + parse, merged with relevance × recency). RSSHub base: `rsshubBase` in `radar.config.ts` (`rsshub:/path`
resolved in `packages/core/src/sources/rss.ts`). Rules: verify every endpoint live once with curl before relying on
it; no new deps; never bypass pnpm `minimumReleaseAge`; no AI attribution in commits.

## Behaviour

Add a `youtube` search source (kind `youtube`, label "YouTube"), tried in this order:

1. **YouTube Data API v3**, when `YOUTUBE_API_KEY` is set:
   - `GET https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=…&maxResults=15&order=relevance&publishedAfter=<SEARCH_WINDOW_DAYS ago>&key=…`
   - Then one `videos?part=statistics&id=a,b,c` call for view, like and comment counts (1 unit), so momentum and
     "rising" work as for other sources.
   - Map to items: title, `https://www.youtube.com/watch?v=ID`, channel as source, `publishedAt`, thumbnail,
     `media.type = 'video'`.
2. **RSSHub fallback**, when there is no key, the quota is used up (HTTP 403 `quotaExceeded`), or the API fails,
   and only when `rsshubBase` is set: use RSSHub's YouTube search route. **Verify that the route exists and its
   path** against a local RSSHub (`docker compose --profile rsshub up -d rsshub`) before wiring it. If no such
   route exists, skip the fallback and say so in the report. Parse it with the existing RSS parser.
3. **Neither available:** YouTube is silently absent. The results line names only the sources that answered.

## Quota (free tier: 10,000 units a day; search = 100 units, so about 100 searches a day for everyone)

- **Server-side cache** per normalized query: 1 hour, LRU of at most 500. Repeat searches cost nothing.
- **Call YouTube only on the live "search everywhere" step,** never on each keystroke. Check how search is
  triggered today, and keep YouTube behind the same commit/debounce.
- **Daily budget guard:** count units used in memory and stop calling the API at 9,000. After a
  `quotaExceeded`, stop calling it until the next midnight Pacific time. During either, use the RSSHub fallback.
- **Log** one line when switching to the fallback (no key, quota, or error), so it's visible in dev.

## Config and docs

- `.env.example`: `YOUTUBE_API_KEY=` with a one-line comment (Google Cloud Console → enable "YouTube Data API
  v3" → API key, restricted to that API).
- `apps/api/src/env.ts`: optional.
- README "Search" section: which sources search covers, the YouTube quota, and the RSSHub fallback.
- The key is only ever used server-side and never sent to the web app.

## Web

- **Results line:** "… from Hacker News, news sites, GitHub, DEV and YouTube".
- **YouTube rows:** a meta line like "Channel · 3d · 120k views". No embed, thumbnails or new visual weight;
  keep the house style.
- **Source filter:** the existing source menu gains YouTube where results include it (the kind `youtube`
  already exists).

## Tests

- Parsing fixtures for the API search and video responses, and for the RSSHub feed if used.
- **Source choice:** a key uses the API; no key with rsshubBase uses RSSHub; a `quotaExceeded` uses RSSHub and
  stays switched until reset; neither available skips YouTube.
- The cache hit doesn't call fetch; the budget guard stops at the limit.
- The key never appears in any response body.

Checks: typecheck, lint, tests, web build. Live check with a real key if `YOUTUBE_API_KEY` is in `.env`; otherwise
report that only the fixtures were tested.
