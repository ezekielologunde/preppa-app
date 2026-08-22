---
project: Preppa
type: bugs
status: active
last_updated: 2026-08-22
tags: [project/preppa, type/bugs]
---

# Bugs

Part of [[Project]]. See [[Security]] and [[Payments]] for the security/payment-specific risk lists; this is the general known-issues ledger.

## Docs drift

- `README.md` still says "data and forms are illustrative demo content... don't hit a server" — **stale**. The app has been DB-backed and live-money since 2026-07-10/08-08.
- `LAUNCH-ACCOUNTS.md` shows all launch prerequisites unchecked, but Stripe was switched to live mode and EAS was linked on 2026-08-08 — the tracker was never updated.
- `SPRINT-27-FEED-VIDEO-PLAN.md` is an approved plan with **no corresponding commits** — the Cloudflare-Stream video slice it specifies was not built; a different, earlier Mux-based livestream feature (now flag-disabled) shipped instead.
- `docs/REDESIGN-DIRECTION.md` Slices 2–6 (Discover/Cart/Feed/Profile/Hub/Admin redesign) have no corresponding commits — only Slice 0–1 (foundation + Home) shipped.

## Confirmed open (from AUDIT.md)

- No rate limiting on state-mutating admin RPCs.
- No detection/alerting layer beyond `audit_log`.
- `main` has zero branch protection; Dependabot alerts disabled; no `CODEOWNERS`.
- `stripe-worker` has no HTTP method guard (low severity).
- `.gitignore` doesn't match Expo's `.env.production`/`.env.development` convention.
- Only 18 of 132 live migrations were vendored at audit time (base schema has no source-controlled history — see [[Database]]).
- Session tokens in AsyncStorage, not `expo-secure-store`; no password-reset flow.
- Google OAuth client secret exposure from a prior session — rotation unconfirmed.
- 11 moderate `npm audit` findings via a transitive `uuid` dependency (build tooling, not shipped runtime).

## Notable fixed incidents (kept for history)

- **2026-07-25**: a rate-limit hardening fix used a deprecated Postgres GUC this PostgREST version doesn't populate — every service-role Edge Function call 429'd for 10 days (2026-07-15→07-25); no orders were placed in that window. Fixed by switching to `auth.role()`.
- **`accept_quote()` ambiguous-column bug**: the sole quote→booking path had never worked for a real customer until fixed — caught only by live testing, not by any test suite (none exists).
- **2026-08-08**: real kitchens shared a placeholder cook id (`'maria'`), causing two different kitchens' cart items and money to merge into one Stripe Connect account. Fixed same day.
- **2026-08-08**: direct-to-Storage upload accepted HTML mislabeled as `image/png` — fixed by routing all uploads through the `upload-media` proxy.

## No environment/config separation

No `.env`/`app.config.ts` — every build (any branch, any profile) points at the same live Supabase project and live Stripe mode. This contradicts the `eas.json` preview/production profile split.

## Related

- [[Project]] · [[Security]] · [[Payments]] · [[Database]] · [[Tasks]]
