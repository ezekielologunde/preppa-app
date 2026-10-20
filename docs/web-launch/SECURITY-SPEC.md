---
project: Preppa
type: security-spec
status: draft (Loop 0)
last_updated: 2026-10-20
---

# Web launch security spec

Scope: `app.preppa.live` web client, Vercel edge, Supabase (DB, Auth, Edge Functions), Stripe, Mux.
Static review only; nothing was run against production. Companion: [DESIGN.md](./DESIGN.md).

## 1. Assets

1. Money: Stripe live balance, cook ledger balances (`ledger_entries`), payouts.
2. Admin capability: kitchen approval, role changes, payout review.
3. Customer PII: addresses, coordinates, messages, order history, saved cards (Stripe-held).
4. Brand sender `alerts@`/`noreply@preppa.live` (Resend) and admin attention.
5. Secrets: `STRIPE_SECRET_KEY`, service role key, vault `stripe_sync_worker_secret`, Mux secrets.

## 2. Threat model (ranked by likelihood x impact)

| # | Threat | Vector | Current control | Gap |
|---|---|---|---|---|
| T1 | Account takeover, including admin | XSS reads localStorage session (`src/lib/authStorage.web.ts:5`) | React escaping | No CSP, no admin MFA |
| T2 | Pre-account hijack | Attacker signs up victim email with a password before victim (`src/lib/supabase.ts:133-139`) | Unknown: depends on dashboard "Confirm email" | Unverified, unversioned |
| T3 | Clickjacking checkout, payout, admin | Frame app.preppa.live | none | No `frame-ancestors` (`vercel.json`) |
| T4 | Malicious prepper link to customer | `javascript:`/`data:` meeting URL (`supabase/functions/experience-upsert/index.ts:42`, opened at `app/(tabs)/orders.tsx:128`) | zod `.url()` | Any scheme accepted |
| T5 | Admin mail-bomb, brand-sender abuse | Anonymous insert into `public_support_requests` fires `notify_admins` | Length caps on 4 columns | No rate limit, client-set `ref` in alert title |
| T6 | Cook keeps credit for refunded/disputed charge | Dashboard refund or chargeback not reconciled to ledger | Admin anomaly counters | No reversal path |
| T7 | Silent money breakage | `request.jwt.claim.role` not set by current PostgREST, service-role branches fail closed; `reconcile_invoice` error swallowed (`20260711060016:67-72`) | Fail closed | Paid invoices may never create orders |
| T8 | Cross-environment leakage | Test project cron/push calls production URLs (migrations listed in DESIGN 1.2); prod key pasted in test | Client guard only (`src/lib/supabase.ts:30-41`) | No server key-mode check |
| T9 | Webhook replay | Captured Mux payload replayed; non-constant-time compare (`supabase/functions/mux-webhook/index.ts:54`) | HMAC | No timestamp window |
| T10 | Stolen token used from any origin | `Access-Control-Allow-Origin: *` (`supabase/functions/create-order/index.ts:13`, `connect-payout/_shared/cors.ts:2`) | Bearer auth, no cookies | Low; defence in depth |
| T11 | Data enumeration by anon | `kitchens` base table readable incl. `owner_id`; membership oracles; reviews of unpublished experiences | RLS | Over-broad anon grants |
| T12 | Secret in shipped bundle | Bad commit deployed by Vercel without scan | CI scan after build | Scan not in Vercel build, narrow patterns |

## 3. Required edge config (`vercel.json`)

Ship L1 with CSP as `Content-Security-Policy-Report-Only`; switch to enforcing in L3 (test host) and
L4 (production). Replace the project ref per environment.

```json
{
  "buildCommand": "expo export -p web && node scripts/scan-build-secrets.mjs",
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
  sha256 hash, found in Report-Only.
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
| Confirm email | **ON** (closes T2) | ON |
| Password | min length 10, leaked-password protection on if the plan supports it | same |
| OTP | 6-digit `{{ .Token }}` template, expiry 600 s, per-hour send limit set | same |
| Sign-up / OTP abuse | CAPTCHA (Turnstile or hCaptcha) on sign-up and OTP send | optional |
| OAuth providers | all off; remove `signInWithGoogle` (`src/lib/supabase.ts:413-417`, no callers) | all off |
| `detectSessionInUrl` | stays `false` (`src/lib/supabase.ts:55`) | same |
| SMTP | Resend production sender | separate sender (D4) |
| MFA | TOTP enabled; required for admin (S3) | same |

Add an `[auth]` block to `supabase/config.toml` mirroring the non-secret values so drift is reviewable,
and a `docs/web-launch/auth-settings.md` checklist E signs per environment.

## 5. RLS expectations

General: every table RLS-on (true today); every SECURITY DEFINER function pins `search_path` (true
today, 306 functions) and either checks the caller in-body or is revoked from `anon`/`authenticated`.

| Data | anon | authenticated | service role only |
|---|---|---|---|
| Public kitchens, meals, posts, published experiences | read via public views only (`kitchen_public` etc.), no `owner_id` | same | writes via RPC |
| Orders, payments, ledger | none | own rows (customer) or own kitchen (cook) | ledger insert, status transitions |
| Messages, threads, attachments | none | thread members only; attachments private bucket | |
| Addresses, coordinates | none | owner; cook sees delivery address only for an active order via guarded RPC | |
| `experience_private.meeting_url` | none | booked customers via RPC | |
| `public_support_requests`, `waitlist` | insert only through rate-limited RPC (S5) | same | read: admins |
| Membership checks (`is_prepplus_member`, `is_cook_pro_member`) | revoke | self only | any |
| Admin RPCs | none | `is_admin()` AND `aal2` | |

Acceptance (L2/L4): a scripted anon probe against the test project lists every table and RPC reachable
by `anon`; two-account test proves A cannot read B's orders, messages, tickets, addresses.

## 6. Ranked fixes

| Rank | ID | Fix | Paths | Loop |
|---|---|---|---|---|
| 1 | S1 | Security headers + CSP (Report-Only, then enforce) | `vercel.json` | L1 / L3 |
| 2 | S2 | Auth dashboard settings in section 4, especially Confirm email and exact redirect allowlist | Supabase dashboard, `supabase/config.toml` | L1 (test), L3 (prod) |
| 3 | S3 | Admin MFA: `aal2` check in `is_admin()` and admin RPCs; client prompts enrolment | new migration; `app/admin/_layout.tsx:36` | L3 |
| 4 | S4 | Meeting URL: `^https://` in zod and a DB CHECK; client re-checks scheme before open | `supabase/functions/experience-upsert/index.ts:42,128`; new migration on `experience_private.meeting_url` (`20260713224602_experiences_e4_private_meeting_url.sql:6`); `app/(tabs)/orders.tsx:125-128` | L3 |
| 5 | S5 | Public intake via RPC/Edge Function with `check_rate_limit` by IP, caps on every column, server `ref` and `status`; dedupe/throttle in `notify_admins` | `20260714193000_public_support_requests.sql:44-53`, `20260912010000_alert_and_admin_view_for_public_support_requests.sql`, `20260908010000_admin_alerts_via_resend_email.sql:26-40`, `20260710193742_waitlist_table.sql:18-20` | L3 |
| 6 | S6 | Replace `current_setting('request.jwt.claim.role')` with `auth.role() = 'service_role'`; stop swallowing `reconcile_invoice` errors; one regression per function | `20260714104442_critical_fix_reconcile_invoice_service_role_only.sql:30`, `20260925185000_reconcile_ambiguous_booking_balances.sql:37,80`, `20260907190000_admin_anomaly_detection_and_alert_routing.sql:29,34,82,91`, `20260711060016_reconcile_subscription_invoice.sql:67-72` | L3 |
| 7 | S7 | Refund and dispute reconciliation to ledger; hold payouts on disputed balances (D10) | new migration on `stripe.*` mirror | L3 |
| 8 | S8 | Cross-environment isolation: Vault base URL for cron/push, configurable media host, server-side Stripe key-mode assertion | DESIGN tasks 1.2, 1.3, 1.7 | L1 |
| 9 | S9 | Secret scan in Vercel build; add `whsec_`, Resend (`re_`), Mux patterns; decode every `eyJ` JWT in `dist` and require `role=anon`; fail on `.map` | `scripts/scan-build-secrets.mjs:7-12`, `vercel.json` | L1 |
| 10 | S10 | Mux webhook: reject `|now - t| > 300 s`, constant-time compare; `stripe-webhook` returns a generic error | `supabase/functions/mux-webhook/index.ts:51-54`, `supabase/functions/stripe-webhook/index.ts:47118-47121` | L3 |
| 11 | S11 | Shared CORS helper: echo allowed origin only, `Vary: Origin`; allowlist from env | `supabase/functions/*/index.ts`, `supabase/functions/connect-payout/_shared/cors.ts:2-4` | L3 |
| 12 | S12 | Tighten anon: revoke `owner_id` on `kitchens` from anon, gate `experience_reviews` on published, revoke membership oracles from anon | `20260705122314_0004_rls.sql:30`, `20260713222504_experiences_e4_review_display.sql:11-25`, `20260713234223_prepplus_p1_memberships.sql` | L3 |
| 13 | S13 | Remove `signInWithGoogle` dead code | `src/lib/supabase.ts:411-417` | L3 |
| 14 | S14 | Geocoding through a caching Edge Function; list processors in privacy policy | `src/lib/geo.ts` | L3 (D6) |

Process gates for every fix: red-then-green regression (SQL in `supabase/tests/regressions.sql`, TS
in `tests/`), red-team pass, then sane-mode pass, then E approves any production deploy. No fix is
"done" until 4.1's live-vs-repo diff shows it deployed.
