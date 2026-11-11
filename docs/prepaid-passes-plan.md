# Prepaid Pro passes (Razorpay, ₹ in India, $ elsewhere)

Why: users pay once for a block of Pro time, like a phone recharge. No subscription, no auto-renew.
Builder: pi with DeepSeek Flash, one step at a time; Claude reviews each step's diff.

Rules for every step: no new npm deps (call Razorpay's REST API with `fetch`, load checkout.js from
Razorpay's CDN). Never bypass pnpm `minimumReleaseAge`. No AI attribution, no `Co-authored-by`. Don't
commit. Follow `docs/ui-polish-plan.md` taste rules for any UI. Run prettier only on touched files. Each
step ends with typecheck, lint and tests passing (`pnpm -r exec tsc --noEmit`, `pnpm lint`, `pnpm test`).

## Product

| Pass    | India | Elsewhere | Days |
| ------- | ----- | --------- | ---- |
| 30 days | ₹99   | $2        | 30   |
| 90 days | ₹249  | $5        | 90   |
| 1 year  | ₹799  | $15       | 365  |

- Buying adds days to the end of the current Pro time (or from now if expired or on trial). The 7-day
  trial for new accounts stays.
- When the pass ends, the account drops to Free (Ideas + 3 summaries a day). Nothing is deleted.
- Currency: `IN` → INR, everything else → USD. Country comes from Cloudflare's `CF-IPCountry` request
  header; fall back to `Accept-Language` containing `-IN`, then USD. The user can switch with a small
  "Show prices in $ / ₹" toggle. Prices are fixed per currency, never converted.

## Current state (read before step A)

- `packages/db/src/schema.ts:97` `subscription` table: `plan`, `status`, `trialEndsAt`,
  `currentPeriodEnd`, `provider` (`'lemonsqueezy' | 'stub'`). Migrations: `pnpm -C packages/db generate`.
- `apps/api/src/http.ts:36` `isPro`: `status === 'active'` is Pro **regardless of `currentPeriodEnd`**.
  This must change for passes.
- `apps/api/src/routes/dev.ts`: stub `/api/dev/upgrade` (non-production only). Keep it working.
- `apps/web/src/components/Pricing.tsx` (115 lines): the current Pricing page.

## Step A: data and pass logic

1. `packages/core/src/passes.ts`: `PASSES` catalogue (id `p30` | `p90` | `p365`, days, `inr` in paise,
   `usd` in cents), `currencyFor(country, acceptLanguage)`, `formatPrice(pass, currency)` (₹99, $2),
   `extendUntil(currentEnd, now, days)`. Export from the core index. Unit tests.
2. DB: add `'razorpay'` to `SubscriptionProvider`. New table `pass_purchase`: id, userId (FK cascade),
   passId, currency, amount (minor units), days, `razorpayOrderId` (unique), `razorpayPaymentId`
   (unique, nullable), status (`created` | `paid` | `failed`), createdAt, paidAt. Generate the migration.
3. `isPro`: `active` counts only while `currentPeriodEnd` is null (legacy rows) or in the future. Update
   tests.
4. Store helper `grantPass(userId, purchase)` in `packages/db/src/store.ts`: in one transaction mark
   the purchase paid (only if not already paid: idempotent), then upsert the subscription to
   `plan 'pro'`, `status 'active'`, `provider 'razorpay'`, `currentPeriodEnd = extendUntil(...)`.
   Test that granting the same payment twice adds days once.

## Step B: API (`apps/api/src/routes/billing.ts`, mounted at `/api/billing`)

Env (optional; when the key id or secret is missing, billing routes return 503 "Payments aren't set up"
and the web app hides Buy buttons): `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
`RAZORPAY_WEBHOOK_SECRET`. Add them to `apps/api/src/env.ts` and `.env.example`.

- `GET /passes`: public. Returns `{ currency, passes: [{ id, days, amount, label }], enabled }`, using the
  currency from the request (`?currency=INR|USD` overrides).
- `POST /order` (auth): body `{ passId, currency }`. Creates a Razorpay order:
  `POST https://api.razorpay.com/v1/orders` with Basic auth `key_id:key_secret`, JSON
  `{ amount, currency, receipt: <purchase id>, notes: { userId, passId } }`. Insert a `pass_purchase` row
  (`created`). Return `{ orderId, amount, currency, keyId, name: 'Signal Radar', email }`.
- `POST /verify` (auth): body `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }`.
  Check `HMAC_SHA256(order_id + "|" + payment_id, key_secret)` (hex) with a constant-time compare, check
  the order belongs to this user, then `grantPass`. Return the new `currentPeriodEnd`.
- `POST /webhook` (no auth, raw body): check `X-Razorpay-Signature` = `HMAC_SHA256(rawBody,
webhook_secret)`. On `order.paid` or `payment.captured`, find the purchase by order id and
  `grantPass` (idempotent, so verify + webhook together grant once). Always 200 for unknown events.
- Rate-limit `/order` per user (reuse the pattern in `routes/search.ts`).
- Tests with mocked `fetch`: order creation, bad signature → 400, good signature grants, double grant,
  webhook signature, disabled when env missing.
- `/api/me`: include `proUntil` (ISO) so the web app can show it.

## Step C: Pricing page and checkout (web)

Redesign `Pricing.tsx`; keep it calm and hand-made, mobile-first (check at 360/390px):

- Headline "Pay once. No subscription." and one plain sentence on what Pro adds.
- Three pass cards in one column on phones: duration, big price, per-month equivalent in muted text
  ("₹67 a month"), one Buy button each. Mark the 1-year pass "Best value" with a quiet label, not a
  coloured border.
- Under the cards: "Prices in ₹ · Show in $" toggle, "Payments by Razorpay: UPI, cards, netbanking",
  and "Time adds up: buying again extends your Pro".
- A short Free vs Pro list (no big comparison table).
- Signed out: Buy opens the existing sign-in sheet (`SignInSheet`), then returns to Pricing.
- Checkout: load `https://checkout.razorpay.com/v1/checkout.js` on demand (once), `POST /order`, open
  Razorpay with the returned values (prefill email, theme colour = the app's ink colour), on success
  `POST /verify`, then show "You're Pro until 12 March 2027" in place and refresh `me`. Handle
  dismissal (no error) and failure (one plain sentence, try again).
- Account menu and Settings: "Pro until 12 Mar 2027 · Add days" (links to Pricing). Three days before the
  end, a quiet one-line note in the feed footer: "Pro ends in 3 days. Add days".
- When `enabled` is false, show prices with the Buy buttons disabled and "Payments open soon".
- Update the landing page plans section to the same prices and wording.

## Step D: policy pages (needed for Razorpay KYC)

Static routes `/terms`, `/privacy`, `/refunds`, `/contact`, linked from the footer and the Pricing page.
Plain, short, honest text for a one-person product: what's collected (email, topics, saved items),
payments handled by Razorpay (no card data stored), refunds (e.g. full refund within 7 days if asked by
email), contact email. Take the business name and email from `radar.config.ts` new fields
`legalName` and `contactEmail` (placeholders `TODO`, the owner fills them in). Same page style as the app.

## Step E: go live (owner)

1. Razorpay dashboard: finish KYC, request international payments, create live keys and a webhook
   (`https://<domain>/api/billing/webhook`, events `order.paid`, `payment.captured`).
2. Set the three env vars in production. Test one ₹99 purchase with a real card, then refund it.
