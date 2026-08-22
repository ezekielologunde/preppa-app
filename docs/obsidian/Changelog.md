---
project: Preppa
type: changelog
status: active
last_updated: 2026-08-22
tags: [project/preppa, type/changelog]
---

# Changelog

Part of [[Project]]. Reconstructed from 137 commits on `main`, 2026-07-06 → 2026-08-08.

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
