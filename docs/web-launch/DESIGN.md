---
project: Preppa
type: design
status: draft (Loop 0, red-team corrections folded in)
last_updated: 2026-10-20
---

# Web launch design: app.preppa.live as a public product

Goal: the web app serves real customers, real preppers and real money. Loop 0 is design only.
Companion: [SECURITY-SPEC.md](./SECURITY-SPEC.md). Red-team: [RED-TEAM-LOOP0.md](./RED-TEAM-LOOP0.md).
Findings were read from source; nothing was run against production Supabase (`fwidhpzwldneeaphrxgg`)
or Stripe live.

## 1. Current shape (what we are building on)

- Expo Router SPA, `app.json:37-41` (`web.output: "single"`, favicon only). Vercel builds
  `expo export -p web` to `dist/`, one catch-all rewrite to `/` (`vercel.json:1-6`), no headers.
- Client talks directly to Supabase (PostgREST + Realtime, `src/lib/messages.ts:208-241`) with the anon
  key and a user JWT held in localStorage (`src/lib/authStorage.web.ts:5`, `src/lib/supabase.ts:55`).
- Money is server-side only: Edge Functions hold `STRIPE_SECRET_KEY`; settlement is
  `stripe-webhook` (vendored sync engine) mirroring into `stripe.*`, then DB triggers
  (`reconcile_paid_pi`, `reconcile_invoice`, membership sync) write orders and the append-only ledger.
- `reconcile_paid_pi` credits the cook's ledger (`sale`, `tip`, `fee`) and sends
  `notify_payout_available` the moment a PaymentIntent succeeds
  (`20260808030007_high_wire_cook_pro_fee_discount.sql:30-42`), and `reserve_payout` lets the cook cash
  out the full ledger balance (`20260906100000_payout_reconciliation.sql:51-95`). There is no hold and
  no transfer reversal today (no `source_transaction`, `transfer_group` or `createReversal` in any
  hand-written function).
- Every exception inside `reconcile_paid_pi` is caught and downgraded to a warning (`:173` of the same
  file); nothing compares succeeded PaymentIntents with order `pay_status`.
- The only one-off order refund path is a cook decline (`supabase/functions/decline-order/index.ts:27`,
  statuses `confirmed`/`preparing`/`ready`). No customer cancel, no admin refund function, no SLA job;
  the only pg_cron job outside the workers is `reap-experience-holds`.
- Environment guard: `src/lib/supabase.ts:20-41` falls back to live values only when
  `EXPO_PUBLIC_APP_ENV=production` or hostname is `app.preppa.live`; non-production builds pointing at
  live throw. `process.env.VERCEL_ENV` at `:22` is not inlined by Expo, so it is dead code on web.
- The three vendored sync-engine functions (`stripe-setup`, `stripe-webhook`, `stripe-worker`) read
  `Deno.env.get("STRIPE_SECRET_KEY")` directly (`stripe-setup/index.ts:48818`,
  `stripe-webhook/index.ts:47103`, `stripe-worker/index.ts:47108`). `stripe-setup` calls
  `findOrCreateManagedWebhook`, which lists up to 100 webhooks on the Stripe account and deletes every
  one tagged `managed_by: stripe-sync` that is not in this project's `_managed_webhooks` table
  (`stripe-setup/index.ts:46245-46262`). On a fresh project that table is empty, so running it with a
  Stripe account shared with another environment deletes that environment's webhook.

## 2. User flows on web

Legend: **[gap]** = blocks a public launch today, fixed in the loop named.

### Customer
1. Lands on a shared link (`/meal/[id]`, `/store/[cook]`, `/post/[id]`; share base `src/lib/share.ts:5`,
   hardcoded to production, so test-host shares point at production; fixed in 2.12).
   - **[gap L2]** Link unfurls blank: no head tags, no OG, empty HTML body under `output: single`.
   - **[gap L2]** Full-screen onboarding covers every route for any browser without the local
     `onboarded` flag (`app/_layout.tsx:96`, `src/store/store.tsx:198,245`). No guest browse.
2. Target flow: browse home/discover/meal/store/feed as a guest. Auth is requested only at a gated
   action (add to cart, checkout, follow, message, book). Onboarding preferences (location, goals,
   cuisine) become optional, asked after sign-in or inline.
3. Sign in: email OTP or password (`src/lib/supabase.ts:103-139`). Google OAuth is dead code with no
   callers (`:413`); remove in L3. No terms or privacy consent is captured at sign-up or checkout (D13).
4. Cart, then checkout: `create-order` re-prices server-side, adds 10% fee and Stripe Tax, uses an
   idempotency key; web card path via `@stripe/stripe-js` (`src/lib/payments.ts:34`). The tax
   calculation is never committed as a Stripe Tax transaction (D11).
5. Payment confirm (Stripe.js, 3DS in a Stripe iframe), then webhook to `stripe.payment_intents`, then
   trigger flips `orders.pay_status='paid'` and writes ledger rows.
6. Track order (`/order/[id]`, `/track`), message cook (`/messages`), review (`/review/[id]`).
   **[gap L3]** no customer cancel window and no refund if the cook ignores the order (S16).
7. Subscriptions (PrepPlus, plans) are web-only by design (`app/prepplus.tsx:74`,
   `app/plan/[id].tsx:141`, `app/build-plan.tsx:79`). Plans, boxes, experiences and bookings charge no
   tax (D11).
8. Experiences: book, pay, join via meeting link. **[gap L3]** meeting link scheme not restricted.
9. Account: addresses, saved cards, delete account. **[gap L2]** destructive confirms use
   `window.confirm` (`src/lib/confirm.ts:13`), suppressed in some in-app webviews.

### Prepper
1. Apply (`/apply`), admin approves (kitchen approval evidence migration is local-only, not deployed).
   The pickup address is captured only in the application RPC
   (`20260925024000_store_kitchen_pickup_address.sql`); existing cooks have none and there is no edit
   UI, so after deploy every pickup checkout returns 409 (`create-order/index.ts:261-273`); fixed in 4.2.
2. Stripe Connect Express onboarding: full-tab redirect, return to `/my-hub?connect=return|refresh`
   (`src/lib/connect.ts:42-53,170-174`). Return/refresh URLs pinned to `https://app.preppa.live`
   (`supabase/functions/connect-onboard/index.ts:31,59-61`). **[gap L1]** no test host can complete it.
   **[gap L2]** onboarding overlay can cover the return handler on a fresh browser.
   **[gap L2]** `openPayoutDashboard` calls `window.open` after an `await` (`src/lib/connect.ts:170-174`),
   which Safari blocks (2.13).
3. Menu: create meals/plans/experiences with photo upload (seven duplicated `<input type=file>` paths,
   see web-surface findings). **[gap L2]** consolidate into `src/components/PhotoUploader.tsx`.
4. Post reels: web is the main posting surface (`app/hub/post-reel.tsx:47`) but recording uses
   `expo-camera` (`app/hub/record-video.tsx:4,17-60`), unverified on web. **[gap L2]** add file-upload
   fallback, verify Chrome/Safari/Firefox.
5. Fulfil orders (accept/decline with refund), Cook Pro (`app/hub/pro.tsx:82`).
6. Cash out: `connect-payout` (advisory lock, `payout_<id>` key, `finalize_payout`), weekly
   `auto-payouts`, 5-minute `reconcile-payouts`. **[gap L2 design, L3 build]** no payout hold, no
   clawback (2.11, S15). `stripe_accounts.payouts_enabled` refreshes only when the cook's client calls
   `connect-status` (`connect-status/index.ts:60`); **[gap L3]** no `account.updated` handling (S18).

### Admin
1. Same SPA, `admin/*`, web-only. Client gate is cosmetic (`app/admin/_layout.tsx:19,36`); admin RPCs
   are gated by `is_admin()` server-side, but some RLS policies test `profiles.role = 'admin'` directly
   (for example `20260714193000_public_support_requests.sql:58`), so they bypass any change to
   `is_admin()` (S3).
2. Approve kitchens, change roles, review anomalies, handle `public_support_requests`, payouts in
   `needs_review`. **[gap L3]** no MFA; one XSS or phished session is full admin. **[gap L3]** no admin
   refund tool (S16).

## 3. Trust boundaries

```
 Browser (untrusted: customer, prepper, admin, attacker)
   |  HTTPS, static assets + index.html
   v
 Vercel edge (app.preppa.live)      [B1: headers/CSP, rewrites, OG middleware (escaped, allowlisted)]
   |
   |  anon key + user JWT (Authorization header, no cookies)
   v
 Supabase PostgREST / Realtime      [B2: RLS + grants; SECURITY DEFINER RPCs with in-body checks]
 Supabase Edge Functions (user)     [B3: verify_jwt=true, zod input, server-side pricing, rate limits]
   |
   |  STRIPE_SECRET_KEY, service role (server only), key-mode + account guard
   v
 Stripe (one Sandbox per non-prod env; live for prod) [B4: secret key never in client; idempotency]
   |  signed webhook
   v
 stripe-webhook / stripe-worker     [B5: signature in DB, vault worker secret, verify_jwt=false]
   -> stripe.* mirror -> triggers -> orders, ledger_entries (append-only)
 Cron workers (pg_cron -> functions) [B6: vault secret; must never cross projects]
 Mux -> mux-webhook                  [B5: HMAC; replay window missing]
 Browser -> third parties            [B7: js.stripe.com, stream/image.mux.com, nominatim, bigdatacloud]
 Agent tooling (Supabase MCP)        [B8: can apply migrations org-wide; scoped read-only to test ref]
```

Rules that hold across every loop:
- Nothing trusted is decided in the client (prices, roles, admin, eligibility). Client gates are UX.
- A test environment never holds a production secret, and no artifact of one project (cron URL,
  vault value, media host, Stripe account, webhook) can reach the other.
- Every environment has its own Stripe account (live for production, a dedicated Stripe Sandbox for
  each of test and local). No two environments share one Stripe account or Sandbox.
- No Stripe-touching function (vendored or hand-written) runs unless its key mode and Stripe account
  match the project it is deployed to (task 1.1g).
- Money state changes only through Stripe-idempotent calls plus locked, service-role-only RPCs.
- Builder agents never hold write tooling against production; production writes are E's.

## 4. Environment topology

| | Production | Test (to create, L1) | Local |
|---|---|---|---|
| Web host | `app.preppa.live` (Vercel Production) | Vercel Preview, stable alias e.g. `staging.preppa.live` (decision D3) | `localhost:8081` |
| Supabase | `fwidhpzwldneeaphrxgg` | new project ref, same Postgres major | `supabase start` (never the test project, so the two never share a Stripe Sandbox) |
| Stripe | live account (`pk_live_`, `sk_live_`) | dedicated Stripe Sandbox `preppa-test` (`pk_test_`, `sk_test_`), Connect + Tax enabled | dedicated Stripe Sandbox `preppa-local` |
| `STRIPE_EXPECTED_ACCOUNT` (function secret) | live `acct_` id | `preppa-test` Sandbox `acct_` id | `preppa-local` Sandbox `acct_` id |
| Client env | fallbacks in `src/lib/supabase.ts:14-18` | Vercel Preview scope: `EXPO_PUBLIC_APP_ENV=preview`, test URL, anon key, `pk_test_` | `.env.development` |
| Auth Site URL / redirects | exactly `https://app.preppa.live` | exactly the test host | `http://localhost:8081` on local stack only |
| Email | Resend `noreply@preppa.live` | separate sender or catch-all (D4) | Inbucket |
| Vault `stripe_sync_worker_secret` | prod value | new random value | local value |
| Vault functions base URL (1.2) | set by E before the 1.2 migration deploys | test project URL | local URL |
| EAS (native) | `production` profile (`eas.json:28-37`) | `preview`/`development` via `eas env:create` | n/a |

Setup order for the test project is the L1 ordered checklist below. The critical constraints are:
the key-mode guard (1.1g) is deployed and proven before any `stripe-setup` call, and `stripe-setup`
runs before the trigger-creating migrations, or paid orders never reconcile. L1 removes the second
constraint with a re-runnable trigger-install migration (1.4).

## 5. Loop plan

Owners: **B** = builder agent (code on a branch, never deploys), **R** = reviewer agents (red-team, then
sane-mode, fresh context), **E** = Ezekiel (dashboards, cost, production deploys, legal, recruiting).
Every loop ends with R passes and E's go-ahead before anything reaches production.

Tooling rule (red-team medium, tooling): the builder's Supabase MCP runs in read-only mode and is
scoped to the test project ref (`--read-only --project-ref <test ref>`). B never calls
`apply_migration`, `execute_sql` writes or `deploy_edge_function` against any project; E deploys.
`supabase/config.toml` never carries the production ref (1.5).

### Loop 1: Test environment and safe edge (no production impact)

**L1 ordered checklist.** Steps run in this order; a step does not start until the one before it has
its evidence recorded in `docs/web-launch/L1-EVIDENCE.md`.

| Step | Action | Owner | Evidence |
|---|---|---|---|
| 1 | Create Stripe Sandbox `preppa-test` and Stripe Sandbox `preppa-local` (separate Sandboxes, never the live account, never shared). Enable Connect Express and Tax head office in each. Record each Sandbox `acct_` id. | E | Sandbox names and `acct_` ids |
| 2 | Provision the test Supabase project. | E | project ref |
| 3 | B lands 1.1g (key-mode and account guard) on the branch; R reviews. | B, R | guard tests green, red without the guard |
| 4 | E deploys the guarded `stripe-setup`, `stripe-webhook`, `stripe-worker` to the test project, sets `STRIPE_EXPECTED_ACCOUNT` to the `preppa-test` id. | E | deploy versions |
| 5 | Verify the key before `stripe-setup`: the secret is `sk_test_`/`rk_test_`, and `GET /v1/account` with it returns the `preppa-test` id. Record the `preppa-test` and live webhook lists (ids only). | E | key prefix, account id, webhook lists |
| 6 | Negative check: call `stripe-setup` with `STRIPE_EXPECTED_ACCOUNT` deliberately set to the `preppa-local` id. It must refuse before any Stripe call; webhook lists in both Sandboxes unchanged. Then restore the correct value. | E | refusal response, unchanged lists |
| 7 | Run `stripe-setup` on the test project. Re-list live webhooks: identical to step 5. | E | before/after live webhook ids |
| 8 | Apply remaining migrations (1.2, 1.3, 1.4, 1.12), run `install_stripe_reconcile_triggers()`. | E | `pg_trigger` listing |
| 9 | Remaining tasks 1.5-1.11, 1.13, then the L1 exit gate. | B, E | exit gate SQL output |

| # | Task | Owner | Paths |
|---|---|---|---|
| 1.1 | Provision test Supabase project and per-environment Stripe Sandboxes (`preppa-test`, `preppa-local`), Connect Express, Tax head office (checklist steps 1-2) | E | dashboards |
| 1.1g | Key-mode and account guard at the top of each vendored wrapper, before `StripeSync.create`: derive the ref from `SUPABASE_URL`; production ref requires `sk_live_`/`rk_live_`, any other ref requires `sk_test_`/`rk_test_`; then `GET /v1/account` must equal `STRIPE_EXPECTED_ACCOUNT` (cached per isolate). Mismatch returns 500 with a fixed message and makes no other Stripe call. Inline per file, matching the per-file `requireEnv` idiom (no shared module exists in `supabase/functions/` today). Edits only the thin `Deno.serve` wrapper, never the engine bundle. | B | `supabase/functions/stripe-setup/index.ts` (wrapper near `:48790-48830`), `supabase/functions/stripe-webhook/index.ts` (`:47095-47110`), `supabase/functions/stripe-worker/index.ts` (`:47100-47110`), new `tests/stripeKeyModeGuard.test.ts` |
| 1.2 | Replace hardcoded prod URL/ref in cron and push migrations with a Vault-resolved base URL (new forward migration, do not edit applied ones). The migration raises if the Vault base URL is absent, instead of relying on `where exists` guards that skip silently. E sets the production Vault value before this migration is ever deployed to production (4.2 step 1). Add a `detect_system_health_issues()` check that alerts when the base URL is missing or when a worker has not run in its window. | B | `supabase/migrations/20260906100000_payout_reconciliation.sql:320`, `20260906110000_auto_payouts.sql:116`, `20260910060000_fix_remaining_worker_dispatch_collision.sql:37,55,73`, `20260925184000_reconcile_ambiguous_cycle_charges.sql:83`, `20260925185000_reconcile_ambiguous_booking_balances.sql:184`, `20260808024849_high_fix_notify_push_pass_kind.sql:16`, `20260908030000_system_health_monitoring.sql:22` |
| 1.3 | Media URL allowlist reads the project storage host from config, not a literal | B | `20260714065911_critical_fix_post_media_url_allowlist.sql:14-16` |
| 1.4 | Re-runnable `install_stripe_reconcile_triggers()` callable after `stripe-setup`, plus a check that fails loudly if `stripe.*` triggers are missing | B | `20260710195031:55-62`, `20260711060016:78-86`, `20260713234329:50-58`, `20260808025920:88-95` |
| 1.5 | Version `verify_jwt=false` set in `supabase/config.toml` `[functions.*]`; move `project_id` out of the committed default | B | `supabase/config.toml:1`, `supabase/functions/MANIFEST.md:34-48` |
| 1.6 | `connect-onboard` allowed origins from env (`APP_ORIGINS`), not a literal | B | `supabase/functions/connect-onboard/index.ts:31,59-61` |
| 1.7 | Hand-written Edge Functions assert the same key-mode and account rule as 1.1g inside `requireEnv('STRIPE_SECRET_KEY')` | B | the 26 `requireEnv('STRIPE_SECRET_KEY')` callers under `supabase/functions/*/index.ts` |
| 1.8 | Remove dead `VERCEL_ENV` branch. `scripts/check-env-separation.mjs` reads only `eas.json` (`:3-19`), so add a separate build-time check run from Vercel `buildCommand`: read `VERCEL_ENV` and the `EXPO_PUBLIC_*` values; fail a Preview build that has `pk_live_` or the production ref, and a Production build that has `pk_test_` or a non-production ref | B | `src/lib/supabase.ts:22`, new `scripts/check-vercel-env.mjs`, `vercel.json` |
| 1.9 | Vercel: security headers in **Report-Only** CSP + enforced non-CSP headers, scoped rewrite, cache headers, secret scan in `buildCommand` | B | `vercel.json` (spec in SECURITY-SPEC 3) |
| 1.10 | Vercel Preview env vars, deploy branch to test host, run test-env smoke list | E then B | Vercel dashboard |
| 1.11 | Managed-webhook health: a `detect_system_health_issues()` check that alerts admins when `stripe._managed_webhooks` is empty, or when no `stripe.*` row has been written in 24 hours while orders were attempted; E also enables Stripe's own failing-webhook email on the live account | B (check), E (Stripe setting) | new migration extending `20260908030000_system_health_monitoring.sql` |
| 1.12 | Stuck-payment sweep: a pg_cron job every 5 minutes that alerts admins (via `notify_admins`, deduped per PI) for any `stripe.payment_intents` row with `status='succeeded'` older than 5 minutes whose `metadata` order, booking or cycle is not paid | B | new migration; reads `20260808030007_high_wire_cook_pro_fee_discount.sql:23-42` metadata keys |
| 1.13 | Builder MCP read-only and scoped to the test ref (tooling rule above) | E | MCP config |

**Exit gate L1:** on the test host with Stripe test cards: OTP sign-up; prepper Connect onboarding to
`payouts_enabled`; paid order shows `pay_status='paid'` plus ledger `sale`/`tip`; double-tap gives one
PI and one order; decline refunds and reverses ledger; payout transfers and finalizes, and the
behaviour of an early payout is recorded for test card `4242 4242 4242 4242` (funds pending) versus
`4000 0000 0000 0077` (funds available immediately), as input to 2.11; subscription cycle charges;
`pg_trigger` lists the `stripe.*` triggers; `regressions.sql` green on the test project; checklist
steps 5-7 evidence recorded (guard refused the wrong account, live webhook list unchanged);
`tests/stripeKeyModeGuard.test.ts` red without 1.1g, green with it; zero cron jobs on the test project
reference `fwidhpzwldneeaphrxgg` (SQL check in `cron.job`) and zero functions do either
(`select proname from pg_proc where prosrc like '%fwidhpzwldneeaphrxgg%'` returns no rows); the
stuck-PI sweep query (1.12) returns zero rows, and returns one row after a forced trigger failure on a
test order; CI green.

### Loop 2: Public web product (guest browse, sharing, web UX)
| # | Task | Owner | Paths |
|---|---|---|---|
| 2.1 | Guest browse: onboarding no longer blocks routes; auth prompt on gated actions; deep links and Connect return work on a fresh browser | B | `app/_layout.tsx:96`, `src/store/store.tsx:198,245`, `src/components/Onboarding.tsx`, `app/(tabs)/my-hub.tsx:382-437` |
| 2.2 | Verify anon can read exactly the public surfaces guest browse needs, on the test project. Guest browse reads the base `kitchens` table through the meals embed (`src/data/supabaseRepository.ts:22`), not only public views, so the probe checks the column set anon receives (input to S12) | B, R | RLS, see SECURITY-SPEC 5 |
| 2.3 | Static head: title, description, theme-color, apple-touch-icon, manifest (192/512 icons), robots.txt, sitemap for public routes; drop `orientation: portrait` for web | B | `app.json:6,37-41`, `public/` or template per D1 |
| 2.4 | Per-entity OG for `/meal`, `/store`, `/post` (D1). Output-safety rules: emit only allowlisted fields (title, description, image URL, canonical URL); HTML-attribute-escape every value (`&`, `<`, `>`, `"`, `'`); image and canonical URLs must parse as `https:` on an allowlisted host or are dropped; nothing is written outside `<meta>` attributes and `<title>`. Merge gate: a test with a hostile title (`"><script>alert(1)</script>` and a `'` variant) is red against a non-escaping build and green with escaping. Deploy gate: 2.4 reaches production only after 4.3 (enforced CSP with `script-src` on production) | B, R | new `middleware.ts` (Vercel Routing Middleware), new `tests/ogMiddleware.test.ts` |
| 2.5 | Replace `window.confirm` with in-app dialog; audit remaining `Alert.alert` | B | `src/lib/confirm.ts:13` |
| 2.6 | Video post: file-upload fallback; lazy-load `expo-camera` | B | `app/hub/record-video.tsx`, `app/hub/post-reel.tsx:128` |
| 2.7 | One web picker in `PhotoUploader` (size cap, HEIC handling) used by all seven screens | B | `src/components/PhotoUploader.tsx:54` and callers |
| 2.8 | Desktop layout: docks constrained to content width; feed reel at 1280/1440/1920 | B | `src/ui/layout.tsx:21-27,55`, `src/components/FeedReel.tsx` |
| 2.9 | Keyboard: Escape closes sheets, focus trap/restore, visible focus ring; header roles; toast live region; image alt | B | `src/ui/overlay.tsx`, `src/ui/primitives.tsx:73`, sheets |
| 2.10 | Playwright on the test host: deep-link refresh, guest browse, sign-in, test-card checkout, 3DS, Connect return, admin redirect for non-admin | B | new `e2e/`, CI job |
| 2.11 | **Payout hold and clawback design.** Write the design for: (a) when ledger credit becomes withdrawable (options: fulfilment plus N days, or a `source_transaction` transfer tied to the charge with `transfer_group` per order); (b) transfer reversal or offset against future payouts on refund and on dispute, including a ledger that goes negative; (c) caps on tips and on payouts for new kitchens (today `MAX_TIP_CENTS = 100_000`, `create-order/index.ts:22,36`); (d) the platform available-balance problem for transfers without `source_transaction`, using the 4242 vs 0077 evidence from the L1 gate. Output: decision table with numbers for E, and the regression list S15 must implement. Merges D10 | B (draft), R (review), E (picks N and caps) | new `docs/web-launch/PAYOUT-HOLD.md`; affects `20260808030007_high_wire_cook_pro_fee_discount.sql:30-42`, `20260906100000_payout_reconciliation.sql:51-95`, `supabase/functions/connect-payout/index.ts:92-97`, `supabase/functions/auto-payouts/index.ts:37`, `supabase/functions/create-order/index.ts:22,36` |
| 2.12 | Share base from the configured origin, not the production literal | B | `src/lib/share.ts:5` |
| 2.13 | Safari: open the payout dashboard window synchronously on tap, then set its location after the link fetch (or navigate in the same tab) | B | `src/lib/connect.ts:170-174` |

**Exit gate L2:** Playwright suite green against the test host in CI; a shared meal link unfurls with
title/image in iMessage, WhatsApp, Slack (manual, screenshots); the hostile-title OG test is green and
was shown red without escaping; a private window opens `/meal/<id>` directly to the meal; Lighthouse
a11y >= 90 on home, meal, checkout; manual pass Chrome, Safari (macOS + iOS), Firefox, Instagram in-app
webview; `PAYOUT-HOLD.md` approved by E with N and caps filled in.

### Loop 3: Security and money hardening
Tasks are SECURITY-SPEC section 6, items S1-S18, in rank order. Owner B for code, E for dashboard
items (Auth settings, MFA enrolment). **Exit gate L3:** each DB/function fix has a regression in
`supabase/tests/regressions.sql` shown red without the fix and green with it; CSP switched to enforce
on the test host with zero violations across the Playwright suite; red-team pass reports no open High;
every admin read path (RPCs and RLS policies found by the S3 grep) rejects an aal1 session; the S6
`pg_proc` scan returns no function using `request.jwt.claim.role`; S15 payout hold blocks an early
cash-out and a refund after payout produces a reversal or offset on the test project; S16 admin refund,
auto-cancel and customer cancel each refund on Stripe and reverse the ledger.

### Loop 4: Production cut-over and controlled real money
| # | Task | Owner |
|---|---|---|
| 4.1 | Diff live Edge Functions and RPC definitions against the repo, using live `list_edge_functions` and `pg_proc` (not `MANIFEST.md`, which is stale: `decline-order` has no row); list every local-only change (`docs/obsidian/Tasks.md:119-123,134,140,147,220-221,236`) | B (read-only MCP) |
| 4.2 | Deploy pending migrations and functions to production in the expand-then-contract order below, with correct `verify_jwt` | E approves and runs |
| 4.3 | Enforce CSP on production after one week Report-Only clean; precondition for deploying 2.4 to production | E |
| 4.4 | Two real accounts: A cannot read B's orders, messages, tickets, addresses | E + B |
| 4.5 | One real dollar: customer to Preppa to cook payout, then refund, cancel, failed card, sub-$20 payout, forced reconcile, duplicate-ledger check, fee math (`docs/obsidian/Launch-Plan.md:137-149`); plus refund after payout (S15 reversal or offset), admin refund (S16), and an auto-cancel of an ignored order (S16) | E |
| 4.6 | Branch protection: require `web-build-security` and the e2e job; deploys gated on CI | E |
| 4.7 | Non-code launch gates: legal review of help-center pages, terms and privacy consent capture (D13), sales tax scope (D11), launch geography, support operator, Cohort 0 cooks with real menus | E |
| 4.8 | Reconcile contradicting docs (Stripe mode, CI state, branch protection, kitchen counts, verdict banners) | B |

**4.2 deploy order (expand, then switch, then contract).** Each step is verified on the test project
first with the same order, and live checkout plus decline-refund are smoke-tested between steps.
1. E sets the production Vault functions base URL (1.2) and confirms it with a read.
2. Additive migrations only: new columns (`delivery_address_text` from `20260925022000`,
   `delivery_instructions` from `20260925025000`, and any other column the 4.1 diff lists as pending),
   new tables, new functions, and the 3-argument `finalize_order_cancel` created **alongside** the
   2-argument one. The `drop function ... finalize_order_cancel(uuid, boolean)` at
   `20260925011000_order_cancel_customer_reason.sql:3` moves into a later contract migration. If 4.1
   confirms the pending file was never applied anywhere shared, B edits it before first deploy;
   otherwise B adds a forward migration that recreates the 2-argument wrapper.
3. Pickup address: backfill `addresses(kind='kitchen_pickup')` for existing cooks (E collects, B
   writes the one-off SQL) and ship an owner-facing pickup-address editor (B, new screen under
   `app/hub/`); until a kitchen has one, the client hides pickup for it instead of failing with 409 at
   `create-order/index.ts:270`.
4. Edge Functions: `create-order` (needs step 2 columns, `create-order/index.ts:298-299`),
   `decline-order` (calls the 3-argument signature, `decline-order/index.ts:100`), then the rest.
5. Web client build to production.
6. Contract migrations: drop the 2-argument `finalize_order_cancel` and anything else superseded,
   only after the live function list shows no caller of the old signature.
Rollback at any step before 6 is a redeploy of the previous function version; no step before 6 removes
anything a live caller uses.

**Exit gate L4 (launch go/no-go):** 4.1 diff empty; 4.4 and 4.5 recorded with evidence; at least N
approved cooks with Stripe-ready payouts and a pickup address in the launch geography (N is D7); legal
pages final and consent captured (D13); tax decision recorded (D11); `docs/obsidian/Launch-Plan.md`
verdict line updated by E.

## 6. Open decisions

| ID | Decision | Recommendation |
|---|---|---|
| D1 | How to serve per-entity OG tags | Vercel Routing Middleware on `/meal/*`, `/store/*`, `/post/*` only: fetch the public view row with the anon key, inject escaped, allowlisted `<meta>` values into `index.html` (2.4 rules), `s-maxage=300`. Keeps `output: single`. Ships to production only after enforced CSP (4.3). Rejected: `output: static` (data is dynamic), UA-sniffing prerender (cloaking risk). Check Expo v57 docs (AGENTS.md) for whether `+html.tsx` applies under `single` or a `public/index.html` template is needed. |
| D2 | Guest browse scope | Guests see home, discover, meal, store, post, feed; auth at cart add or any write. Needs product sign-off. |
| D3 | Test host name | `staging.preppa.live` as a Vercel Preview alias, Vercel deployment protection off only for that alias, `noindex` header. |
| D4 | Test email sender | Separate Resend domain or a catch-all; never the production sender key in the test project. |
| D5 | Transactional email for order/refund/payout | Build in L3 or defer; in-app/push only today (`docs/obsidian/Launch-Plan.md:289`). |
| D6 | Geocoding | Proxy through an Edge Function with caching or a paid provider before real traffic (Nominatim policy). |
| D7 | Minimum supply and geography for go-live | E to set N cooks and the launch city. |
| D8 | CSP report collection | Report-Only with browser console review on test host first; add a `csp-report` endpoint only if production Report-Only needs evidence. |
| D9 | Admin MFA mechanism | Supabase TOTP, `aal2` required inside `is_admin()`, and every direct `role = 'admin'` check routed through `is_admin()` (S3); confirm plan support. |
| D10 | Refund/dispute reconciliation | Folded into 2.11 (design) and S7/S15 (build). |
| D11 | Sales tax scope | Commit `tax.transactions.createFromCalculation` from the payment reconcile path and create reversals on refund (S17). Decide whether plans, boxes, experiences and bookings are taxable in the launch state; recommendation: calculate tax for all prepared-food charges, get E's tax adviser to confirm before L4. |
| D12 | Password minimum | Client enforces 8 (`src/components/Onboarding.tsx:156,226`), spec said 10. Recommendation: 10 on both, change client and dashboard in the same release (S2). |
| D13 | Terms and privacy consent | Recommendation: an unchecked-by-default agreement line at sign-up and at first checkout, stored with a timestamp and terms version. Needs legal sign-off (4.7). |
| D14 | Order SLA numbers | X minutes for a cook to accept before auto-cancel and refund, Y hours for completion, customer cancel window length (S16). E to set. |
