---
project: Preppa
type: security
status: active
last_updated: 2026-09-07
tags: [project/preppa, type/security]
---

# Security

Part of [[Project]]. Backed by the living `AUDIT.md`/`AUDIT_FULL.md` in the repo (23-agent fleet audit, last full pass 2026-07-14, verdict NO GO at the time; most Criticals since fixed). See also [[Database]], [[Backend]], [[Payments]].

## Authentication

- `src/lib/supabase.ts` — email OTP (unified sign-up/sign-in), email+password, Google OAuth (**web-only, currently disabled** — broke the Expo-web SPA with "OAuth state parameter missing").
- Session tokens in **AsyncStorage, not `expo-secure-store`** (open Medium finding).
- No password-reset flow exists.
- All auth calls wrapped in a 15s timeout guard. `ensureAuth()` throws before any payment/account action.

## Authorization

- Role enum on `profiles.role` (customer/prepper/admin). Client `isAdmin`/`prepperStatus` flags are **cosmetic only** — every privileged action is independently re-verified server-side (`is_admin()`, `is_active_kitchen_owner()`).
- Role self-escalation blocked by a trigger requiring an `app.privileged` session flag only set inside admin RPCs.
- Identity always derives from a verified JWT (`auth.uid()`), never a client-supplied ID or mutable `user_metadata`.
- RLS enabled on all 53 public tables (per audit); real authorization surface is the RPC layer (see [[Database]]).

## Secrets

- **No secret key committed** — repo-wide grep for Stripe/AWS/PEM patterns returned nothing.
- `src/lib/supabase.ts` reads `EXPO_PUBLIC_*` env vars (Supabase URL/anon key, Stripe publishable key) with a same-value fallback to the live literals; `eas.json` has a per-profile `env` block. **Mechanism only** — all three profiles (`development`/`preview`/`production`) still point at the same live project/key as of 2026-09-07. See [[Payments]] and [[Launch-Plan]] item 5.
- Historical: an unused Mux token pair at `app/mux-preppa.env` was flagged, never committed, not present in current checkout.
- **Open, unconfirmed:** a prior-session Google OAuth client secret exposure (Critical #16) — rotation status unconfirmed.

## Admin control hardening — implemented (2026-09-07)

- Rate limiting on state-mutating admin RPCs (`admin_suspend_kitchen`, `admin_reinstate_kitchen`, `admin_set_user_role`, `approve_kitchen`) — done **2026-07-15** via a shared `check_rate_limit()` primitive (10 actions/5 min per admin per action-type); this had been stale in this doc/[[Launch-Plan]] since.
- Real-time `notify_admins()` alerts added **2026-09-07** on every role change and kitchen suspension (previously only written to `audit_log`, no admin ever paged).
- `detect_admin_anomalies()` (pg_cron, every 15 min) added **2026-09-07**: role-escalation bursts (≥3 role changes by one admin/30 min), kitchen suspend/reinstate churn (≥3 toggles/24h), unusual refund volume (≥5 refunds/hour via the `stripe.refunds` mirror table), repeated payment failures (≥3 failed charges for one Stripe customer/hour via `stripe.charges`). Dedupes via an `anomaly_alerted` `audit_log` row per window so a 15-min tick doesn't re-alert on the same burst.
- `notify_admins()` now also posts to an `admin_alert_webhook_url` Vault secret (Slack-compatible `{"text": ...}` payload) via `net.http_post` if one is set — **not yet configured**, so today alerts still only reach the in-app inbox/push. Needs a real Slack incoming-webhook URL (or equivalent) from the user; see [[Launch-Plan]] item 7.

## Known open risks

- `main` branch protection (required status checks, force-push/deletion blocking), Dependabot alerts, and `CODEOWNERS` — all **done 2026-09-07**, see [[Decisions]]. PR-required review deliberately still deferred (single-contributor repo).
- Wildcard CORS on every Edge Function (lower risk — auth is Bearer-JWT, not cookies).
- No regression test suite beyond the DB-level `supabase/tests/regressions.sql`; CI is `tsc --noEmit` + DB regressions only, zero JS/TS tests.
- Ambiguous Stripe error handling on subscription charging (`charge-due-cycles`) is still manual-only — the payout equivalent was closed by the reconciliation system, see [[Payments]].
- Full 212-migration history now vendored (was 18 of 132 at original audit time) — see [[Database]].

## Verified solid (worth preserving)

Webhook signature verification real and fail-closed (Stripe + Mux); service-role key never in client code (confirmed by grep, 21 Edge Functions use it server-side only); no first-party SQL injection surface found; zero secrets in git history.

## Upload security incident (fixed)

2026-08-08: direct-to-Storage uploads validated only the client-declared `Content-Type`; raw HTML uploaded as `image/png` was accepted and served back with that type. Fixed by routing all uploads through `upload-media`, which sniffs magic bytes; Storage write policies dropped for the 4 affected buckets.

## Related

- [[Project]] · [[Database]] · [[Backend]] · [[Payments]] · [[Bugs]] · [[Tasks]]
