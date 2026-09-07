---
project: Preppa
type: payments
status: active
last_updated: 2026-09-07
tags: [project/preppa, type/payments]
---

# Payments

Part of [[Project]]. See also [[Security]], [[Backend]].

> [!danger] Stripe is confirmed LIVE — real cards get charged
> Definitively confirmed 2026-09-07 by reading the deployed `STRIPE_SECRET_KEY`'s prefix directly (via a temporary debug function, deleted/stubbed immediately after — never logged the full key): it is `sk_live_...`, matching the client's hardcoded `pk_live_...` publishable key (`src/lib/supabase.ts`). **Both sides of every payment integration are live.** The earlier suspicion in this doc (based on `stripe.*` sync-engine mirror tables showing mostly `livemode=false` data) was a red herring — that mirrored historical/test data from earlier development, not the current key's mode. **Do not run a test checkout against this project expecting no real charge; it will charge a real card.** Use a separate Stripe test key (e.g. locally, as done for the 2026-09-07 payout E2E test) for any exploratory payment testing.
>
> The client now reads its Stripe/Supabase config from `EXPO_PUBLIC_*` env vars set per `eas.json` build profile (see [[Launch-Plan]] item 5) rather than a single hardcoded literal — but as of 2026-09-07 all three profiles (`development`/`preview`/`production`) still point at these same live values. A second, non-production Supabase project + Stripe test key was scoped but not created (declined: $10/mo recurring cost on the org's Pro plan). Until that exists, **every build of this app, including local dev and preview, hits live Stripe and the live database.**

## Model: ledger + on-demand transfer, not escrow

Funds are **not held in Stripe escrow**. Cook earnings accrue as append-only `ledger_entries` rows (net of Stripe fee); `kitchen_balance_cents()` sums them; cash-out is a Stripe `transfers.create` to the cook's Connect Express account.

## One-off order (meals) — implemented, live

`create-order` re-prices server-side from DB `price_cents` (client never sends amounts), applies `SERVICE_FEE_BPS=1000` (10%), tip capped at $1000, requires kitchen `verified`+`open`+`payouts_enabled`. Confirmation: web new card → Stripe Elements; web saved card → `confirmCardPayment`; native → Stripe PaymentSheet with ephemeral key. A DB trigger `reconcile_paid_pi` creates order/ledger rows on settlement.

## Saved cards — implemented

`payment-methods` function: setup-intent, ephemeral-key, list, detach, default — every action re-verifies the PaymentMethod belongs to the caller's Stripe Customer before mutating.

## Connect payouts — implemented

`connect-onboard` creates an Express account (redirect URLs allowlisted to `app.preppa.live` only). `connect-payout`: `reserve_payout` (advisory lock, caller's JWT) → `transfers.create` with idempotency key and retry → `finalize_payout` (**service-role only**, so a cook can't self-confirm their own payout).

**Ambiguous-error handling (deliberate design):** a Stripe connection/timeout error during payout or subscription charging means the outcome is *unknown*. Rather than risk a double-payout by freeing the amount for retry, these paths return HTTP 202 and leave the row `pending`/`charging` — for payouts this is now picked up automatically (see below); for subscription charging it's still manual. See [[Tasks]].

## Automated payout reconciliation — implemented (2026-09-07)

Closes the gap above for payouts specifically. `reconcile-payouts` (cron, every 5 min) claims `payouts` rows still `pending` after a 10-minute floor (`claim_stale_payouts`, `for update skip locked`) and resolves each one via `reconcile_payout`:

1. **Age < 24h** — replay the *same* idempotency key (`payout_<id>`). Stripe guarantees this returns the original transfer, never a second one. A genuine decline → `failed`; still ambiguous → left `pending` for the next tick.
2. **Age ≥ 24h, or an idempotency-key mismatch** — search `transfers.list({destination, created: <window>})` for a transfer whose `metadata.payout_id` matches.
3. **Still not found after 24h** — parked as **`needs_review`** (new `payout_status` value) with the amount still counted as reserved (`reserve_payout`'s pending-sum now includes `needs_review`, not just `pending`) and admins notified (`notify_admins`). **Deliberately never auto-fails** a stuck payout — a false "failed" would let the cook cash the same balance out again on top of a transfer that actually landed. An admin resolves it by hand via `admin_resolve_payout` (Admin → Payouts screen, `app/admin/payouts.tsx`) after checking the Stripe dashboard.
4. **20 attempts without resolution** — also escalated to `needs_review`.

Along the way this fixed a real bug: `kitchen_balance_cents()` used a deprecated `current_setting('request.jwt.claim.role')` check that never fires for a real `service_role` caller, so any worker (including this reconciler and the auto-payout sweep) would have seen balance 0. Fixed to use `auth.role() = 'service_role'`.

## Scheduled automatic payouts — implemented (2026-09-07)

In addition to on-demand cash-out, `auto-payouts` (cron, Mondays 14:00 UTC) sweeps any kitchen with `payouts_enabled`, `auto_payout_enabled` (default true, owner can opt out via `set_payout_preferences`), a balance ≥ `auto_payout_min_cents` (default $20), and no payout already in flight. Uses the identical transfer-creation + idempotency-key path as manual cash-out, so a stuck auto-payout is picked up by `reconcile-payouts` exactly like a stuck manual one.

## Payout management UI + Stripe payout schedule — implemented (2026-09-07)

- `my_payouts`/`my_payout_summary` RPCs back a rebuilt Earnings screen (`app/hub/money.tsx`): available/pending/paid-total, payout history with status pills, auto-payout toggle.
- `connect-dashboard-link` opens the cook's Stripe Express Dashboard (`accounts.createLoginLink`) so they can view/update their bank account or debit card directly with Stripe — the platform never stores or sees those details.
- `connect-payout-settings` lets a cook choose Stripe's own bank-deposit cadence (`daily`/`weekly`/`manual`, via `accounts.update({settings.payouts.schedule})`). This is a separate, downstream layer from the platform's own transfer-into-Stripe-balance step above — UI copy should make that distinction clear to cooks.
- **Deferred:** instant payouts to debit card (~1.5% Stripe fee, not all Express accounts eligible) — intentionally not built yet; revisit once the sweep + reconciliation have run in production for a while.

**Verification:** the full chain (real cook signup → real application → real admin approval → real Stripe Connect test-mode onboarding via the hosted flow → real cash-out → real reconciliation of a seeded stuck payout → real auto-sweep) was run end-to-end locally against Stripe test-mode, each step confirmed with a real Stripe transfer ID. See [[Decisions]] and [[Changelog]].

## Subscriptions (meal plans) — implemented, app-controlled

Not Stripe-native recurring. `subscribe-plan`/`subscribe-box` create a subscription + first cycle; `charge-due-cycles` (cron, worker-secret auth) claims due cycles and charges off-session, with an attempt-counter in the idempotency key so retries use fresh keys. Legacy Stripe-native path (`create-subscription`/`manage-subscription`) is retired to 410 stubs.

## PrepPlus membership — implemented, Stripe-native recurring

$9.99/mo or $89/yr, 7-day trial (once per user). Lazily creates Product/Prices by lookup key. **Web-only entry point by IAP policy** — native surfaces are gated `Platform.OS==='web'`.

## Services marketplace (request → quote → deposit → balance) — implemented

`accept-quote-and-deposit` mints a deposit PaymentIntent via `accept_quote` (advisory lock + unique index prevents double-accept). `complete-booking` collects the balance off-session via `reserve_balance_charge`/`finalize_balance_charge`; the booking completes regardless of charge outcome, with failure surfaced separately (the job happened even if payment didn't clear).

## Experiences — implemented

`book-experience` → `create_experience_booking` RPC (atomic `FOR UPDATE` seat claim) → PaymentIntent confirmed client-side.

## Explicitly NOT implemented / placeholder

| Item | Status |
|---|---|
| Cash on delivery | **Placeholder.** Server hard-rejects (`400`); client still has full COD UI that never reaches payment, only local store state. |
| Escrow | Not implemented — see model above. |
| Connect webhooks | Not used — status is polled (`connect-status`), now also opportunistically refreshed by `reconcile-payouts` whenever it touches a kitchen. |
| Payout reconciliation job | **Implemented 2026-09-07** — see above. |
| Subscription/charge reconciliation job | Still does not exist — `charge-due-cycles` ambiguous errors are still manual only. |
| Instant payouts | Deferred — see above. |
| `create-subscription`/`manage-subscription` | Retired 410 stubs. |

## Related

- [[Project]] · [[Security]] · [[Backend]] · [[Tasks]] · [[Bugs]]
