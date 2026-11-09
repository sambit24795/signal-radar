# Phase 4 plan: Web Push, Telegram /start, README, LICENSE

Context: handoff `~/personal/revamps/signal-radar-handoff.md` ("Direction", "UI requirements"), `docs/phase2-plan.md`
(style + banned list), `docs/phase3-plan.md`, `docs/phase3b-plan.md`. Branch `revamp`, local commits only, never push.
No `Co-authored-by` or AI attribution in commits. pnpm `minimumReleaseAge` is enforced: never add excludes, pin older
versions (`web-push` 4.0.0 is too new: use `web-push@3.6.7` + `@types/web-push` of a matching age).
Node 24: `export PATH=$HOME/.local/opt/node24/bin:$PATH`. Keep output small (`tail`/`grep`).

Both notification channels are **Pro features** about the user's own Make queue (they fire from the per-user pipeline).

## Step 1: API + pipeline (Sonnet)

**Web Push**

- Dep `web-push@3.6.7` in `@radar/core`. Env `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto:);
  add to `.env.example`, and generate a real dev pair into the local `.env` (`npx web-push generate-vapid-keys`).
  All optional: unset = push disabled, no errors.
- `GET /api/push/key` (no auth) → `{ publicKey }` or 404 when unset. Existing subscribe/unsubscribe stay; subscribe
  requires Pro (403 otherwise, same check as feeds). Cap 10 subscriptions per user (oldest dropped).
- Core `packages/core/src/digest/push.ts`: `formatPush(items, created)` → `{ title, body, url: '/queue', tag: 'queue' }`
  (title "N new in your queue", body = top item's AI title or title, max ~120 chars) and
  `sendPush(sender, subs, payload)` where `sender` is injectable (tests); returns `{ sent, gone: endpoints[] }`
  (404/410 = gone). TTL 12 h, urgency normal.
- `RadarUser.pushSubscriptions?: {endpoint, keys}[]`; `RadarStore.deletePushSubscriptions(endpoints)`. In `runForUsers`,
  after Telegram: if `queued > 0` and the user has subs and VAPID is set, send once; delete gone subs; failures → `uwarn`.
  `res.pushSent`. `@radar/db` `listProUsers` loads subs; implement the delete. CLI summary line shows push count.
- Tests: formatPush, sendPush gone handling, pipeline sends only when queued > 0, gone subs deleted, API key/403/cap.

**Telegram per-user /start**

- Env `TELEGRAM_BOT_TOKEN` (exists), `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` (all optional for the API).
- Table `telegram_link { token text pk, userId fk cascade, expiresAt }` + Drizzle migration.
- `POST /api/me/telegram/link` (auth + Pro): delete the user's old tokens, create a random 24-byte base64url token,
  15 min expiry → `{ url: 'https://t.me/<username>?start=<token>' }`; 503 when bot env unset.
  `DELETE /api/me/telegram` clears `telegramChatId`. `GET /api/me` (or config) exposes `telegramConnected: boolean`
  and `telegramAvailable: boolean` (keep returning the chat id only if it already does).
- `POST /api/telegram/webhook` (no session): reject unless header `X-Telegram-Bot-Api-Secret-Token` equals
  `TELEGRAM_WEBHOOK_SECRET` (constant-time compare; 404 when unset). Handle `message.text` only, private chats only:
  - `/start <token>`: valid, unexpired → set that user's `telegramChatId = chat.id`, delete token, reply
    "Connected. Your Signal Radar digest will arrive here after each run." Invalid/expired → reply with how to get a
    new link (Settings → Telegram). Bare `/start` → short help.
  - `/stop`: clear `telegramChatId` on any user_config row with that chat id; reply "Disconnected."
  - Anything else: ignore. Always return 200 (`{ ok: true }`) for authorized calls so Telegram doesn't retry.
  - Replies go through a small `sendMessage(fetchFn, token, chatId, text)` in core telegram.ts (reuse; never put the
    URL in errors).
- If the digest send fails with 403 (bot blocked), clear the user's chat id: add
  `RadarStore.clearTelegram(userId)`; `sendDigest` throws an error carrying the status.
- CLI: `radar telegram:webhook <publicBaseUrl>` calls `setWebhook` with `${base}/api/telegram/webhook`, the secret,
  `allowed_updates: ['message']`; `radar telegram:webhook --delete` removes it. Update CLI help.
- Tests: link creation/expiry, webhook secret check, /start valid/expired/bare, /stop, non-private chat ignored,
  403 digest clears chat id.

Lint, typecheck, tests clean. One commit `feat: Web Push and Telegram /start connect for Pro digests`.

## Step 2: web (Sonnet, use the `impeccable` skill)

- Service worker: VitePWA `workbox.importScripts: ['push-sw.js']` with `apps/web/public/push-sw.js` handling `push`
  (show notification with the payload; icon `/icons/icon-192.png`, badge if one exists) and `notificationclick`
  (focus an open client and navigate to payload url, else open it). Add `/api/push` and `/api/telegram` to the
  NetworkOnly rule.
- `apps/web/src/lib/push.ts`: support check (`serviceWorker`, `PushManager`, `Notification`; iOS needs the installed
  PWA, so show a hint when `navigator.standalone === false` on iOS), `subscribe()` (permission → key from
  `/api/push/key` → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` → POST),
  `unsubscribe()`, `status()` (unsupported | unavailable (no key) | denied | off | on).
- Settings, new "Notifications" section (Pro; free users see it locked like "Your feeds"):
  - "Push on this device": one toggle row with a plain explanation line; denied state explains how to re-allow.
  - "Telegram": not connected → "Connect Telegram" button (POST link, open the t.me URL in a new tab, then poll
    `/api/me` every 3 s for up to 2 min until connected); connected → "Connected" + "Disconnect". Hidden when
    `telegramAvailable` is false. Remove the raw chat id text field from the UI.
- Onboarding finish screen: one quiet line pointing to Settings → Notifications (no extra step).
- Unit tests for `push.ts` status logic (mock globals). Lint, typecheck, tests, `pnpm web:build` clean.
  One commit `feat(web): notifications settings with Web Push and Telegram connect`.

## Step 3: README, LICENSE, GIF (Sonnet)

- `LICENSE`: AGPL-3.0, exact text from https://www.gnu.org/licenses/agpl-3.0.txt; `"license": "AGPL-3.0-only"` in all
  package.json files.
- `README.md` (plain, specific, no marketing fluff, no emoji, no badges wall): what it is (two tiers), a GIF, how it
  works (shared fetch → keyword+momentum rank → Pro AI scoring → queue/Telegram/push), stack, local dev quickstart
  (Node 24, pnpm, `db:up`, `db:migrate`, `api:dev`, `web:dev`, `radar run`), env vars table (from `.env.example`),
  self-hosting note (Docker/VPS, portable), CLI commands, project layout, license. Check every command against
  `package.json` scripts and the CLI help.
- `docs/demo.gif`: record with Playwright (installed chromium) against the running dev app at 390x844: landing →
  `/read` scroll → `/queue` with a seeded dev Pro user. Frames → `ffmpeg` palette GIF, ≤ 3 MB, ~10 s.
- Commit `docs: README, demo GIF and AGPL-3.0 license`.

## Step 4: checks (Opus)

- Full checks. Smoke: `/start <token>` via a local POST to the webhook sets the chat id; a run with `none` sends one push
  through a mocked/real sender (log); Settings screenshots at 360 and 1280. Update handoff.
- **Repo rename** is a GitHub action, left to the user: `gh repo rename signal-radar -R sambit24795/react-ts-sass-news`
  then `git remote set-url origin https://github.com/sambit24795/signal-radar.git`.
