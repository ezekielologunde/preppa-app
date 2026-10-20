---
project: Preppa
type: design
status: draft (Loop 0)
last_updated: 2026-10-20
---

# Web launch design: app.preppa.live as a public product

Goal: the web app serves real customers, real preppers and real money. Loop 0 is design only.
Companion: [SECURITY-SPEC.md](./SECURITY-SPEC.md). Findings were read from source; nothing was run
against production Supabase (`fwidhpzwldneeaphrxgg`) or Stripe live.

## 1. Current shape (what we are building on)

- Expo Router SPA, `app.json:37-41` (`web.output: "single"`, favicon only). Vercel builds
  `expo export -p web` to `dist/`, one catch-all rewrite to `/` (`vercel.json:1-6`), no headers.
- Client talks directly to Supabase (PostgREST + Realtime, `src/lib/messages.ts:208-241`) with the anon
  key and a user JWT held in localStorage (`src/lib/authStorage.web.ts:5`, `src/lib/supabase.ts:55`).
- Money is server-side only: Edge Functions hold `STRIPE_SECRET_KEY`; settlement is
  `stripe-webhook` (vendored sync engine) mirroring into `stripe.*`, then DB triggers
  (`reconcile_paid_pi`, `reconcile_invoice`, membership sync) write orders and the append-only ledger.
- Environment guard: `src/lib/supabase.ts:20-41` falls back to live values only when
  `EXPO_PUBLIC_APP_ENV=production` or hostname is `app.preppa.live`; non-production builds pointing at
  live throw. `process.env.VERCEL_ENV` at `:22` is not inlined by Expo, so it is dead code on web.

## 2. User flows on web

Legend: **[gap]** = blocks a public launch today, fixed in the loop named.

### Customer
1. Lands on a shared link (`/meal/[id]`, `/store/[cook]`, `/post/[id]`; share base `src/lib/share.ts:5`).
   - **[gap L2]** Link unfurls blank: no head tags, no OG, empty HTML body under `output: single`.
   - **[gap L2]** Full-screen onboarding covers every route for any browser without the local
     `onboarded` flag (`app/_layout.tsx:96`, `src/store/store.tsx:198,245`). No guest browse.
2. Target flow: browse home/discover/meal/store/feed as a guest. Auth is requested only at a gated
   action (add to cart, checkout, follow, message, book). Onboarding preferences (location, goals,
   cuisine) become optional, asked after sign-in or inline.
3. Sign in: email OTP or password (`src/lib/supabase.ts:103-139`). Google OAuth is dead code with no
   callers (`:413`); remove in L3.
4. Cart, then checkout: `create-order` re-prices server-side, adds 10% fee and Stripe Tax, uses an
   idempotency key; web card path via `@stripe/stripe-js` (`src/lib/payments.ts:34`).
5. Payment confirm (Stripe.js, 3DS in a Stripe iframe), then webhook to `stripe.payment_intents`, then
   trigger flips `orders.pay_status='paid'` and writes ledger rows.
6. Track order (`/order/[id]`, `/track`), message cook (`/messages`), review (`/review/[id]`).
7. Subscriptions (PrepPlus, plans) are web-only by design (`app/prepplus.tsx:74`,
   `app/plan/[id].tsx:141`, `app/build-plan.tsx:79`).
8. Experiences: book, pay, join via meeting link. **[gap L3]** meeting link scheme not restricted.
9. Account: addresses, saved cards, delete account. **[gap L2]** destructive confirms use
   `window.confirm` (`src/lib/confirm.ts:13`), suppressed in some in-app webviews.

### Prepper
1. Apply (`/apply`), admin approves (kitchen approval evidence migration is local-only, not deployed).
2. Stripe Connect Express onboarding: full-tab redirect, return to `/my-hub?connect=return|refresh`
   (`src/lib/connect.ts:42-53,170-174`). Return/refresh URLs pinned to `https://app.preppa.live`
   (`supabase/functions/connect-onboard/index.ts:31,59-61`). **[gap L1]** no test host can complete it.
   **[gap L2]** onboarding overlay can cover the return handler on a fresh browser.
3. Menu: create meals/plans/experiences with photo upload (seven duplicated `<input type=file>` paths,
   see web-surface findings). **[gap L2]** consolidate into `src/components/PhotoUploader.tsx`.
4. Post reels: web is the main posting surface (`app/hub/post-reel.tsx:47`) but recording uses
   `expo-camera` (`app/hub/record-video.tsx:4,17-60`), unverified on web. **[gap L2]** add file-upload
   fallback, verify Chrome/Safari/Firefox.
5. Fulfil orders (accept/decline with refund), Cook Pro (`app/hub/pro.tsx:82`).
6. Cash out: `connect-payout` (advisory lock, `payout_<id>` key, `finalize_payout`), weekly
   `auto-payouts`, 5-minute `reconcile-payouts`.

### Admin
1. Same SPA, `admin/*`, web-only. Client gate is cosmetic (`app/admin/_layout.tsx:19,36`); every admin
   RPC is gated by `is_admin()` server-side.
2. Approve kitchens, change roles, review anomalies, handle `public_support_requests`, payouts in
   `needs_review`. **[gap L3]** no MFA; one XSS or phished session is full admin.

## 3. Trust boundaries

```
 Browser (untrusted: customer, prepper, admin, attacker)
   |  HTTPS, static assets + index.html
   v
 Vercel edge (app.preppa.live)      [B1: headers/CSP, rewrites, optional OG middleware]
   |
   |  anon key + user JWT (Authorization header, no cookies)
   v
 Supabase PostgREST / Realtime      [B2: RLS + grants; SECURITY DEFINER RPCs with in-body checks]
 Supabase Edge Functions (user)     [B3: verify_jwt=true, zod input, server-side pricing, rate limits]
   |
   |  STRIPE_SECRET_KEY, service role (server only)
   v
 Stripe (live)                      [B4: secret key never in client; idempotency keys]
   |  signed webhook
   v
 stripe-webhook / stripe-worker     [B5: signature in DB, vault worker secret, verify_jwt=false]
   -> stripe.* mirror -> triggers -> orders, ledger_entries (append-only)
 Cron workers (pg_cron -> functions) [B6: vault secret; must never cross projects]
 Mux -> mux-webhook                  [B5: HMAC; replay window missing]
 Browser -> third parties            [B7: js.stripe.com, stream/image.mux.com, nominatim, bigdatacloud]
```

Rules that hold across every loop:
- Nothing trusted is decided in the client (prices, roles, admin, eligibility). Client gates are UX.
- A test environment never holds a production secret, and no artifact of one project (cron URL,
  vault value, media host) can reach the other.
- Money state changes only through Stripe-idempotent calls plus locked, service-role-only RPCs.

## 4. Environment topology

| | Production | Test (to create, L1) | Local |
|---|---|---|---|
| Web host | `app.preppa.live` (Vercel Production) | Vercel Preview, stable alias e.g. `staging.preppa.live` (decision D3) | `localhost:8081` |
| Supabase | `fwidhpzwldneeaphrxgg` | new project ref, same Postgres major | `supabase start` or test project |
| Stripe | live (`pk_live_`, `sk_live_`) | test mode (`pk_test_`, `sk_test_`), Connect + Tax enabled | test mode |
| Client env | fallbacks in `src/lib/supabase.ts:14-18` | Vercel Preview scope: `EXPO_PUBLIC_APP_ENV=preview`, test URL, anon key, `pk_test_` | `.env.development` |
| Auth Site URL / redirects | exactly `https://app.preppa.live` | exactly the test host | `http://localhost:8081` on test project only |
| Email | Resend `noreply@preppa.live` | separate sender or catch-all (D4) | Inbucket |
| Vault `stripe_sync_worker_secret` | prod value | new random value | local value |
| EAS (native) | `production` profile (`eas.json:28-37`) | `preview`/`development` via `eas env:create` | n/a |

Setup order for the test project is fixed by the money-and-env review (checklist steps 1-13); the
critical constraint is that `stripe-setup` must run before the trigger-creating migrations, or paid
orders never reconcile. L1 removes that constraint with a re-runnable trigger-install migration.

## 5. Loop plan

Owners: **B** = builder agent (code on a branch, never deploys), **R** = reviewer agents (red-team, then
sane-mode, fresh context), **E** = Ezekiel (dashboards, cost, production deploys, legal, recruiting).
Every loop ends with R passes and E's go-ahead before anything reaches production.

### Loop 1: Test environment and safe edge (no production impact)
| # | Task | Owner | Paths |
|---|---|---|---|
| 1.1 | Provision test Supabase project + Stripe test mode (Connect Express, Tax head office) | E | dashboards |
| 1.2 | Replace hardcoded prod URL/ref in cron and push migrations with a Vault-resolved base URL (new forward migration, do not edit applied ones) | B | `supabase/migrations/20260906100000_payout_reconciliation.sql:320`, `20260906110000_auto_payouts.sql:116`, `20260910060000_fix_remaining_worker_dispatch_collision.sql:37,55,73`, `20260925184000_reconcile_ambiguous_cycle_charges.sql:83`, `20260925185000_reconcile_ambiguous_booking_balances.sql:184`, `20260808024849_high_fix_notify_push_pass_kind.sql:16` |
| 1.3 | Media URL allowlist reads the project storage host from config, not a literal | B | `20260714065911_critical_fix_post_media_url_allowlist.sql:14-16` |
| 1.4 | Re-runnable `install_stripe_reconcile_triggers()` callable after `stripe-setup`, plus a check that fails loudly if `stripe.*` triggers are missing | B | `20260710195031:55-62`, `20260711060016:78-86`, `20260713234329:50-58`, `20260808025920:88-95` |
| 1.5 | Version `verify_jwt=false` set in `supabase/config.toml` `[functions.*]`; move `project_id` out of the committed default | B | `supabase/config.toml:1`, `supabase/functions/MANIFEST.md:34-48` |
| 1.6 | `connect-onboard` allowed origins from env (`APP_ORIGINS`), not a literal | B | `supabase/functions/connect-onboard/index.ts:31,59-61` |
| 1.7 | Edge Functions assert key mode: `sk_test_`/`rk_test_` unless `APP_ENV=production` | B | shared helper used by `requireEnv('STRIPE_SECRET_KEY')` callers |
| 1.8 | Remove dead `VERCEL_ENV` branch; extend `check-env-separation.mjs` to fail if Preview env is live | B | `src/lib/supabase.ts:22`, `scripts/check-env-separation.mjs` |
| 1.9 | Vercel: security headers in **Report-Only** CSP + enforced non-CSP headers, scoped rewrite, cache headers, secret scan in `buildCommand` | B | `vercel.json` (spec in SECURITY-SPEC 3) |
| 1.10 | Vercel Preview env vars, deploy branch to test host, run test-env smoke list | E then B | Vercel dashboard |

**Exit gate L1:** on the test host with Stripe test cards: OTP sign-up; prepper Connect onboarding to
`payouts_enabled`; paid order shows `pay_status='paid'` plus ledger `sale`/`tip`; double-tap gives one
PI and one order; decline refunds and reverses ledger; payout transfers and finalizes; subscription
cycle charges; `pg_trigger` lists the `stripe.*` triggers; `regressions.sql` green on the test
project; zero cron jobs on the test project reference `fwidhpzwldneeaphrxgg` (SQL check in
`cron.job`). CI green.

### Loop 2: Public web product (guest browse, sharing, web UX)
| # | Task | Owner | Paths |
|---|---|---|---|
| 2.1 | Guest browse: onboarding no longer blocks routes; auth prompt on gated actions; deep links and Connect return work on a fresh browser | B | `app/_layout.tsx:96`, `src/store/store.tsx:198,245`, `src/components/Onboarding.tsx`, `app/(tabs)/my-hub.tsx:382-437` |
| 2.2 | Verify anon can read exactly the public surfaces guest browse needs (public views only), on the test project | B, R | RLS, see SECURITY-SPEC 5 |
| 2.3 | Static head: title, description, theme-color, apple-touch-icon, manifest (192/512 icons), robots.txt, sitemap for public routes; drop `orientation: portrait` for web | B | `app.json:6,37-41`, `public/` or template per D1 |
| 2.4 | Per-entity OG for `/meal`, `/store`, `/post` (D1) | B | new edge middleware or route |
| 2.5 | Replace `window.confirm` with in-app dialog; audit remaining `Alert.alert` | B | `src/lib/confirm.ts:13` |
| 2.6 | Video post: file-upload fallback; lazy-load `expo-camera` | B | `app/hub/record-video.tsx`, `app/hub/post-reel.tsx:128` |
| 2.7 | One web picker in `PhotoUploader` (size cap, HEIC handling) used by all seven screens | B | `src/components/PhotoUploader.tsx:54` and callers |
| 2.8 | Desktop layout: docks constrained to content width; feed reel at 1280/1440/1920 | B | `src/ui/layout.tsx:21-27,55`, `src/components/FeedReel.tsx` |
| 2.9 | Keyboard: Escape closes sheets, focus trap/restore, visible focus ring; header roles; toast live region; image alt | B | `src/ui/overlay.tsx`, `src/ui/primitives.tsx:73`, sheets |
| 2.10 | Playwright on the test host: deep-link refresh, guest browse, sign-in, test-card checkout, 3DS, Connect return, admin redirect for non-admin | B | new `e2e/`, CI job |

**Exit gate L2:** Playwright suite green against the test host in CI; a shared meal link unfurls with
title/image in iMessage, WhatsApp, Slack (manual, screenshots); a private window opens `/meal/<id>`
directly to the meal; Lighthouse a11y >= 90 on home, meal, checkout; manual pass Chrome, Safari
(macOS + iOS), Firefox, Instagram in-app webview.

### Loop 3: Security and money hardening
Tasks are SECURITY-SPEC section 6, items S1-S14, in rank order. Owner B for code, E for dashboard
items (Auth settings, MFA enrolment). **Exit gate L3:** each DB/function fix has a regression in
`supabase/tests/regressions.sql` shown red without the fix and green with it; CSP switched to enforce
on the test host with zero violations across the Playwright suite; red-team pass reports no open High;
admin RPCs reject an aal1 session.

### Loop 4: Production cut-over and controlled real money
| # | Task | Owner |
|---|---|---|
| 4.1 | Diff live Edge Functions and RPC definitions against the repo; list every local-only change (Tasks.md:119-123,134,140,147,220-221,236) | B (read-only) |
| 4.2 | Deploy pending migrations and functions to production with correct `verify_jwt` | E approves, E or B runs |
| 4.3 | Enforce CSP on production after one week Report-Only clean | E |
| 4.4 | Two real accounts: A cannot read B's orders, messages, tickets, addresses | E + B |
| 4.5 | One real dollar: customer to Preppa to cook payout, then refund, cancel, failed card, sub-$20 payout, forced reconcile, duplicate-ledger check, fee math (Launch-Plan.md:137-149) | E |
| 4.6 | Branch protection: require `web-build-security` and the e2e job; deploys gated on CI | E |
| 4.7 | Non-code launch gates: legal review of help-center pages, launch geography, support operator, Cohort 0 cooks with real menus | E |
| 4.8 | Reconcile contradicting docs (Stripe mode, CI state, branch protection, kitchen counts, verdict banners) | B |

**Exit gate L4 (launch go/no-go):** 4.1 diff empty; 4.4 and 4.5 recorded with evidence; at least N
approved cooks with Stripe-ready payouts in the launch geography (N is D7); legal pages final;
`Launch-Plan.md` verdict line updated by E.

## 6. Open decisions

| ID | Decision | Recommendation |
|---|---|---|
| D1 | How to serve per-entity OG tags | Vercel Routing Middleware on `/meal/*`, `/store/*`, `/post/*` only: fetch the public view row with the anon key, inject `<meta>` into `index.html`, `s-maxage=300`. Keeps `output: single`. Rejected: `output: static` (data is dynamic), UA-sniffing prerender (cloaking risk). Check Expo v57 docs (AGENTS.md) for whether `+html.tsx` applies under `single` or a `public/index.html` template is needed. |
| D2 | Guest browse scope | Guests see home, discover, meal, store, post, feed; auth at cart add or any write. Needs product sign-off. |
| D3 | Test host name | `staging.preppa.live` as a Vercel Preview alias, Vercel deployment protection off only for that alias, `noindex` header. |
| D4 | Test email sender | Separate Resend domain or a catch-all; never the production sender key in the test project. |
| D5 | Transactional email for order/refund/payout | Build in L3 or defer; in-app/push only today (Launch-Plan.md:289). |
| D6 | Geocoding | Proxy through an Edge Function with caching or a paid provider before real traffic (Nominatim policy). |
| D7 | Minimum supply and geography for go-live | E to set N cooks and the launch city. |
| D8 | CSP report collection | Report-Only with browser console review on test host first; add a `csp-report` endpoint only if production Report-Only needs evidence. |
| D9 | Admin MFA mechanism | Supabase TOTP, `aal2` required inside `is_admin()`; confirm plan support. |
| D10 | Refund/dispute reconciliation | Trigger on `stripe.charges`/`stripe.disputes` mirror writing ledger reversals, or block payouts on disputed balances. Pick in L3 design. |
