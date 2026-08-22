---
project: Preppa
type: backend
status: active
last_updated: 2026-08-22
tags: [project/preppa, type/backend]
---

# Backend

Part of [[Project]]. Edge Functions live in `supabase/functions/` (31 vendored dirs; `MANIFEST.md` tracks `verify_jwt` per function, a deployment-only setting). See also [[Database]], [[Payments]], [[Security]].

## Caller-verification patterns

1. **User-JWT via admin client** — `db.auth.getUser(jwt)`, ownership re-checked in DB. Most functions.
2. **User-scoped anon client** — `asUser(jwt)` so `auth.uid()` flows into RPCs that do their own ownership check. `connect-payout`, `accept-quote-and-deposit`, `book-experience`.
3. **Shared-secret worker auth** — for cron/webhook callers deployed with `verify_jwt:false`: `verify_worker_secret()` (`charge-due-cycles`, `send-push`), Bearer-token comparison against a vault secret (`stripe-worker`), HMAC signature (`mux-webhook`, `stripe-webhook`).

## Functions by group

- **Stripe sync** (`verify_jwt:false`): `stripe-webhook`, `stripe-worker`, `stripe-setup` — vendored ~1.1MB esbuild bundles of `@stripe/sync-engine` v1.0.32.
- **Orders/payments:** `create-order`, `payment-methods`, `connect-onboard`, `connect-status`, `connect-payout`.
- **RFQ:** `create-service-request`, `edit-service-request`, `submit-quote`, `accept-quote-and-deposit`, `complete-booking`, `cancel-booking`, `fulfill-plan-request`.
- **Subscriptions:** `plan-upsert`, `subscribe-plan`, `subscribe-box`, `charge-due-cycles` (cron), `create-subscription`/`manage-subscription` (**deprecated 410 stubs**, legacy path).
- **Experiences:** `experience-upsert`, `book-experience`, `cancel-experience-booking`, `cancel-experience-session`.
- **Membership:** `subscribe-prepplus`, `manage-prepplus`.
- **Live:** `live-start`, `live-end`, `mux-webhook`.
- **Push:** `send-push` — invoked by Postgres via `net.http_post`, not directly by the client.

## Not vendored (called by client, no source in repo)

`upload-media` (the sole storage write path — see [[Architecture]]) and `delete-account` (App Store 5.1.1(v) requirement). Both are unreviewable from this repo.

## Rate limiting

`check_rate_limit(action, max, window, subject)` called before Stripe on nearly every money path: `create-order` 20/10min, `payment-methods` per-action (`setup-intent` tightest at 6/10min — anti card-testing), `connect-payout`/`connect-onboard` 10/10min, `subscribe-plan`/`subscribe-prepplus` 10/10min, `complete-booking`/`accept-quote-and-deposit`/`book-experience` 15/10min. **Not yet applied to state-mutating admin RPCs** (`admin_suspend_kitchen`, `admin_set_user_role`) — open item, see [[Tasks]].

## Related

- [[Project]] · [[Database]] · [[Payments]] · [[Security]]
