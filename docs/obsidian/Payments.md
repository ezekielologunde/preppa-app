---
project: Preppa
type: payments
status: active
last_updated: 2026-08-22
tags: [project/preppa, type/payments]
---

# Payments

Part of [[Project]]. **Stripe is in LIVE mode** as of 2026-08-08. See also [[Security]], [[Backend]].

## Model: ledger + on-demand transfer, not escrow

Funds are **not held in Stripe escrow**. Cook earnings accrue as append-only `ledger_entries` rows (net of Stripe fee); `kitchen_balance_cents()` sums them; cash-out is a Stripe `transfers.create` to the cook's Connect Express account.

## One-off order (meals) — implemented, live

`create-order` re-prices server-side from DB `price_cents` (client never sends amounts), applies `SERVICE_FEE_BPS=1000` (10%), tip capped at $1000, requires kitchen `verified`+`open`+`payouts_enabled`. Confirmation: web new card → Stripe Elements; web saved card → `confirmCardPayment`; native → Stripe PaymentSheet with ephemeral key. A DB trigger `reconcile_paid_pi` creates order/ledger rows on settlement.

## Saved cards — implemented

`payment-methods` function: setup-intent, ephemeral-key, list, detach, default — every action re-verifies the PaymentMethod belongs to the caller's Stripe Customer before mutating.

## Connect payouts — implemented

`connect-onboard` creates an Express account (redirect URLs allowlisted to `app.preppa.live` only). `connect-payout`: `reserve_payout` (advisory lock, caller's JWT) → `transfers.create` with idempotency key and retry → `finalize_payout` (**service-role only**, so a cook can't self-confirm their own payout).

**Ambiguous-error handling (deliberate design):** a Stripe connection/timeout error during payout or subscription charging means the outcome is *unknown*. Rather than risk a double-payout by freeing the amount for retry, these paths return HTTP 202 and leave the row `pending`/`charging` for **manual reconciliation** — no automated reconciliation job exists yet. See [[Tasks]].

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
| Connect webhooks | Not used — status is polled (`connect-status`) instead. |
| Payout/charge reconciliation job | Does not exist — manual only. |
| `create-subscription`/`manage-subscription` | Retired 410 stubs. |

## Related

- [[Project]] · [[Security]] · [[Backend]] · [[Tasks]] · [[Bugs]]
