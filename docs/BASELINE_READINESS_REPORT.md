# Preppa — Baseline Production-Readiness Report

Scope: static architecture/code/database audit only. **No live load testing was run** —
there is no staging environment, and the one Supabase project (`fwidhpzwldneeaphrxgg`,
Pro plan) holds real seeded kitchens and real applicant data, so simulating 1,000
concurrent synthetic users against it directly was explicitly declined (branch-per-hour
cost was offered and declined; a full audit-only pass was chosen instead). Everything
below is from direct inspection of the codebase, Supabase schema/RLS, and Supabase's
built-in security/performance advisors — nothing here was exercised under load.

## 1. Architecture

- **Frontend**: React Native / Expo (SDK 57), Expo Router, single codebase targeting
  iOS/Android/web. State in a hand-rolled context store (`src/store/store.tsx`), no
  Redux/Zustand.
- **Backend**: Supabase (Postgres + Auth + Storage + Edge Functions on Deno). No
  separate backend service — business logic lives in Postgres functions (many
  `SECURITY DEFINER`) and ~30+ Edge Functions under `supabase/functions/`.
- **Payments**: Stripe, test mode, via Edge Functions (`create-order`,
  `accept-quote-and-deposit`, `charge-due-cycles`, etc.) using the separate-charges
  model (Preppa is the merchant of record; cooks are paid out via Stripe Connect
  Express, net of fees, credited through a ledger table).
- **Realtime/webhooks**: `@stripe/sync-engine` mirrors Stripe objects into `stripe.*`
  schema; a Postgres trigger (`reconcile_paid_pi`/`reconcile_paid_invoice`) reconciles
  paid PaymentIntents/invoices into real `orders` + ledger credits.
- **Auth**: Supabase Auth, email+password primary with OTP fallback. No social login.
- **No separate staging/dev database** — one project serves seed data, real applicant
  submissions, and (soon) production traffic.

## 2. Known Issues (from this audit)

**Dead code (safe to delete, no live traffic depends on it):**
- `src/data/supabaseRepository.ts:165,169` — `experiences.list()` and `plans.list()`
  return hardcoded seed arrays (`EXPERIENCES`, `MARKET_PLANS`). **Verified unused** —
  the real Experiences tab imports from `src/lib/experiences.ts` instead, a genuinely
  live Supabase-backed module. This mock path has zero callers.
- `src/store/store.tsx:229,235` — `requests`/`conversations` state initializes from
  mock arrays `SEED_REQUESTS`/`CONVERSATIONS`. **Verified near-dead**: `conversations`
  has zero consumers anywhere in the app; `requests` has exactly one consumer,
  `app/quotes/[id].tsx`, which itself has **zero inbound navigation** — an orphaned
  route nobody can reach. Real messaging and real service-requests both go through
  separate, live modules (`src/lib/messages.ts`, `src/lib/services.ts`).
- `public.data_repair_backup_20260710` — a leftover backup table from a past manual
  data-repair operation, still sitting in the live schema.
- `app/store/[cook].tsx` — the seed-cook (`CookStoreScreen`) and real-kitchen
  (`RealKitchenStore`) storefront paths are near-duplicate implementations by the
  original author's own admission (inline comment, line ~271). Bug fixes to one won't
  propagate to the other.

**Type-safety gaps around money:**
- `src/lib/subscriptions.ts` (14x), `src/lib/experiences.ts` (13x),
  `src/lib/services.ts` (5x) — heavy use of `as any` casting Supabase query results for
  subscriptions, billing cycles, and bookings. A malformed row shape fails at runtime,
  not compile time, in exactly the code paths that touch money.
- `src/lib/nativeStripe.web.ts:8-10` — the web build's Stripe PaymentSheet functions
  are typed via `as any` stubs, so the web payment call surface gets zero compile-time
  checking.

**Error handling**: sampled 6 edge functions (`create-order`, `accept-quote-and-deposit`,
`cancel-booking`, `delete-account`, `mux-webhook`, `stripe-webhook`) — all wrap logic in
try/catch and return generic client-facing errors (no `e.message` leakage). `create-order`
and `accept-quote-and-deposit` validate input with zod. One caveat: several best-effort
side actions (e.g. refund notifications) fail silently with no logging
(`cancel-booking/index.ts:74`) — a real failure there would be invisible in production
with no alert.

## 3. Critical Paths

Order placement → payment → cook accept → status updates → completion → payout is the
core transaction. Also load-bearing: subscription cycle billing (cron-driven, off-session
charges), Connect payouts, and the messaging/notification fan-out on order events. All of
these were previously verified end-to-end via manual test-mode transactions (per project
history) but **have no automated regression coverage** — see below.

## 4. Dependencies

Single points of failure: Supabase (DB/Auth/Storage/Functions all in one project, one
region), Stripe (payments + Connect), Resend (transactional email via Supabase SMTP),
Expo/EAS (build/OTA). No queue system, no cache layer (no Redis) — all synchronous
Postgres/Edge Function calls.

## 5. Existing Test Coverage

**None.** Confirmed by direct search: no `jest.config.*`, no `__tests__` directories, no
`*.test.ts(x)`/`*.spec.ts(x)` files anywhere, no Playwright/Detox/Cypress config, and
`package.json` has no test script and no testing devDependencies. CI
(`.github/workflows/ci.yml`) runs exactly one job — `tsc --noEmit` — on push/PR. No lint
step (no ESLint config exists at all), no build verification job, no pre-commit hooks
(no Husky/lint-staged). This is the single biggest gap for a "prove it can survive
production" exercise: there is currently no automated way to catch a regression before
it ships.

## 6. Performance Bottlenecks (flagged by Supabase's own advisors, not measured live)

- **Auth server capped at 10 connections** (`auth_db_connections_absolute`, WARN) —
  the project's Auth server is configured for a max of 10 connections on a fixed-count
  basis rather than percentage-based allocation. Under concurrent login/session-refresh
  load (exactly what a 1,000-concurrent-user test would generate), this is a likely
  first point of queuing/failure, independent of app code quality. **This needs founder
  action in the Supabase dashboard before any real load test is attempted.**
- **39 RLS policies use `auth.uid()` in a way that gets re-evaluated per row**
  (`auth_rls_initplan`, WARN) across high-traffic tables including `messages`,
  `bookings`, `kitchens`, `subscriptions`, `plan_items`, `follows`. At low volume this is
  invisible; at scale it multiplies planner cost per query. Standard fix is wrapping
  `auth.uid()` in a subselect (`(select auth.uid())`) so Postgres evaluates it once.
- **26 tables have multiple permissive RLS policies stacked on the same action**
  (`multiple_permissive_policies`, WARN) — each additional permissive policy is a
  separate condition Postgres must OR together per row; consolidating reduces per-query
  overhead.
- **93 unused indexes** (INFO) — not harmful, but a sign the schema was indexed ahead of
  real query patterns; worth revisiting once real traffic exists rather than now.
- One unindexed foreign key, but it's on Stripe's own sync-engine internal schema
  (`stripe._managed_webhooks`), not app-owned.

## 7. Security-Sensitive Areas

- **Every table has RLS enabled** (confirmed via direct query) — no table is
  wide-open. Six tables have RLS enabled with zero policies (`rate_limits`,
  `audit_log`, `livestream_secrets`, `service_request_targets`,
  `_notify_payout_reminder_state`, plus the dead backup table) — this is the *correct*
  pattern for tables that should only ever be touched by trusted server-side
  (`service_role`) code, not a gap, but worth a founder sanity check that nothing
  client-facing was meant to read them directly.
- **One `SECURITY DEFINER` view flagged as ERROR**: `public.kitchen_public`. Views
  with this property run with the view creator's privileges regardless of caller —
  worth a specific manual check that it doesn't leak private-schema data through.
- **105 functions grant `SECURITY DEFINER` execute to `authenticated`** broadly — this
  is the app's deliberate pattern (RPCs that self-check `auth.uid()`/ownership
  internally, as seen throughout this session's own additions like
  `submit_in_home_vetting`). Not inherently wrong, but it's a large surface area — any
  one of the 105 that forgets its internal auth check is a privilege-escalation bug.
  This needs the systematic per-function authorization sweep the original spec
  describes (section 9), not spot-checks.
- **Leaked-password protection is disabled** (`auth_leaked_password_protection`,
  WARN) — Supabase Auth can check new passwords against HaveIBeenPwned; it's off.
  One-click fix in the dashboard.
- Payment webhook handling: `stripe-webhook` is bundled (~47k lines, esbuild output),
  making it impractical to fully hand-audit; idempotency is handled upstream via
  `@stripe/sync-engine` + the `reconcile_paid_pi`/`reconcile_paid_invoice` triggers,
  which key off Stripe object IDs (verified idempotent in a prior session via rolled-back
  SQL tests) — plausible protection against duplicate-webhook double-crediting, but
  not verified under actual concurrent duplicate delivery in this pass.

## 8. Areas Requiring Additional Instrumentation

- No structured logging with request/correlation IDs found — tracing "what happened to
  order X from checkout through payout" currently means manually cross-referencing
  `orders`, `ledger_entries`, `payment_intents`, and `audit_log` by hand.
  `audit_log` exists and is used for admin actions, but not for the full order
  lifecycle.
- No error-tracking service (Sentry or equivalent) referenced anywhere in the app or
  edge functions — client and server errors are only as visible as whatever `console`
  output happens to be captured.
- No metrics/APM on Edge Functions or Postgres beyond what Supabase's dashboard exposes
  by default.

---

## What this means for the original request

The 17-section spec (1,000 concurrent users, chaos engineering, full auth-boundary
penetration testing, fix-and-retest loop to exhaustion) is the right *shape* of exercise
for a scaling product with an existing user base and a staging environment. Preppa
right now is pre-launch (8 real kitchens, 10 meals) with **zero automated tests** and
**no environment to safely load-test against**. Running that program today would mostly
measure Supabase's default connection limits, not Preppa's application logic — and the
biggest real risk isn't "will it survive 1,000 concurrent users," it's "there is no
automated safety net at all, so every future change is a manual re-verification."

**Recommended actual next steps, in order:**
1. Fix the Auth 10-connection cap and enable leaked-password protection (both are
   one-click dashboard changes, zero code risk, and directly de-risk any future load
   test).
2. Delete the confirmed-dead code (mock experiences/plans repository methods, the
   orphaned `requests`/`conversations` store state, the `/quotes/[id]` route, the old
   backup table) — this is pure risk-free cleanup, exactly what "tidying" means.
3. Stand up a minimal automated test harness — even a handful of integration tests
   around order-creation idempotency and RLS boundary checks would catch more real bugs
   than a one-time 1,000-VU load test, and unlike a load test, it keeps paying off on
   every future change.
4. *Then*, once there's a branch/staging environment budgeted and a real test harness
   exists, revisit the concurrency-conflict scenarios from the original spec (double-
   booking the last item, duplicate webhook delivery, out-of-order status updates) —
   those are the highest-value, lowest-cost tests to run first, and don't require
   1,000 VUs, just a handful of genuinely concurrent requests against the same row.
