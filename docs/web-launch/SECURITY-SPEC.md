---
project: Preppa
type: security-spec
status: draft (Loop 0, red-team corrections folded in)
last_updated: 2026-10-20
---

# Web launch security spec

Scope: `app.preppa.live` web client, Vercel edge, Supabase (DB, Auth, Edge Functions), Stripe, Mux.
Static review only; nothing was run against production. Companion: [DESIGN.md](./DESIGN.md).
Red-team: [RED-TEAM-LOOP0.md](./RED-TEAM-LOOP0.md).

## 1. Assets

1. Money: Stripe live balance, cook ledger balances (`ledger_entries`), payouts, the production Stripe
   webhook endpoint (losing it stops all settlement).
2. Admin capability: kitchen approval, role changes, payout review, refunds.
3. Customer PII: addresses, coordinates, messages, order history, saved cards (Stripe-held).
4. Brand sender `alerts@`/`noreply@preppa.live` (Resend) and admin attention.
5. Secrets: `STRIPE_SECRET_KEY`, service role key, vault `stripe_sync_worker_secret`, Mux secrets.

## 2. Threat model (ranked by likelihood x impact)

| # | Threat | Vector | Current control | Gap |
|---|---|---|---|---|
| T1 | Account takeover, including admin | XSS reads localStorage session (`src/lib/authStorage.web.ts:5`); planned OG middleware writes prepper text into `index.html` (DESIGN 2.4) | React escaping | No CSP, no admin MFA, OG output not yet specified as escaped |
| T2 | Pre-account hijack | Attacker signs up victim email with a password before victim (`src/lib/supabase.ts:133-139`); victim later confirms the address through OTP sign-in (`shouldCreateUser: true`), possibly leaving the attacker's password valid | Unknown: depends on dashboard "Confirm email" | Unverified, unversioned, untested |
| T3 | Clickjacking checkout, payout, admin | Frame app.preppa.live | none | No `frame-ancestors` (`vercel.json`) |
| T4 | Malicious prepper link to customer | `javascript:`/`data:` meeting URL (`supabase/functions/experience-upsert/index.ts:42`, opened at `app/(tabs)/orders.tsx:128`) | zod `.url()` | Any scheme accepted |
| T5 | Admin mail-bomb, brand-sender abuse | Anonymous insert into `public_support_requests` fires `notify_admins` | Length caps on 4 columns | No rate limit; client-set `ref`, `status`, `immediate_risk` |
| T6 | Cook keeps credit for refunded/disputed charge | Dashboard refund or chargeback not reconciled to ledger; payout already sent | Admin anomaly counters | No reversal path, no hold (S7, S15) |
| T7 | Silent money breakage | Deprecated `request.jwt.claim.role` is not set by current PostgREST, so service-role branches fail closed. Real impact: `reserve_balance_charge` and `finalize_balance_charge` (`20260925185000:37,80`, pending deploy) would ship broken for `complete-booking` and `reconcile-booking-balances`. `reconcile_invoice` also fails and its error is swallowed (`20260711060016:67-72`), but legacy Stripe-subscription plans are retired (`create-subscription` returns 410), so remaining invoices (PrepPlus, Cook Pro) never needed orders. `reconcile_paid_pi` swallows every error (`20260808030007:173`) | Fail closed | No alert on a succeeded PI with an unpaid order (DESIGN 1.12) |
| T8 | Cross-environment leakage | Test project cron/push calls production URLs (DESIGN 1.2); prod key pasted in test; two environments sharing one Stripe account, where `stripe-setup` deletes the other environment's managed webhook (`stripe-setup/index.ts:46245-46262`) | Client guard only (`src/lib/supabase.ts:30-41`) | No server key-mode or account check; vendored functions bypass `requireEnv` |
| T9 | Webhook replay | Captured Mux payload replayed; non-constant-time compare (`supabase/functions/mux-webhook/index.ts:54`) | HMAC | No timestamp window |
| T10 | Stolen token used from any origin | `Access-Control-Allow-Origin: *` (`supabase/functions/create-order/index.ts:13`, `connect-payout/_shared/cors.ts:2`) | Bearer auth, no cookies | Low; defence in depth |
| T11 | Data enumeration by anon | `kitchens` base table readable incl. `owner_id`; membership oracles; reviews of unpublished experiences | RLS | Over-broad anon grants |
| T12 | Secret in shipped bundle | Bad commit deployed by Vercel without scan | CI scan after build | Scan not in Vercel build, narrow patterns |
| T13 | Payout fraud with stolen cards | Colluding cook plus buyer account, stolen card, tip up to $1,000 (`create-order/index.ts:22,36`), immediate cash-out | none | No hold, no clawback, no new-kitchen caps (S15) |
| T14 | Card testing and multi-account abuse | Unlimited OTP sign-up without CAPTCHA, checkout as a card-testing oracle | Stripe defaults | No CAPTCHA, no Radar rules (S2) |
| T15 | Agent tooling writes production | Supabase MCP in the builder's environment can apply migrations and deploy functions org-wide | Convention ("read-only") | Not a control until scoped (DESIGN 1.13) |

## 3. Required edge config (`vercel.json`)

Ship L1 with CSP as `Content-Security-Policy-Report-Only`; switch to enforcing in L3 (test host) and
L4 (production). The OG middleware (DESIGN 2.4) deploys to production only after enforcement there
(DESIGN 4.3). Replace the project ref per environment.

```json
{
  "buildCommand": "node scripts/check-vercel-env.mjs && expo export -p web && node scripts/scan-build-secrets.mjs",
  "outputDirectory": "dist",
  "framework": null,
  "rewrites": [
    { "source": "/((?!_expo/|assets/|.*\\.[a-zA-Z0-9]+$).*)", "destination": "/" }
  ],
  "headers": [
    { "source": "/(.*)", "headers": [
      { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains" },
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "X-Frame-Options", "value": "DENY" },
      { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
      { "key": "Cross-Origin-Opener-Policy", "value": "same-origin-allow-popups" },
      { "key": "Permissions-Policy", "value": "camera=(self), microphone=(self), geolocation=(self), payment=(self \"https://js.stripe.com\"), usb=(), browsing-topics=()" },
      { "key": "Content-Security-Policy-Report-Only", "value": "<CSP below>" }
    ]},
    { "source": "/_expo/static/(.*)", "headers": [
      { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" } ]},
    { "source": "/", "headers": [ { "key": "Cache-Control", "value": "no-cache" } ]}
  ]
}
```

CSP (one line in the header; split here for reading):

```
default-src 'self';
script-src 'self' https://js.stripe.com https://*.js.stripe.com;
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://<ref>.supabase.co https://image.mux.com https://*.stripe.com;
media-src 'self' blob: https://<ref>.supabase.co https://stream.mux.com https://*.mux.com;
connect-src 'self' https://<ref>.supabase.co wss://<ref>.supabase.co https://api.stripe.com
            https://stream.mux.com https://*.mux.com https://nominatim.openstreetmap.org
            https://api.bigdatacloud.net;
frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com;
worker-src 'self' blob:;
font-src 'self' data:;
object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';
upgrade-insecure-requests
```

Notes:
- `style-src 'unsafe-inline'` is required by react-native-web injected styles. No `'unsafe-inline'`
  or `'unsafe-eval'` in `script-src`; if the Expo `single` template emits an inline script, use its
  sha256 hash, found in Report-Only. The OG middleware must never add an inline script.
- Hosts come from a grep of `app/` and `src/` (Supabase, Mux, geocoders, Stripe.js). Drop the geocoders
  once D6 proxies them. Add the CAPTCHA host if S2 adds one.
- HSTS `preload` needs the apex `preppa.live` to send HSTS with `includeSubDomains`; that covers
  `help.preppa.live` too, so it is a separate decision.
- Test host additionally sends `X-Robots-Tag: noindex`.
- The rewrite exclusion makes missing assets 404. Unknown app routes still return 200 under
  `output: single`; acceptable until D1 middleware can return 404 for unknown entity ids.
- Confirm production does not ship `.map` files (`dist/` check in the scan).

## 4. Auth and redirect config (Supabase dashboard, per project; record values in repo)

| Setting | Production | Test |
|---|---|---|
| Site URL | `https://app.preppa.live` | test host |
| Redirect allowlist | exactly `https://app.preppa.live` and `https://app.preppa.live/**` only; no wildcard hosts | exactly the test host (+ `http://localhost:8081`) |
| Confirm email | **ON**. Expected to close T2, proven only by the S2 hijack test. Before flipping it on production, E lists existing unconfirmed production users and decides how to handle them | ON |
| Password | min length 10 (D12: client raised from 8 in the same release), leaked-password protection on if the plan supports it | same |
| OTP | 6-digit `{{ .Token }}` template, expiry 600 s, per-hour send limit set | same |
| Sign-up / OTP abuse | CAPTCHA (Turnstile or hCaptcha) on sign-up and OTP send | optional |
| OAuth providers | all off; remove `signInWithGoogle` (`src/lib/supabase.ts:413-417`, no callers) | all off |
| `detectSessionInUrl` | stays `false` (`src/lib/supabase.ts:55`) | same |
| SMTP | Resend production sender | separate sender (D4) |
| MFA | TOTP enabled; required for admin (S3) | same |

Add an `[auth]` block to `supabase/config.toml` mirroring the non-secret values so drift is reviewable,
and a `docs/web-launch/auth-settings.md` checklist E signs per environment.

## 5. RLS expectations

General: every table RLS-on (true today); every SECURITY DEFINER function pins `search_path` and
either checks the caller in-body or is revoked from `anon`/`authenticated`. Count: the repo's
migrations define about 166 unique SECURITY DEFINER function names (the earlier figure of 306 is not
supported by the repo; 4.1 re-counts from live `pg_proc`).

| Data | anon | authenticated | service role only |
|---|---|---|---|
| Public kitchens, meals, posts, published experiences | base `kitchens` is read through the meals embed (`src/data/supabaseRepository.ts:22`), so anon gets an explicit column grant list without `owner_id` (S12); other public data via views | `kitchens` read today includes `owner_id` (`src/lib/connect.ts:24`, `src/lib/supabase.ts:524` filter on it); keep it for authenticated or move owner lookups to an RPC (S12) | writes via RPC |
| Orders, payments, ledger | none | own rows (customer) or own kitchen (cook) | ledger insert, status transitions |
| Messages, threads, attachments | none | thread members only; attachments private bucket | |
| Addresses, coordinates | none | owner; cook sees delivery address only for an active order via guarded RPC | |
| `experience_private.meeting_url` | none | booked customers via RPC | |
| `public_support_requests`, `waitlist` | insert only through a rate-limited Edge Function (S5) | same | read: admins via `is_admin()` |
| Membership checks (`is_prepplus_member`, `is_cook_pro_member`) | revoke | self only | any |
| Admin RPCs and admin RLS policies | none | `is_admin()` AND `aal2` | |

Acceptance (L2/L4): a scripted anon probe against the test project lists every table, column and RPC
reachable by `anon`; two-account test proves A cannot read B's orders, messages, tickets, addresses.

## 6. Ranked fixes

Owner is B for code and E for dashboard settings unless stated. Every row's exit gate is a
red-then-green regression unless the row names another.

| Rank | ID | Fix | Paths | Loop | Exit gate |
|---|---|---|---|---|---|
| 1 | S1 | Security headers + CSP (Report-Only, then enforce). Enforced `script-src` on production is a precondition for the OG middleware (DESIGN 2.4, 4.3) | `vercel.json` | L1 / L3 / L4 | zero violations across Playwright on the test host |
| 2 | S2 | Auth dashboard settings in section 4. Add the T2 hijack sequence as an explicit test on the test project: attacker password sign-up for victim email, victim OTP sign-in, then attacker password sign-in must fail. Align client password minimum (D12). CAPTCHA on sign-up and OTP; Radar rules for card testing (T14) | Supabase dashboard, `supabase/config.toml`, `src/components/Onboarding.tsx:156,226`, new `tests/auth-hijack.md` script run by E | L1 (test), L3 (prod) | hijack test recorded as failing for the attacker |
| 3 | S3 | Admin MFA: `aal2` check in `is_admin()`. First grep migrations for direct `role = 'admin'` access checks and route each through `is_admin()` (known: RLS policy `20260714193000_public_support_requests.sql:58`); notification fan-out loops such as `20260925031000_notify_order_support_participants.sql:11,46` select recipients and are not access checks. Client prompts enrolment | new migration; `app/admin/_layout.tsx:36` | L3 | one aal1 regression per admin read path |
| 4 | S4 | Meeting URL: `^https://` in zod and a DB CHECK; client re-checks scheme before open | `supabase/functions/experience-upsert/index.ts:42,128`; new migration on `experience_private.meeting_url` (`20260713224602_experiences_e4_private_meeting_url.sql:6`); `app/(tabs)/orders.tsx:125-128` | L3 | regression |
| 5 | S5 | Public intake through a new Edge Function with a new IP-hash limiter (the existing `check_rate_limit` keys on a uuid subject and rejects explicit subjects from non-service callers, `20260725175502_critical_fix_rate_limit_service_role_detection.sql:26-45`, so it cannot key on IP), plus CAPTCHA; caps on every column; `ref`, `status` and `immediate_risk` set server-side only (today `ref` is client-settable and unique, `20260714193000_public_support_requests.sql:9,27-35`, so an attacker can pre-insert future refs); revoke direct anon insert; `immediate_risk` routes to triage; dedupe/throttle in `notify_admins` | `20260714193000_public_support_requests.sql:9,27-53`, `20260912010000_alert_and_admin_view_for_public_support_requests.sql`, `20260908010000_admin_alerts_via_resend_email.sql:26-40`, `20260710193742_waitlist_table.sql:18-20`, new `supabase/functions/public-intake/` | L3 | regression: anon direct insert denied, client `ref` ignored |
| 6 | S6 | Replace `current_setting('request.jwt.claim.role')` with the pattern from `20260808040519_critical_fix_guard_triggers_no_jwt_context.sql:1-15`: reject only when `auth.role() is not null and auth.role() <> 'service_role'`. Plain `auth.role() = 'service_role'` is wrong for trigger callers: `reconcile_invoice` runs from a trigger on `stripe.invoices` fired over the sync engine's raw `SUPABASE_DB_URL` connection, where `auth.role()` is NULL. Where a function is already granted only to `service_role`, dropping the body check and relying on the grant is acceptable. Stop swallowing `reconcile_invoice` errors (raise to `notify_admins`). Functions whose latest repo definition uses the deprecated GUC: `reconcile_invoice` (`20260714104442:30`), `reserve_balance_charge` and `finalize_balance_charge` (`20260925185000:37,80`), `admin_set_user_role` and `admin_suspend_kitchen` (`20260907190000:29,34,82,91`), `admin_reinstate_kitchen` (`20260715220353:153,158`), `advance_order_status` and `decline_order` (`20260714091947:27,59`), `kitchen_earnings_summary` (`20260705122352_0007_prepper_ops.sql:38`). B confirms the list with a live `pg_proc` scan (`prosrc like '%request.jwt.claim.role%'`) before writing the migration | the files listed, one new forward migration | L3, but `reserve_balance_charge`/`finalize_balance_charge` must be fixed before they first deploy (DESIGN 4.2) | one regression per function covering three contexts: service-role PostgREST call, raw-connection trigger call (`set local role postgres`, no claims), authenticated non-owner call; the live `pg_proc` scan returns zero rows |
| 7 | S7 | Refund and dispute reconciliation to ledger from the `stripe.charges`/`stripe.disputes` mirror; design in DESIGN 2.11 | new migration on `stripe.*` mirror | L3 | dashboard refund on the test project writes one reversal row |
| 8 | S8 | Cross-environment isolation: per-environment Stripe Sandboxes; key-mode and account guard in the three vendored wrappers (DESIGN 1.1g) and in `requireEnv` callers (1.7); Vault base URL for cron/push with a loud failure when absent (1.2); configurable media host (1.3); managed-webhook health alert (1.11) | DESIGN tasks 1.1, 1.1g, 1.2, 1.3, 1.7, 1.11 | L1 | L1 ordered checklist steps 5-7 evidence; guard test red without 1.1g |
| 9 | S9 | Secret scan in Vercel build; add `whsec_`, Resend (`re_`), Mux patterns; decode every `eyJ` JWT in `dist` and require `role=anon`; fail on `.map`. Build-time env check `scripts/check-vercel-env.mjs` (DESIGN 1.8) | `scripts/scan-build-secrets.mjs:7-12`, `vercel.json` | L1 | a Preview build with `pk_live_` fails |
| 10 | S10 | Mux webhook: reject `|now - t| > 300 s`, constant-time compare; `stripe-webhook` returns a generic error | `supabase/functions/mux-webhook/index.ts:51-54`, `supabase/functions/stripe-webhook/index.ts:47118-47121` | L3 | regression |
| 11 | S11 | Shared CORS helper: echo allowed origin only, `Vary: Origin`; allowlist from env | `supabase/functions/*/index.ts`, `supabase/functions/connect-payout/_shared/cors.ts:2-4` | L3 | regression |
| 12 | S12 | Tighten anon. A column revoke does nothing while anon keeps the default table-level SELECT, so: revoke table SELECT on `kitchens` from anon and grant an explicit column list without `owner_id`; keep `owner_id` for authenticated or move owner lookups (`src/lib/connect.ts:24`, `src/lib/supabase.ts:524`) to an RPC; gate `experience_reviews` on published; revoke membership oracles from anon. Run through the DESIGN 2.2 anon probe | `20260705122314_0004_rls.sql:30`, `20260817063118_perf_merge_stacked_permissive_select_policies.sql:47-51`, `20260713222504_experiences_e4_review_display.sql:11-25`, `20260713234223_prepplus_p1_memberships.sql` | L3 | anon probe shows no `owner_id`; guest browse Playwright still green |
| 13 | S13 | Remove `signInWithGoogle` dead code | `src/lib/supabase.ts:411-417` | L3 | typecheck |
| 14 | S14 | Geocoding through a caching Edge Function; list processors in privacy policy | `src/lib/geo.ts` | L3 (D6) | |
| 15 | S15 | Payout hold and clawback, built to the approved DESIGN 2.11 design: withdrawable balance excludes held credit; transfer reversal or future-payout offset on refund and dispute; tip and payout caps for new kitchens | `20260906100000_payout_reconciliation.sql:51-95` (new forward migration), `20260808030007_high_wire_cook_pro_fee_discount.sql:30-42`, `supabase/functions/connect-payout/index.ts:92-97`, `supabase/functions/auto-payouts/index.ts:37`, `supabase/functions/create-order/index.ts:22,36` | L3 | early cash-out refused on the test project; refund after payout produces reversal or offset; L4 4.5 repeats it with real money |
| 16 | S16 | Refund paths for one-off orders: (a) server-side admin refund Edge Function calling Stripe refund then `finalize_order_cancel` reversal, `is_admin()` and aal2 only; (b) pg_cron auto-cancel-and-refund for paid orders not accepted within X minutes or not completed by Y (D14); (c) a customer cancel window before the cook accepts | new `supabase/functions/admin-refund-order/`, new cron migration, `supabase/functions/decline-order/index.ts:27` (shared refund logic), `src/lib/orders.ts:106` | L3 | each path refunds on Stripe and writes one ledger reversal; L4 4.5 records an admin refund and an auto-cancel |
| 17 | S17 | Stripe Tax commit: `tax.transactions.createFromCalculation` from the payment reconcile path using `orders.tax_calculation_id`; tax reversal on refund; tax for recurring and booking flows per D11 | `supabase/functions/create-order/index.ts:46-54,287`, `subscribe-plan`, `subscribe-box`, `charge-due-cycles`, `book-experience`, `accept-quote-and-deposit` | L3 (decision D11 before L4) | a test order appears in Stripe Tax transactions; a refund reverses it |
| 18 | S18 | Connect account state: handle `account.updated` (trigger on the `stripe.accounts` mirror, or a cron sync) to refresh `charges_enabled`/`payouts_enabled`, which today only `connect-status` writes (`supabase/functions/connect-status/index.ts:60`); checkout and `reserve_payout` then refuse a restricted account | new migration; `create-order/index.ts:140-145`, `20260906100000_payout_reconciliation.sql:75-79` | L3 | restricting a test Connect account flips `payouts_enabled` without the cook opening the app |

Process gates for every fix: red-then-green regression (SQL in `supabase/tests/regressions.sql`, TS
in `tests/`), red-team pass, then sane-mode pass, then E approves any production deploy. No fix is
"done" until 4.1's live-vs-repo diff shows it deployed.
