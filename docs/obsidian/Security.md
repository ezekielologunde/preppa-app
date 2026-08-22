---
project: Preppa
type: security
status: active
last_updated: 2026-08-22
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
- Public-by-design values hardcoded in `src/lib/supabase.ts`: Supabase URL, Supabase anon key, Stripe **live** publishable key. No `.env`/staging separation exists — see [[Bugs]].
- Historical: an unused Mux token pair at `app/mux-preppa.env` was flagged, never committed, not present in current checkout.
- **Open, unconfirmed:** a prior-session Google OAuth client secret exposure (Critical #16) — rotation status unconfirmed.

## Known open risks (from AUDIT.md, confirmed still open at last pass)

- No rate limiting on state-mutating **admin** RPCs (suspend kitchen, set user role).
- No detection/alerting layer beyond `audit_log` — two ready SQL queries exist, nothing routes them anywhere.
- `main` branch has **zero branch protection**; Dependabot alerts disabled; no `CODEOWNERS`.
- Wildcard CORS on every Edge Function (lower risk — auth is Bearer-JWT, not cookies).
- No regression test suite; CI is `tsc --noEmit` only.
- Ambiguous Stripe error handling on payouts/charges — see [[Payments]].
- Only 18 of 132 live migrations vendored at audit time — see [[Database]].

## Verified solid (worth preserving)

Webhook signature verification real and fail-closed (Stripe + Mux); service-role key never in client code (confirmed by grep, 21 Edge Functions use it server-side only); no first-party SQL injection surface found; zero secrets in git history.

## Upload security incident (fixed)

2026-08-08: direct-to-Storage uploads validated only the client-declared `Content-Type`; raw HTML uploaded as `image/png` was accepted and served back with that type. Fixed by routing all uploads through `upload-media`, which sniffs magic bytes; Storage write policies dropped for the 4 affected buckets.

## Related

- [[Project]] · [[Database]] · [[Backend]] · [[Payments]] · [[Bugs]] · [[Tasks]]
