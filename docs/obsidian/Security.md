---
project: Preppa
type: security
status: active
last_updated: 2026-11-25
tags: [project/preppa, type/security]
---

# Security

## Stuck-payment sweep (web launch task 1.12, 2026-11-25)

`reconcile_paid_pi()` swallows its own errors and never runs if its trigger is missing, so a customer could be charged while the order, cycle or booking stays unpaid with no one told. `public.sweep_stuck_payments()` is the backstop. It is SECURITY DEFINER with `search_path` set to empty, every relation schema-qualified, execute revoked from public, anon and authenticated and granted to service_role only; pg_cron runs it every 5 minutes as `stuck-payment-sweep`. It holds no secret and makes no outbound request. It reads only `id`, `status`, `metadata` and the Stripe `created` time from `stripe.payment_intents`, and the alert and the per-PI `audit_log` row (action `anomaly_alerted`, entity `payment_intent`, kind `stuck_payment`) carry only the PaymentIntent id, the target kind and the target id from metadata: no amount, customer, email or card detail. A metadata id is cast to uuid only when it is well formed, so one bad row cannot stop the sweep. Dedupe is permanent per PaymentIntent through that audit row (indexed), and an advisory lock stops two runs alerting the same PI. An alert is never silently lost: the run counts the admins `notify_admins` reaches (its own predicate) and writes the dedupe rows only after confirming the call created a notification row for at least one of them; otherwise it returns `no_recipients` or `not_delivered`, writes nothing and the next run retries. `notify_admins` itself is unchanged. The scan window starts at the last successful run, stored in `public.stuck_payment_sweep_state` (RLS on, no policy, revoked from public, anon and authenticated), never less than 30 days back. One `notify_admins` call per run lists at most 20 ids plus a count, so a backlog does not send one email per PaymentIntent. It returns `no_stripe_mirror` where the Stripe mirror is absent, and the schedule is skipped where pg_cron is absent. Pinned by `tests/stuckPaymentSweep.test.ts`, which reads the metadata keys and paid markers from `reconcile_paid_pi()` and the recipient predicate from `notify_admins()` itself, and executed by `supabase/tests/stuck_payment_sweep_smoke.sql` in CI.

## Stripe reconcile triggers install loudly (web launch task 1.4, 2026-11-24)

Four applied migrations created the paid-order and membership triggers on the `stripe.*` mirror tables only if those tables already existed, so a project whose migrations ran before `stripe-setup` silently had none: the customer is charged, the order stays unpaid and nobody is told. `public.install_stripe_reconcile_triggers()` (SECURITY DEFINER, `search_path` pinned to empty, execute revoked from public, anon and authenticated, granted to service_role only) checks every target table and trigger function first and, if any is missing, raises one exception naming each trigger it cannot install and creates nothing. Otherwise it drops and recreates all four with their original timing, events and functions, then re-checks and raises if any is still missing. `public.check_stripe_reconcile_triggers()` (security invoker, same grants) returns the missing ones; a trigger counts as missing when its table is absent, it calls a different function, or it is disabled. `detect_system_health_issues()` now alerts admins, deduplicated hourly, while any `stripe.*` table exists and that list is non-empty. The migration calls the installer only when a `stripe.*` table exists, so a fresh database still migrates; the operator runs it after `stripe-setup` (L1 step 8). Pinned by `tests/stripeReconcileTriggers.test.ts`, which parses the four original trigger definitions from the applied migrations.

## Functions host from Vault for workers and push (web launch task 1.2, 2026-11-24)

No database function or cron job built by the migrations posts to the production host any more: `notify()` and the six HTTP workers resolve `project_base_url` || `/functions/v1/<fn>` from `vault.decrypted_secrets` at run time via `public.project_function_url(fn)` (security definer, `search_path ''`, execute revoked from public, anon and authenticated). The helper raises when the secret is missing, empty, not `https://`, or has a trailing slash, path or whitespace, and accepts only `[a-z0-9_-]` function names; there is no fallback to a literal. Applying the migration on a project with pg_cron calls it first, so a missing secret aborts the whole migration instead of the old `where exists` silent skip; a fresh local/CI stack without pg_cron schedules no workers and skips that check, as every other cron touch does. If the secret is removed later, worker runs fail (caught by the existing cron-failure alert) and `detect_system_health_issues()` raises two new alerts: `project_base_url_missing`, and `worker_not_running` for any of the six workers with no successful `cron.job_run_details` run in its window (15 minutes; `auto-payouts` 1 hour to 2 days after its Monday 14:00 UTC run, because run history is pruned at 3 days). A test project built from this history therefore cannot reach production through these paths (red-team finding "production-touch / exit-gate gaps"). The media URL allowlist still carries the literal (task 1.3). Pinned by `tests/vaultBaseUrl.test.ts`, which finds the hardcoded callers by scanning earlier migrations.
## verify_jwt versioned, production ref out of config.toml (web launch task 1.5, 2026-11-24)

`verify_jwt` was a deployment-only setting recorded only in `supabase/functions/MANIFEST.md`. `supabase/config.toml` now carries `[functions.<slug>] verify_jwt = false` for exactly the 10 functions the manifest marks false; each authenticates in code (worker secret, Vault bearer or signature). Every other function keeps the default `verify_jwt = true`. `tests/supabaseConfig.test.ts` fails if a manifest `false` row has no block, if a block disables JWT checks for a function the manifest marks true, or if a block names a missing function directory. `config.toml` no longer holds the production ref (red-team medium, tooling): `project_id` is the local stack name and the hosted ref comes from `supabase link`, `--project-ref` or `SUPABASE_PROJECT_ID`, so the committed file names no project.

## Media URL allowlist host from Vault (web launch task 1.3, 2026-11-24)

`public.is_allowed_media_url(text)` no longer hardcodes the production storage host, so a test or local project accepts its own storage URLs and not production's, and the L1 exit gate's `pg_proc.prosrc` check finds no production ref in it. The storage prefixes come from the Vault secret `project_base_url` (`https://<project-ref>.supabase.co`, no trailing slash) at call time and are matched with `starts_with`, so the base is never a LIKE pattern. If the secret is missing, empty or ends in `/` the function raises `is_allowed_media_url: Vault secret project_base_url ...` rather than allowing or denying everything. It is now SECURITY DEFINER (search_path still pinned to `public`) so anon, authenticated and service_role callers, and the CHECK constraints, can resolve the secret without direct Vault access; it returns only a boolean, and the base URL is public. STABLE replaces IMMUTABLE because the result depends on a Vault row. Grants are unchanged (CREATE OR REPLACE). Set `project_base_url` before deploying (DESIGN 4.2 step 1).

## Stripe key-mode and account guard in hand-written functions (web launch task 1.7, 2026-11-24)

The 26 hand-written Edge Functions that call `requireEnv('STRIPE_SECRET_KEY')` now enforce the 1.1g rule too (production host needs a live key, every other well-formed http(s) `SUPABASE_URL` a test key, missing or unparseable URL fails closed, then `GET /v1/account` must return `STRIPE_EXPECTED_ACCOUNT`). Each file carries one identical inline block between `BEGIN/END stripe-key-mode-guard-callers` markers; there is no shared module, matching the per-file `requireEnv` idiom. Two hooks use it: `requireEnv('STRIPE_SECRET_KEY')` runs the synchronous key-mode check and throws the fixed message `Stripe configuration check failed` at module load, so a mismatched key never constructs a Stripe client; and the first line of every `Deno.serve` handler, after the CORS preflight where there is one, awaits the account check and otherwise answers 500 `{"error":"Stripe configuration check failed"}` (with the function's CORS headers) before any auth, database or Stripe work. The cron and reconcile functions (`auto-payouts`, `charge-due-cycles`, `reconcile-*`) are gated the same way. Caching matches 1.1g: one shared in-flight lookup per isolate, a pass kept for the isolate's life, a failure cached 30 seconds, 10-second lookup timeout; refusals log one fixed reason and never the key, ref or account id. Pinned by `tests/stripeKeyModeCallers.test.ts`, which finds the callers by scanning for `requireEnv('STRIPE_SECRET_KEY')`, so a new caller without the block fails. With 1.1g this closes threat T8 (SECURITY-SPEC S8) for every function holding the Stripe key. Deploying any of the 26 requires `STRIPE_EXPECTED_ACCOUNT` on the project first, or the function answers 500.

## Stripe key-mode and account guard (web launch task 1.1g, 2026-11-24)

The vendored `stripe-setup`, `stripe-webhook` and `stripe-worker` wrappers read `STRIPE_SECRET_KEY` directly and bypass `requireEnv`, so each now carries an inline guard (identical block between `BEGIN/END stripe-key-mode-guard` markers) that runs before `StripeSync.create`. Only `SUPABASE_URL` exactly `https://fwidhpzwldneeaphrxgg.supabase.co` (the production host) accepts a live key; every other well-formed http(s) URL, including another project ref or a local stack such as `http://kong:8000`, needs a test key, and a missing or unparseable URL fails closed. It then checks `GET /v1/account` against the `STRIPE_EXPECTED_ACCOUNT` secret (key and account id trimmed first), caching a pass per isolate. Concurrent callers share one in-flight lookup, and after a failed check every call refuses without contacting Stripe for 30 seconds, so unauthenticated webhook traffic cannot drive a stream of Stripe lookups. Any failure, including a missing secret or URL, fails closed with a fixed 500 body that names no key, ref or account. `stripe-setup` checks it after the caller-secret check; `stripe-webhook` before signature verification, which is unchanged; `stripe-worker` at module load and, after a failure, again on later requests once the 30-second window ends; it creates `StripeSync` only after a pass and answers 500 with no vault query until then. This closes threat T8 for the vendored functions (SECURITY-SPEC S8); the hand-written `requireEnv` callers are task 1.7. Deploying requires `STRIPE_EXPECTED_ACCOUNT` on each project first, or the three functions return 500.

## Build-upload hardening — 2026-09-17

Removed `.easignore`, which contained only `.claude` and `.agents` and overrode the stronger `.gitignore`. EAS now falls back to `.gitignore`, preserving exclusions for local private keys (including `.p8`), environment files, generated output and local tooling. Added `.env.*` with example-file exceptions. Verified representative paths with `git check-ignore`. A local Git-ignored Apple `.p8` exists; contents were not read and historical upload exposure is unverified. [Expo's documented ignore precedence](https://docs.expo.dev/build-reference/easignore/) explains the risk. See [[Launch-Plan]] for current validation and remaining customer/security gates.

Native Supabase sessions now use Expo SecureStore (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`), backed by iOS Keychain and Android Keystore; web retains AsyncStorage because browsers have no equivalent OS credential vault. Password recovery now uses an emailed OTP with `shouldCreateUser: false`, then changes the password only after that OTP establishes an authenticated session. Expo SDK 57 dependencies were aligned with `expo install --fix`, removing all high-severity npm audit findings and the affected Hermes build; `expo-doctor` passes 21/21. Fourteen moderate transitive findings remain in the Expo toolchain/router graph.

CI now creates the production web bundle and scans it for Stripe secret/restricted key prefixes, private-key headers, the Supabase service-role environment name, and service-role JWT claims. Database regressions now assert that customer order, payment, ticket, ticket-message and message tables keep RLS and that order/ticket policies retain their ownership checks.

Development and preview EAS profiles now contain no production Supabase or Stripe values. The app requires isolated `EXPO_PUBLIC_*` configuration outside production and rejects production service values if supplied; CI checks the same invariant. Shared payment helpers still reject live-money operations outside the production native profile or exact `app.preppa.live` hostname. The external test project and Stripe test credentials remain to be provisioned.

Part of [[Project]]. Backed by the living `AUDIT.md`/`AUDIT_FULL.md` in the repo (23-agent fleet audit, last full pass 2026-07-14, verdict NO GO at the time; most Criticals since fixed). See also [[Database]], [[Backend]], [[Payments]].

## Authentication

- `src/lib/supabase.ts` — email OTP (unified sign-up/sign-in), email+password, Google OAuth (**web-only, currently disabled** — broke the Expo-web SPA with "OAuth state parameter missing").
- Native session tokens use `expo-secure-store`; web sessions use browser-backed AsyncStorage.
- Password reset is available from sign-in and requires an emailed OTP before the new password is saved.
- All auth calls wrapped in a 15s timeout guard. `ensureAuth()` throws before any payment/account action.

## Authorization

- Role enum on `profiles.role` (customer/prepper/admin). Client `isAdmin`/`prepperStatus` flags are **cosmetic only** — every privileged action is independently re-verified server-side (`is_admin()`, `is_active_kitchen_owner()`).
- Role self-escalation blocked by a trigger requiring an `app.privileged` session flag only set inside admin RPCs.
- Identity always derives from a verified JWT (`auth.uid()`), never a client-supplied ID or mutable `user_metadata`.
- RLS enabled on all 53 public tables (per audit); real authorization surface is the RPC layer (see [[Database]]).

## Secrets

- **No secret key committed** — repo-wide grep for Stripe/AWS/PEM patterns returned nothing; `git log --all` scan for the same (plus Resend/Mux/Google patterns) across full history also came back clean, 2026-09-08.
- `src/lib/supabase.ts` reads `EXPO_PUBLIC_*` values and permits production fallbacks only for the production build or `app.preppa.live`. Development and preview fail closed without isolated values, and `security:env` prevents their EAS profiles from containing the production Supabase project or a live Stripe key. On Vercel, `scripts/check-vercel-env.mjs` runs before the web export and fails a Preview build carrying production values (or missing values) and a Production build carrying test values. See [[Payments]] and [[Launch-Plan]] item 5.
- **Credential rotation — done 2026-09-08** (Launch-Plan item 4, previously open):
  - **Resend**: both Full-access API keys on the account revoked; replaced with a `Sending access`-only, `preppa.live`-domain-restricted key for Auth SMTP, verified with a real OTP send.
  - **Google OAuth**: added a new client secret (dual-secret zero-downtime rotation), updated Supabase's Google provider, disabled the old (Aug 8, 2026) secret.
  - **Mux**: old over-broad token (Data/Video/System/Robots) replaced with a `Mux Video`-only token; verified live via a temporary debug function (immediately stubbed to 410 after), old token revoked. `app/mux-preppa.env` has not reappeared.
- **Client bundle grep — done 2026-09-08**: a real `npx expo export --platform web` build was grepped end-to-end for `sk_live_`/`sk_test_`/`service_role`/Resend/Google/Mux secret patterns — zero hits. The one JWT embedded in the bundle decodes to `role: anon`, confirming the service-role key never ships client-side.

## Admin control hardening — implemented (2026-09-07)

- Rate limiting on state-mutating admin RPCs (`admin_suspend_kitchen`, `admin_reinstate_kitchen`, `admin_set_user_role`, `approve_kitchen`) — done **2026-07-15** via a shared `check_rate_limit()` primitive (10 actions/5 min per admin per action-type); this had been stale in this doc/[[Launch-Plan]] since.
- Real-time `notify_admins()` alerts added **2026-09-07** on every role change and kitchen suspension (previously only written to `audit_log`, no admin ever paged).
- `detect_admin_anomalies()` (pg_cron, every 15 min) added **2026-09-07**: role-escalation bursts (≥3 role changes by one admin/30 min), kitchen suspend/reinstate churn (≥3 toggles/24h), unusual refund volume (≥5 refunds/hour via the `stripe.refunds` mirror table), repeated payment failures (≥3 failed charges for one Stripe customer/hour via `stripe.charges`). Dedupes via an `anomaly_alerted` `audit_log` row per window so a 15-min tick doesn't re-alert on the same burst.
- `notify_admins()` also posts to an `admin_alert_webhook_url` Vault secret (Slack-compatible `{"text": ...}` payload) via `net.http_post` if one is set — not currently configured (no Slack workspace available), so this branch is inert.
- **Alert delivery activated via email instead — 2026-09-07.** A scoped, sending-only Resend API key restricted to the `preppa.live` domain was created and stored as `resend_admin_alerts_api_key`; `notify_admins()` now emails both admins (`preppa.live@gmail.com`, `ologundeomotola@gmail.com`) directly via Resend's API for every alert, verified live with a real test call (two HTTP 200s in `net._http_response`). `preppa.live` is DKIM/SPF-verified for **sending** in Resend (its inbound-MX/receiving config has an unrelated conflict that doesn't affect this).
- **Correction (2026-09-08):** a prior pass here flagged Supabase Auth SMTP as misconfigured to send from an unrelated Resend workspace (`mail.bagsly.co`). That was a false alarm — a generically-named `Supabase Auth SMTP` key in a *different* Google account's Resend workspace (belonging to an unrelated project, "Bagsly") coincidentally looked like it might be the one in use. Directly tested by triggering a real OTP via the Auth REST API: it sent successfully (`200`, verified in Resend's logs) from `"Preppa" <noreply@preppa.live>` through the correct, Preppa-owned Resend account. Auth SMTP was already correctly configured; no fix was needed.

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

## Private message attachments

2026-09-25: chat photos no longer reuse the public `avatars` bucket. New attachments are stored in the private `message-attachments` bucket under their thread ID. Only the customer, the kitchen owner, and dispute-review admins can request short-lived read links. The `upload-media` function verifies membership and creates the file and message as one operation, deleting the file if the RLS-guarded message insert fails. Direct image-message inserts are rejected, preventing external tracking-image URLs from bypassing upload validation. Conversation previews and notifications show `Photo` instead of the private object path. Existing public chat-photo URLs remain readable for compatibility.

## Related

- [[Project]] · [[Database]] · [[Backend]] · [[Payments]] · [[Bugs]] · [[Tasks]]
