# PREPPA — Platform Integrity Audit (living report)

Grounded audit of the whole platform: real-vs-mock, integrity, security, orphans, red-team.
Produced by a 23-agent audit fleet (16 subsystem audits + 6 security red-team categories +
1 verdict-synthesis pass) reading the actual code and the live Supabase project. Read-only —
nothing was fabricated; every finding cites file:line, a query, or live row data. Full
per-subsystem traceability matrix and every red-team attempt: **[AUDIT_FULL.md](./AUDIT_FULL.md)**.

_Last run: 2026-07-14. App project: `fwidhpzwldneeaphrxgg`. Verdict: **NO GO**._

---

## Posture in one paragraph

The backend architecture is frequently well-designed in isolated slices — row-locked capacity
reservation, an append-only ledger, `SECURITY DEFINER` RPCs with real server-side re-checks, a
genuine Stripe Connect payout flow, and a real app-controlled per-cycle subscription billing
engine (not naive Stripe recurring — independently verified). But this pass found **16 Critical
and 22 High** feature-level gaps spanning every primary journey, plus the red-team pass
independently **confirmed 21 exploitable vulnerabilities** (of 49 attempted attacks), several of
which move real money or expose the platform to unmoderated live production traffic today.
Most of the previous audit's "mostly mock" framing is now **out of date** — the buyer catalog,
reviews schema, and subscription engine are genuinely DB-backed — but a new, different set of
critical gaps has taken its place, concentrated in **prepper-side management screens still wired
to dead mock fixtures**, **missing concurrency locks on money-moving actions**, and **an
unflagged livestreaming feature that violates the team's own launch-gating plan**.

**Scorecard**

| Subsystem | Verdict |
|---|---|
| Auth / roles / prepper application lifecycle | ✅ Real, server-authoritative — but only 4 of 8 spec'd lifecycle states exist; no suspend/ban capability |
| Buyer catalog (read path) | ✅ Real, DB-backed (this reverses the prior audit's "100% mock" finding) |
| Meal purchase-time integrity (create-order) | ✅ Real — re-validates & re-prices server-side, RLS blocks non-live reads |
| Meal prepper-side management (edit/pause/archive/photo) | 🔴 **Missing entirely** — no RPC, no DB column, no working UI |
| Prepper "My Hub" dashboard + "My menu" | 🔴 **Unsafe** — wired to permanently-empty legacy mock fixtures |
| Meal Plans & Subscriptions (billing engine) | ✅ Real, well-built — but zero live production usage; legacy parallel Stripe-recurring system still deployed & reachable |
| Experiences (instant booking) | ✅ Real — DB row-locked, oversell-safe |
| Services / Request-and-Quote (bidding) | 🔴 Real money flow, but **no lock against double-booking on concurrent quote acceptance** (confirmed exploitable) |
| Orders & fulfillment (web) | ✅ Real Stripe-backed | 
| Orders — native (iOS/Android) checkout | 🔴 **Full mock** — marks "paid" with no charge, no order row |
| Order tracking screen | 🔴 Hardcoded fixture data, disconnected from real order status |
| Cook payouts (Stripe Connect) | 🔴 Wired and real, but **double-spend race** on the payout endpoint (confirmed exploitable) |
| Reviews | 🔴 UI-only mock submission; correct RLS + schema, 0 real rows |
| Messaging / chat | ✅ Real 1:1 threads + Realtime — but no rate limit on individual messages |
| Feed / creator video | ✅ Real posts/likes/follows — but **no moderation gate**, arbitrary external media URLs accepted |
| Livestreaming | 🔴 **Fully shipped, unflagged**, violating the team's own pre-launch gate; webhook fails **open** with no signing secret |
| Admin control plane | ⚠️ Covers ~6 of ~24 required areas; **no suspend/ban, no refund/dispute view, no plans/subscriptions/quotes visibility** |
| Kitchen capacity / vacation mode | 🔴 Vacation toggle never persists to DB; **the platform's only 2 real kitchens are stuck permanently unorderable** right now |
| Tests / CI | 🔴 **Zero automated tests, zero CI/CD**, anywhere in the repo |
| Source control of backend | 🔴 **All 31 live Edge Functions + ~108 SQL migrations exist only in the remote Supabase project** — no git history for any of them |

---

## 🔴 Critical (16)

1. **connect-payout has no lock/idempotency key** on the Stripe Transfer call — any onboarded
   prepper can double/multi-submit cash-out and extract more real money than their ledger
   balance allows. **Confirmed exploitable.**
2. **accept-quote-and-deposit has no row/advisory lock** — two different quotes on the same
   service_request can both be accepted, paid, and confirmed, producing two paid bookings with
   two cooks for one event. **Confirmed exploitable.**
3. **Livestreaming (Mux) is fully live in production with no `FLAGS.live` gate**, directly
   violating the team's own written pre-launch plan. Go-live/viewer screens are reachable by any
   approved prepper with zero moderation, suspension-propagation, or kill switch.
4. **mux-webhook fails OPEN** — if `MUX_WEBHOOK_SECRET` is unset it accepts and processes
   unsigned events (can forge stream-state transitions / fabricate published VOD posts).
5. **create_post accepts arbitrary externally-hosted media URLs** with no domain allowlist, and
   Preppa's own storage objects are overwritable in place post-publish (bait-and-switch on
   already-moderated/visible media).
6. **Native (iOS/Android) checkout is a full UI mock** — marks orders "paid" client-side with no
   Stripe call and no DB row. Zero revenue integrity on any native build.
7. **No `update_meal`/`pause_meal`/`archive_meal` capability exists anywhere** (app or DB) — a
   published meal can never be edited, paused, marked sold-out, or removed by its prepper.
8. **Prepper "My Hub" dashboard and "My menu" are wired to permanently-empty legacy mock
   fixtures** (`ORDERS`/`BALANCE`/`MY_MEALS` all zeroed) despite real order/ledger/meal data
   existing one layer down.
9. **Meal-order review submission is a UI-only mock** (fake toast, no DB write) despite a
   correct, ready RLS policy and `reviews` table — 0 rows in production.
10. **No user suspension/ban capability exists anywhere** (schema, RPC, or UI) — admin cannot
    disable a bad-actor account short of manual DB surgery.
11. **Kitchen "vacation mode" never persists to the database** (local-state-only), and kitchen
    approval never sets `availability='open'` — **the platform's only 2 real prepper kitchens
    are stuck permanently paused/unorderable in production right now.**
12. **`app/track.tsx` (order tracking) is entirely hardcoded fixture data** (fake order id/ETA/
    status) even though real order-status plumbing exists and is used correctly one screen away.
13. **Zero automated tests exist anywhere in the repo** — no test runner configured for any of
    31 live Edge Functions, ~108 migrations, or app logic.
14. **No CI/CD pipeline exists** — 98 commits have landed on `main` with no automated
    type-check, lint, or test gate.
15. **All 31 live Supabase Edge Functions (including every payment-moving function) exist only
    in the remote project with zero source control** — unrecoverable, unreviewable, undiffable.
16. *(Carried context, not re-verified this pass)* Google OAuth client secret exposure from a
    prior session — confirm rotation completed if not already done.

## 🟠 High (selected — full list of 22 in AUDIT_FULL.md)

- Payout-gating (`kitchen_payouts_enabled`) is **missing entirely for subscription-plan
  activation and for accepting a paid service quote** — unlike meals, which are gated twice.
- **No suspend/deactivate capability for an already-verified kitchen**, despite the Cook
  Agreement promising Preppa can pause/suspend/remove a kitchen at any time.
- **Rejected/pending prepper applicants retain full ownership-based access to ~10 of 12
  Prepper-only RPCs** because `is_kitchen_owner()` never checks `verification_status` —
  rejection does not revoke capability. **Confirmed exploitable.**
- A **legacy, fully-deployed parallel Stripe-native subscription system**
  (`create-subscription`/`manage-subscription`) remains reachable by any authenticated user;
  currently inert only by data-layer coincidence (`plans.stripe_price_id` never populated).
- Admin has **zero visibility into plans/subscriptions, service-requests/quotes/bookings,
  refunds, or disputes** — only 6 of ~24 target admin capability areas exist.
- **`hub/subscribers.tsx`** (prep-rollup / subscriber roster / broadcast) is fully real and
  DB-backed but has **zero navigation entry point** anywhere in the app.
- Vacation-mode/availability is enforced only for single-order checkout — **not** for
  subscription-cycle billing, plan/box signups, or experience bookings.
- Meal photo upload at creation is fully fake (fixed gradient placeholders) — no
  prepper-created meal has a real photo.
- Individual 1:1 chat messages have **no rate limit** (unlike broadcasts) — inbox-flooding is
  possible.
- Refund paths (`cancel-booking`, `cancel-experience-booking`, `cancel-experience-session`) have
  **no idempotency key or row lock** on the Stripe refund call — double-refund race.

## Confirmed-exploitable red-team findings (21 of 49 attempts)

Six categories tested (identity/roles, marketplace abuse, payments, media/livestream, messaging/
notifications, admin). 21 confirmed vulnerable, 24 not vulnerable, 4 inconclusive. The highest-
severity confirmed items are the payout double-spend, the quote double-booking, the Mux webhook
fail-open/forgery, and the arbitrary-media-URL substitution — all listed above. Full attack-by-
attack detail (including the 24 *not*-vulnerable checks, which document real, working defenses
worth preserving) is in **AUDIT_FULL.md**.

## Verdict: NO GO

Per the governing rule, GO is disallowed while any Critical/High finding is open or any primary
journey is incomplete — both are true here by a wide margin. This was an **audit-only pass**;
nothing above has been fixed yet.

### Recommended next slice (stop-the-bleeding, before any new feature work)

1. Add `FLAGS.live=false` and gate go-live / the "Live now" rail / the viewer screen behind it;
   fix `mux-webhook` to fail **closed** (400) whenever `MUX_WEBHOOK_SECRET` is unset.
2. Fix `connect-payout`'s double-spend race: wrap balance-read + Stripe transfer + ledger-insert
   in a `pg_advisory_xact_lock` and pass a Stripe idempotency key (mirrors the pattern already
   used in `reconcile_paid_pi`'s box-cycle lock).
3. Fix `accept-quote-and-deposit`'s double-booking race the same way (advisory lock keyed on
   `request_id`, or a partial unique index on `bookings(request_id)` for active statuses).
4. Manually flip the 2 live real prepper kitchens to `availability='open'`, then ship the
   vacation-mode toggle's DB write and default new approvals to `open` in `approve_kitchen`.

Second slice (follow-on): native checkout, meal edit/pause/archive + real photo upload, wiring
My Hub/My-menu off the dead mock fixtures, and real order-review submission.

## Incomplete primary journeys (all 7)

Customer meal order, prepper onboarding→payout, subscription lifecycle, service-request/quote
lifecycle, feed-commerce, livestream, and admin all have at least one open Critical/High gap that
breaks the journey end-to-end for some real user path. Detail in AUDIT_FULL.md.

## Superseded from the prior audit (no longer true — do not re-fix)

- ~~Buyer catalog is 100% mock~~ — now genuinely DB-backed (Explore/Home/detail/storefront read
  live `meals`/`kitchens`).
- ~~Payment→order reconciliation is broken~~ — `reconcile_paid_pi` trigger works, verified.
- ~~Reviews/ratings are fabricated~~ — schema and RLS are now honest and read-real; the *gap*
  moved from "fake numbers" to "the submission UI never writes" (Critical #9 above).
- ~~Meal plans/subscriptions are mock~~ — the billing engine is real and independently verified
  as app-controlled, not naive Stripe recurring; the gap is zero live usage + a dangling legacy
  parallel system, not mock-ness.

---

_Full traceability matrix (168 features across 16 subsystems, orphans, duplicates, and every
red-team attempt with evidence/fix/regression-test) lives in **[AUDIT_FULL.md](./AUDIT_FULL.md)**._
