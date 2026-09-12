---
project: Preppa
type: changelog
status: active
last_updated: 2026-09-12
tags: [project/preppa, type/changelog]
---

# Changelog

Part of [[Project]]. Reconstructed from 137 commits on `main`, 2026-07-06 → 2026-08-08, plus the 2026-09-07 session below.

## Safety/abuse report alerting + order-ticket confirmation (2026-09-12)

Closed Launch-Plan item 14's last open sub-item, working autonomously through everything that didn't require the user (real-money/real-device items, cook recruitment, geography/legal decisions were left alone). Traced "support ticket/safety report submission-confirmation notifications" fully: there is no separate safety-report flow — it's `public_support_requests`, the anon-writable marketing-site intake table (`report_type` support/safety/abuse, `immediate_risk` flag) added 2026-07-14. It had zero rows and, more importantly, zero alerting — unlike every other event in the app (role changes, kitchen suspensions, payout `needs_review` all call `notify_admins()`). Fixed with the existing, already-decided `notify_admins()` channel: an `AFTER INSERT` trigger alerts every admin (in-app + push + email) with escalated wording for `immediate_risk`/safety/abuse. Added `admin_list_support_requests()`/`admin_set_support_request_status()` RPCs (same `is_admin()` + `audit_log` pattern as the ticket RPCs) and a real Admin → Safety & support requests screen — there was no way to even view these reports before. Separately, `create_ticket()` (the authenticated order-ticket flow) wrote its row and audit entry but never confirmed receipt to the reporter — added the missing `notify()` call. Verified live in production: inserted a real `immediate_risk` test row, confirmed both admins received a genuine in-app notification and email, then deleted the test row. See [[Decisions]], [[Bugs]], and [[Launch-Plan]] item 14.

## Fixed the *actual* remaining cause of the outbound-timeout alerts (2026-09-11)

The 2026-09-10 fix below offset the two `detect-*` monitoring jobs and assumed the rest of the `*/5`/`*/1` cluster was innocent. It wasn't the whole story: four more real "[Preppa admin] Outbound request failures" alerts fired afterward (2026-09-10 17:07 UTC and 18:52 UTC, then again 2026-09-11 ~17:22 and ~17:52 UTC-equivalent), each confirmed via `cron.job_run_details` to have neither `detect-*` job running at the actual failure instant. Traced properly this time: only `charge-due-cycles` and `reconcile-payouts` (of the four `*/5 * * * *` jobs) actually call `net.http_post` — confirmed via `pg_get_functiondef` that `advance_cycles`/`reap_experience_holds` are pure SQL with no outbound call — and both land on the exact same tick as the every-minute `stripe-sync-worker`, 3 concurrent dispatches every 5 minutes. Fixed by staggering `charge-due-cycles` and `reconcile-payouts` onto different minutes (clear of each other and of the `detect-*` jobs' `:x2/:x7` marks) and raising `timeout_milliseconds` on all three dispatch calls from the pg_net default 5000 to 15000 — none of the three are latency-sensitive. Applied to production and confirmed live via `cron.job`. See [[Decisions]], [[Bugs]], and [[Launch-Plan]] item 15.

## Dependabot re-review (2026-09-10)

Count jumped from 15 to 27 open alerts on a routine push (21 high, 6 moderate) — mostly one new `@xmldom/xmldom` disclosure cluster (13 alerts on that package alone), plus new/updated `browserslist`, `postcss`, and `brace-expansion` advisories superseding earlier partial fixes. Re-ran the same `npm ls` trace as the 2026-09-07 review: every alert still traces to Expo SDK 57's own build/CLI toolchain (`expo-splash-screen`'s `xcode`/`plist` chain, `expo-updates`' `glob`, `expo`'s own `@expo/metro-config`, `babel-preset-expo`) — none run in the shipped JS bundle. Same conclusion as before: left open rather than forcing transitive overrides against a pinned Expo SDK, revisit at the next SDK upgrade. See [[Bugs]] and [[Launch-Plan]] item 6.

## Fixed a real system-health-monitoring false alarm (2026-09-10)

The monitoring added 2026-09-08 caught a real incident on its own: two "[Preppa admin] Outbound request failures" emails, 16:00 and 16:15 UTC on 2026-09-09, each a genuine `pg_net` "Timeout of 5000 ms reached." Investigated rather than dismissed: every payment/payout/subscription cron job's own run succeeded both times (`cron.job_run_details`), ruling out a real business-logic failure. Root cause was self-inflicted scheduling — `detect-admin-anomalies` and `detect-system-health-issues` were both set to `*/15 * * * *`, exactly coinciding with four `*/5 * * * *` jobs plus the every-minute `stripe-sync-worker`: up to 6 concurrent `net.http_post` calls firing in the same instant, occasionally exceeding pg_net's 5-second timeout. Fixed by offsetting both jobs to minutes 7/22/37/52. Also found, while diagnosing: `cron.job_run_details` had grown to 112,440 rows since 2026-07-07 (pg_cron has no built-in retention, and the project role doesn't own the table so it can't be indexed) — added a daily prune job, shrinking it to ~8,000 rows on the spot. See [[Decisions]] and [[Launch-Plan]] item 15.

## Apple Pay / Google Pay checkout (2026-09-09)

Closes the wallet-checkout gap found in the Shef UI/UX drill-down. Google Pay is live now: a Stripe Payment Request Button on web (`CardPaymentSheet.tsx`, real-charge flows only) and unconditional `googlePay` config in native `payWithCard()`'s `initPaymentSheet()` call — neither needed any external account setup, since Stripe handles Google Pay directly. Apple Pay's code is fully wired (`StripeRoot.tsx`'s `merchantIdentifier`, `initPaymentSheet`'s `applePay` option, both keyed off a new `APPLE_PAY_MERCHANT_ID`/`EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID`) but stays inert until an Apple Merchant ID exists — that requires the user's own Apple Developer Program account, which this session has no access to. Verified: `tsc --noEmit` clean, app loads and runs with no console errors after the change (full live-payment verification wasn't possible — the DB currently has zero verified kitchens/orderable meals after the seed-kitchen cleanup, so there's no real inventory to check out with). See [[Payments]] and [[Tasks]].

## Support/safety/abuse inbox routing fixed + transactional email audit (2026-09-08)

Worked [[Launch-Plan]] item 14. Checked Cloudflare Email Routing directly (the domain's real MX provider) rather than assuming the help-center-listed addresses worked: routing was reporting **Disabled**/**Misconfigured** (a required SPF TXT record was missing), and `safety@`/`abuse@preppa.live` had **no routing rule at all** — mail to either was being silently dropped by the catch-all. Fixed both: added the missing SPF record and created routing rules for `safety@`/`abuse@` alongside the existing four addresses; all six now forward to a real monitored inbox. Separately, audited every Edge Function for actual outbound email calls and found a real scope gap: everything on the item-14 checklist besides signup/OTP (cook application, order lifecycle, cancellation, refund, payout status) only ever sends an in-app notification + push via `notify()` — never an email. The checklist assumed transactional email existed for these; it doesn't, and building it is a separate product decision, not a delivery bug. See [[Bugs]] and [[Decisions]].

## System health monitoring (2026-09-08)

Closes the DB-observable half of [[Launch-Plan]] item 15. Added `detect_system_health_issues()` (pg_cron, every 15 min): alerts via the existing `notify_admins()` path on real `cron.job_run_details` failures (a scheduled job's SQL statement itself erroring) and real `net._http_response` failures (5xx/timeout from any outbound `pg_net` call across the whole app — reconcile-payouts, auto-payouts, detect-admin-anomalies, notify_admins' own push/email/Slack dispatch, stripe-setup-nudge). Verified live in production: cron job registered and active, ran clean against 112 real recent scheduled-job runs (all succeeded, correctly raised no false alarm). Vercel deploy status and Stripe webhook delivery failures are explicitly not covered — recommended turning on each platform's own native alerting instead of building a custom poller needing a new external API token.

## Admin launch dashboard (2026-09-08)

Worked [[Launch-Plan]] item 15. Added `admin_dashboard_metrics()` (self-gated via `is_admin()`, same pattern as the existing admin RPCs) and a new Admin → Dashboard screen surfacing money metrics (GMV, orders, payment success rate, refunds, payout pipeline, all-time ledger balance) and marketplace metrics (active/verified cooks, live meals, fulfillment rate) that were previously queryable but not visualized anywhere. While verifying it live against production, caught a real bug before it shipped: `live_meals_count` was counting the 6 permanently-rejected seed kitchens' still-`status='live'` meal rows (rejecting a kitchen doesn't cascade to its meals), which would have shown fake inventory as if real. Fixed to join through kitchen verification before deploying the corrected version. System-health metrics (Vercel/Edge-Function/cron uptime) are explicitly out of scope — they need external monitoring, not a DB query.

## Dead UI surface cleanup (2026-09-08)

Worked [[Launch-Plan]] item 11. Checkout (`app/checkout.tsx`) turned out already Stripe-only/COD-free from a prior fix — the actual dead-end was `app/payments.tsx`, which had a static "Cash on delivery — Always on" card and empty-state copy inviting cash payment, both false since the server 400s any `cod` order. Removed both. Confirmed rewards and livestreaming are both correctly flag-gated with no leftover reachable entry points (each already had a prior audit fix). Found the "quotes payment coming soon" item was stale documentation, not a real issue — no such copy exists; both quote-payment entry points already call the real deposit-charge backend. Also found, while checking for demo/seed data reachable as real inventory: 6 fake seed kitchens (`verification_status = 'pending'`, 9 attached `meals` rows) still sit in the live production database, mapped from `src/data/data.ts`'s hardcoded `COOKS`. Confirmed not currently customer-reachable (RLS requires `verified`).

## Fake seed kitchen resolution (2026-09-08, later same day)

Attempted to fully delete the 6 fake seed kitchens per the above — turned out they also carry 30 real orders and 55 ledger entries (traced to dev/admin/test accounts, no real customers). Deletion is genuinely impossible without weakening real guarantees: `ledger_entries` (all 6 kitchens), `subscription_events` (kitchen 1), and `messages` (kitchens 1, 6) are deliberately append-only (`block_mutation()`), same protection class as `audit_log`. Every delete attempt (run inside explicit `begin`/`commit`) correctly rolled back with zero rows changed. Instead, permanently set all 6 kitchens to `verification_status = 'rejected'`, `availability = 'paused'`, with a documented `rejection_reason` — un-orderable forever, full history preserved. The client-side `COOKS`/`KITCHEN_ID` fallback code is now provably dead for all customer traffic but was **not removed this round** — `Meal.cook: CookId` is a non-optional field real (non-seed) meals also default through, making full removal a genuine refactor rather than dead-code deletion. See [[Tasks]] and [[Decisions]].

## Auth test pass + Alert.alert-on-web fix (2026-09-08)

Ran the full auth flow test pass from [[Launch-Plan]] item 12 live against production, via `expo start --web` and disposable `@mailinator.com` accounts (cleaned up after): password signup/login, OTP signup/login (real code retrieved from the mailinator inbox), wrong password, wrong OTP, resend OTP, logout, session-restore-on-reload, and account deletion. Found and fixed a real bug in the process: `Alert.alert` is a no-op on `react-native-web`, so "Delete account" and the admin "Delete signup" (web-only, so it had zero working fallback) silently did nothing when clicked — no dialog, no API call. Added `src/lib/confirm.ts` (`window.confirm` on web, real `Alert.alert` on native) and switched both call sites to it; verified the fix by monkey-patching `window.confirm` in the browser (the test harness itself suppresses native dialogs) and confirming the delete API call fires correctly on accept. See [[Bugs]] and [[Launch-Plan]].

## Admin control hardening (2026-09-07, later same day)

Closed out [[Launch-Plan]] item 7. Discovered admin-RPC rate limiting was **already implemented** 2026-07-15 (the checklist had gone stale) — corrected [[Security]]/[[Launch-Plan]]/[[Tasks]] rather than re-doing it. What was genuinely missing: `admin_set_user_role` and `admin_suspend_kitchen` wrote to `audit_log` but never alerted anyone in real time. Added an immediate `notify_admins()` call to both. Added `detect_admin_anomalies()` (pg_cron, every 15 min): role-escalation bursts, kitchen suspend/reinstate churn, unusual refund volume and repeated payment failures (the last two read the existing `stripe.charges`/`stripe.refunds` Stripe-sync mirror tables — no new instrumentation needed), each deduped per window via an `anomaly_alerted` row in `audit_log`. Extended `notify_admins()` to also `net.http_post` to a Slack-compatible webhook if an `admin_alert_webhook_url` Vault secret exists — kept inert (no Slack workspace was set up).

## Credential rotation (2026-09-08)

Closed out [[Launch-Plan]] item 4. Since the originally-exposed Resend CSV key couldn't be identified after removal, both Full-access Resend API keys on the account were rotated as a precaution: a new `Sending access`-only key restricted to the `preppa.live` domain replaced them in Supabase Auth SMTP, verified with a real OTP send. Google's OAuth client secret was rotated via Google Cloud Console's dual-secret zero-downtime flow — added a new secret, updated Supabase's Google provider config, disabled the old (Aug 8, 2026) one. Mux's access token (previously over-scoped with Data/Video/System/Robots permissions) was replaced with a `Mux Video`-only token, verified live via a temporary debug function (stubbed to 410 immediately after, same pattern as the earlier Stripe-mode check), then the old token revoked. A full `git log --all` history scan for Stripe/Resend/Google/Mux/PEM secret patterns found nothing real (a few `re_*` matches were SQL/JS identifiers, not Resend keys). Finally, ran a real `npx expo export --platform web` and grepped the built output for the same secret patterns plus `service_role` — zero hits; the one embedded JWT decodes to `role: anon`. Launch-Plan item 4 is now fully closed.

## Admin alert routing activated via email (2026-09-08)

No Slack workspace was available, so activated the alert routing a different way: created a scoped Resend API key (Sending-access only, restricted to the `preppa.live` domain — DKIM/SPF-verified for sending, confirmed via the Resend dashboard) and stored it as the `resend_admin_alerts_api_key` Vault secret. `notify_admins()` now emails every admin directly via Resend's API alongside the in-app notification — verified live end-to-end with a real test alert (`net._http_response` showed two HTTP 200s, one per admin). While doing this, suspected Preppa's live Supabase Auth SMTP might be configured with a key from an unrelated Resend workspace — investigated directly by triggering a real OTP via the Auth REST API and checking Resend's logs. **False alarm**: it correctly sends from `noreply@preppa.live` through the right account (`200`, logged). No fix was needed; see [[Tasks]] and [[Security]].

## Environment separation plumbing (2026-09-07, same day)

[[Launch-Plan]] item 5. Hit a real $10/mo recurring-cost blocker creating a second Supabase project on the org's Pro plan; user declined the cost, so scope was cut to code-plumbing-only. `src/lib/supabase.ts` now reads `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY`/`EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` with a fallback to the existing live values; `eas.json` gained an explicit `env` block per build profile. **All three profiles still point at the same live project/keys** — documented as an open gap, not marked done. See [[Payments]] and [[Security]].

## Migration history restoration + payout reconciliation (2026-09-07)

**Restored the full supabase migration history** from the live project: 65 migrations were missing from `supabase/migrations/` entirely and 36 more existed under fabricated timestamps that didn't match when they were actually applied, silently misordering dependencies. Pulled the authoritative SQL for all 211 live migrations from `supabase_migrations.schema_migrations` and reconstructed the history — 212 migrations (211 restored + 1 pre-existing stale local-only file) now replay cleanly from scratch, verified via `supabase/tests/regressions.sql` in CI.

**Built and deployed automated payout reconciliation**: `needs_review` payout state, `claim_stale_payouts`/`reconcile_payout` RPCs, `reconcile-payouts` cron worker (every 5 min) that resolves payouts a Stripe API error left ambiguous, by idempotency-key replay or metadata lookup — never auto-failing. Fixed a real bug in `kitchen_balance_cents` (broken service-role detection meant every worker call saw balance 0).

**Scheduled automatic weekly payouts** (`claim_auto_payouts`/`auto-payouts` cron, $20 minimum, opt-out per kitchen) alongside the existing manual cash-out.

**In-app payout management**: payout history + summary RPCs, a rebuilt Earnings screen, Stripe Express Dashboard link for bank/card management (`connect-dashboard-link`), and a cook-facing Stripe payout-schedule picker (`connect-payout-settings`).

**Onboarding hardening**: food-handler cert review status for admins, a Stripe-setup nudge for verified-but-unonboarded cooks, and committed previously-uncommitted in-home vetting client screens (`app/hub/in-home-vetting.tsx`, `app/admin/in-home-vetting.tsx`, `src/lib/inHomeVetting.ts`) whose backend RPCs had existed since 2026-08-12 with no client code in git.

**Verified end-to-end against real Stripe test-mode API calls**, not simulated SQL: real cook signup → real application → real admin approval → real Stripe Connect onboarding via the hosted flow → real cash-out → real reconciliation of a seeded stuck payout → real auto-sweep, each step confirmed with a distinct real Stripe transfer ID.

Also cleaned ~30 stray top-level files/directories from the working tree (old zip extracts, reference copies, screenshots) and found + removed an exposed Resend API key (`api-keys-*.csv`) sitting at the repo root — flagged for rotation, not committed to git.

## Phase 0 — Prototype build-out (07-06 → 07-07)

Full customer + prepper "My Hub" app scaffolded; cart math, accessibility, rotating drop, permissions, repository seam; real meal photos + zoomable viewer; **multi-cart (one order per cook)** fix; QR/6-digit handoff for pickup+delivery; **real email-OTP auth + Stripe test-mode checkout**; **feature flags introduced** to strip fake surfaces for v1.

## De-mocking into a real marketplace (07-09 → 07-11)

Real cook application + vetting; real user identity at signup; **DB-backed buyer catalog** (Explore/Home/detail/storefront); **money loop closed** (Stripe → order/ledger reconciliation); test-customer credential removed; **honest reviews & ratings**; real saved cards; real notification center; GPS proximity filtering; admin console + accessibility pass; **first Platform Integrity Audit** committed; **Stripe Connect Express** payouts; real prepper discovery + storefronts; nav/IA reframe (Home·Discover·Orders·Profile); real Food-Services marketplace (request→quote→book→deposit); real weekly meal-plan subscriptions; performance program (removed 1400ms splash floor, unblocked fonts, SWR cache, expo-image).

## Feature depth (07-12 → 07-13)

Richer plan builder + cook prep rollup; messaging (1:1 threads + cook broadcast); customer-choice plans, dietary tags, cutoff/lead time, trials; **PrepPlus membership**; **Experiences** (prepper-published listings, instant booking, recurring sessions); **Feed** (real DB-backed posts + likes, in-app video posting, Mux livestreaming); real order fulfillment status, payout-gated publishing.

## Remediation day — 2026-07-14 (audit + 10 PRs in one day)

Admin Waitlist module; **16 Critical audit findings fixed** (PR #1); **9 High findings** (PR #5): payout-gating, legacy subscription cleanup, refund idempotency, vacation mode, chat rate limit; **5 post-merge re-audit findings** (PR #6): kitchen-suspension bypass, broken seat release; admin visibility for plans/subscriptions/bookings; **CRITICAL financial-fraud RPC (`reconcile_invoice`) fixed** (PR #10); dependabot config added; **"Warm Trust" redesign** foundation + Home; **ordering pipeline hardening** (idempotent checkout, real food photos, edge-case handling).

## Hardening & commercialization (07-15 → 08-08)

Rate limiting + quote-booking balance collection; `accept_quote()` outage fixed (had never worked for a real customer); cancel-booking double-deduction race fixed; **plan cadence** (`cadence_weeks`) added; **PrepPlus shipped**, admin ops, cook-pro tooling, push notification wiring; **native card payments** via Stripe PaymentSheet, EAS project linked; **Stripe switched to LIVE mode** (2026-08-08); **real-kitchen cart/checkout misattribution fixed** (placeholder cook id bug merging two kitchens' money); real per-kitchen delivery/pickup toggle; legal links pointed at `help.preppa.live` (latest commit, `d0f9345`).

## Related

- [[Project]] · [[Decisions]] · [[Bugs]]
