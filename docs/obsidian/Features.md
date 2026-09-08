---
project: Preppa
type: features
status: active
last_updated: 2026-09-07
tags: [project/preppa, type/features]
---

# Features

Part of [[Project]]. Status inferred from code (flag guards, real API calls vs. mock imports, in-code comments). See also [[Frontend]], [[Payments]].

## Implemented (real backend)

- Auth + onboarding (real email OTP, password auth)
- Catalog / Home / Discover / storefronts (Supabase-backed, shared cache, proximity sort)
- Card checkout (web Elements + native PaymentSheet)
- Cook onboarding + admin review (geocoded address, private docs bucket, signed URLs, food-handler cert review status added 2026-09-07)
- **In-home vetting** ("Cook at My Place" category) — separate, higher-bar review (background check + insurance docs) gating in-home bookings; client screens committed 2026-09-07, backend RPCs existed since 2026-08-12.
- Admin console (10 screens incl. Payouts, added 2026-09-07; real search over live rows)
- **Cook payouts** — on-demand cash-out, automated reconciliation of stuck payouts, weekly auto-payout sweep (opt-out), payout history, Stripe Express Dashboard link for bank/card management, Stripe payout-schedule picker. See [[Payments]].
- Plans/subscriptions (cadence, rotating, capacity, cutoff/lead time, trial)
- Feed (real paginated posts + likes; video reels are a later slice, see [[Tasks]])
- Chat/messages, notifications center, PrepPlus, tickets, experiences booking

## Partial / conditionally gated

- **PrepPlus** — web-only entry by IAP policy.
- **Go live** — provisions a real Mux RTMP stream/key for external broadcast software (OBS/ffmpeg); no in-app camera broadcast (no official Mux RN SDK).
- ~~**Quotes payment** — UI still says "in-app payments are coming soon"~~ — **confirmed stale 2026-09-08**, no such copy exists anywhere in the current codebase. Both `app/discover.tsx` (Services tab) and `app/request/[id].tsx` already call the real `acceptQuoteAndDeposit()` → `CardPaymentSheet` deposit charge.
- **Private-chef / home bookings** — fallback toast when `FLAGS.services` is off.
- **Mock data still reaches 39 route files** via `src/data/data.ts`, including some persisted into the real store (`SEED_ORDERS`, `SEED_ADDRESSES`, `SEED_REQUESTS`, `CONVERSATIONS`). Real/mock boundary needs per-screen verification.

## Placeholder / disabled

- **Rewards** — fully hardcoded (fake referral code + points history), hard-redirected away (`FLAGS.rewards=false`) after being found reachable by direct URL.
- **Livestreaming** — `FLAGS.live=false`; all 4 consumer sites guarded.
- **Google OAuth** — implemented but disabled (broke on web SPA).
- **`delete-account`** — called by client, edge function not vendored in repo.

## Related

- [[Project]] · [[Frontend]] · [[Payments]] · [[Tasks]] · [[Bugs]]
