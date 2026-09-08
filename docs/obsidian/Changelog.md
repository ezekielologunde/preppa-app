---
project: Preppa
type: changelog
status: active
last_updated: 2026-09-07
tags: [project/preppa, type/changelog]
---

# Changelog

Part of [[Project]]. Reconstructed from 137 commits on `main`, 2026-07-06 → 2026-08-08, plus the 2026-09-07 session below.

## Admin control hardening (2026-09-07, later same day)

Closed out [[Launch-Plan]] item 7. Discovered admin-RPC rate limiting was **already implemented** 2026-07-15 (the checklist had gone stale) — corrected [[Security]]/[[Launch-Plan]]/[[Tasks]] rather than re-doing it. What was genuinely missing: `admin_set_user_role` and `admin_suspend_kitchen` wrote to `audit_log` but never alerted anyone in real time. Added an immediate `notify_admins()` call to both. Added `detect_admin_anomalies()` (pg_cron, every 15 min): role-escalation bursts, kitchen suspend/reinstate churn, unusual refund volume and repeated payment failures (the last two read the existing `stripe.charges`/`stripe.refunds` Stripe-sync mirror tables — no new instrumentation needed), each deduped per window via an `anomaly_alerted` row in `audit_log`. Extended `notify_admins()` to also `net.http_post` to a Slack-compatible webhook if an `admin_alert_webhook_url` Vault secret exists — kept inert (no Slack workspace was set up).

## Admin alert routing activated via email (2026-09-08)

No Slack workspace was available, so activated the alert routing a different way: created a scoped Resend API key (Sending-access only, restricted to the `preppa.live` domain — DKIM/SPF-verified for sending, confirmed via the Resend dashboard) and stored it as the `resend_admin_alerts_api_key` Vault secret. `notify_admins()` now emails every admin directly via Resend's API alongside the in-app notification — verified live end-to-end with a real test alert (`net._http_response` showed two HTTP 200s, one per admin). While doing this, discovered Preppa's live Supabase Auth SMTP is actually configured with a key from an unrelated Resend workspace ("getbagsly", `mail.bagsly.co` domain) rather than Preppa's own verified domain — flagged in [[Tasks]] and [[Security]], not yet fixed.

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
