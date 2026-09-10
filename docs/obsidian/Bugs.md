---
project: Preppa
type: bugs
status: active
last_updated: 2026-09-10
tags: [project/preppa, type/bugs]
---

# Bugs

Part of [[Project]]. See [[Security]] and [[Payments]] for the security/payment-specific risk lists; this is the general known-issues ledger.

## Fixed 2026-09-08

- **`safety@preppa.live` and `abuse@preppa.live` had zero mail routing** — Cloudflare Email Routing's catch-all is Drop, and no rule existed for either address, so any mail sent there was silently discarded. Compounding this, Email Routing itself was reporting **Disabled**/**Misconfigured** for the whole domain (missing SPF TXT record). Both fixed: added the SPF record, added routing rules for `safety@`/`abuse@` alongside the existing four addresses — all six now forward to a real monitored inbox. See [[Launch-Plan]] item 14.

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
- ~~Only 18 of 132 live migrations were vendored at audit time~~ — **fixed 2026-09-07**, full 212-migration history restored (see [[Database]]).
- Session tokens in AsyncStorage, not `expo-secure-store`; no password-reset flow.
- ~~Google OAuth client secret exposure from a prior session — rotation unconfirmed~~ — **rotated 2026-09-08**, see [[Security]] and [[Launch-Plan]] item 4.
- **Reviewed 2026-09-07, re-reviewed 2026-09-10** (count jumped 15 → 27, mostly a new `@xmldom/xmldom` disclosure cluster): all 27 open Dependabot alerts on `main` (`@xmldom/xmldom` x13, `browserslist` x2, `postcss` x2, `brace-expansion` x2, `nanoid` x2, `image-size` x2, `decode-uri-component`, `js-yaml`, `uuid`) traced via `npm ls` to the same Expo build/CLI toolchain as the first pass — `@xmldom/xmldom` and `postcss`/`browserslist` come through `expo-splash-screen`'s `xcode`→`plist` chain, `expo-updates`' `@expo/plist` and `glob`→`minimatch`→`brace-expansion`, and `expo`'s own `@expo/metro-config`; `babel-preset-expo`'s `browserslist` pull confirmed too. Every single one is a transitive **build-tool** dependency (native project generation, Metro bundling, Babel target resolution) — none run in the shipped JS bundle. All are DoS/ReDoS/prototype-pollution/path-traversal bugs requiring attacker-controlled input to a *build machine*, not something reachable by an end user of the live app. Left open — not worth forcing transitive version overrides against a pinned Expo SDK 57 dependency graph; revisit at the next Expo SDK upgrade.

## Notable fixed incidents (kept for history)

- **2026-07-25**: a rate-limit hardening fix used a deprecated Postgres GUC this PostgREST version doesn't populate — every service-role Edge Function call 429'd for 10 days (2026-07-15→07-25); no orders were placed in that window. Fixed by switching to `auth.role()`.
- **`accept_quote()` ambiguous-column bug**: the sole quote→booking path had never worked for a real customer until fixed — caught only by live testing, not by any test suite (none exists).
- **2026-08-08**: real kitchens shared a placeholder cook id (`'maria'`), causing two different kitchens' cart items and money to merge into one Stripe Connect account. Fixed same day.
- **2026-08-08**: direct-to-Storage upload accepted HTML mislabeled as `image/png` — fixed by routing all uploads through the `upload-media` proxy.
- **2026-09-07**: `kitchen_balance_cents()` used a deprecated `current_setting('request.jwt.claim.role')` check that never fires for a real `service_role` caller, so every worker/cron call (payout reconciliation, the new auto-payout sweep) saw balance 0 instead of the kitchen's real balance. Fixed to use `auth.role() = 'service_role'`, matching the pattern already used elsewhere for the same class of bug.
- **2026-09-07**: found an exposed Resend API key (`api-keys-*.csv`, full_access permission) sitting at the repo root, never committed to git but present on disk. Removed; flagged for rotation as a precaution — see [[Tasks]].
- **2026-09-08**: found and fixed during the auth test pass — `Alert.alert` (from `react-native`) is a documented no-op on `react-native-web`, so "Delete account" (`app/(tabs)/profile.tsx`) and the admin "Delete signup" (`app/admin/waitlist.tsx`, which is web-only-gated so had **no working fallback at all**) silently did nothing on web: no dialog, no API call, no error. Fixed with a new `src/lib/confirm.ts` (`window.confirm` on web, real `Alert.alert` on native) used by both call sites.

## No environment/config separation

No `.env`/`app.config.ts` — every build (any branch, any profile) points at the same live Supabase project and live Stripe mode. This contradicts the `eas.json` preview/production profile split.

## Related

- [[Project]] · [[Security]] · [[Payments]] · [[Database]] · [[Tasks]]
