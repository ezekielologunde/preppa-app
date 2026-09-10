---
project: Preppa
type: launch-plan
status: active
last_updated: 2026-09-07
tags: [project/preppa, type/launch-plan]

---

# Launch Plan

Part of [[Project]]. The concrete "turn the working application into an operational business" checklist — as distinct from [[Tasks]] (engineering backlog) and [[PM-Onboarding]] (narrative tour). Items below are marked verified where checked directly against live state on 2026-09-07; everything else is proposed and unverified until someone checks it off for real.

## Current state (verified 2026-09-07)

- ✅ `preppa-app`/`main` is the canonical production app/backend repo (see [[Decisions]] for the repo-provenance resolution).
- ✅ CI is fully green: `typecheck` passes, all 212 migrations replay and `supabase/tests/regressions.sql` passes.
- ✅ CI runs Node 22.
- ✅ Vercel production deployment for `preppa-app` is `READY`.
- ✅ `preppa.live` is reachable — confirmed live, currently shows "LAUNCHING SOON" with an email-capture waitlist form.
- ✅ `help.preppa.live` is reachable with a real help center (guides + legal pages) — **but every legal page is explicitly marked "draft pending legal review"** at the top, per the site's own "Legal & Compliance" section. Not lawyer-final.
- ✅ **Stripe is confirmed LIVE mode**, not test — `STRIPE_SECRET_KEY` is `sk_live_...`, matching the client's hardcoded `pk_live_...`. See [[Payments]]. This was the single biggest open question from earlier in this doc's history and is now closed: real cards get charged on this project today.
- ✅ Payout reconciliation, manual cash-out, weekly auto-payout, and Stripe Express bank management are implemented and were verified end-to-end (locally, test-mode) — see [[Payments]] and [[Changelog]].
- ✅ EAS profiles exist (`development`/`preview`/`production`) in `eas.json`; an `ascAppId` (`6802527112`) is already configured under `submit.production.ios`, meaning an App Store Connect app entry likely already exists — worth confirming its actual state rather than assuming it needs creating from scratch.
- ✅ iOS bundle ID `live.preppa.app`, Android package `live.preppa.app` — consistent across `app.json`.

## P0 — must finish before accepting real customers

### 1. Stripe mode — CLOSED, see above
No longer an open item. Record: production is live-mode Stripe. Treat any casual testing against this project as real-money testing.

### 2. Run one controlled real-money transaction
Not yet done. Use one trusted cook + one trusted customer, real card, small amount:

- [ ] Full flow: signup → cook application → admin approval → Stripe Connect onboarding → menu → checkout → real charge → order → fulfillment → ledger credit → cash-out → real Stripe transfer → payout received → review.
- [ ] Refund a second controlled order.
- [ ] Cancelled order.
- [ ] Failed card.
- [ ] Payout below the $20 auto-payout minimum (should not auto-sweep; manual cash-out still available per [[Payments]]).
- [ ] Force a reconciliation case (e.g. by simulating a Stripe ambiguous error) and confirm `reconcile-payouts` resolves it.
- [ ] Verify no duplicate ledger entries.
- [ ] Verify fee math (service fee %, Stripe processing fee, cook payout) end to end.

**Pass condition:** one real dollar traceable customer → Preppa → cook, start to finish.

### 3. Stripe Connect onboarding on real phones
The native `?connect=return`/`?connect=refresh` deep-link path is proven on web only (see [[Payments]] and [[Tasks]]) — not yet tested on a real iPhone/Android device.

- [ ] iPhone: leave app → Stripe identity verification → return → status refreshes.
- [ ] Android: same.
- [ ] Expired onboarding link triggers `refresh` correctly.
- [ ] Earnings screen reflects `payoutsEnabled` promptly after return.
- [ ] Bank-management link (`connect-dashboard-link`) opens the real Stripe Express dashboard on-device.

## P0 — security before launch

### 4. Rotate exposed/uncertain credentials — done 2026-09-08
- [x] ~~Rotate the Resend API key found exposed at the repo root~~ — since the exposed CSV was gone, rotated **both** Full-access Resend keys on the account as a precaution: created a new `Sending access`-only, `preppa.live`-domain-restricted key (`preppa-supabase-smtp`), swapped it into Supabase Auth SMTP, verified with a real OTP send (`200`, logged), then deleted both old Full-access keys (`preppa`, `Preppa email`).
- [x] ~~Confirm the Google OAuth client secret rotation~~ — added a new client secret in Google Cloud Console (zero-downtime dual-secret rotation), pasted it into Supabase's Google provider config, saved, then disabled the old (Aug 8, 2026) secret.
- [x] ~~Rotate the Mux token~~ — old token (`preppa`, created Jul 13 2026, over-broad Data/Video/System/Robots scope) replaced with a new `Mux Video`-only token; updated the `MUX_TOKEN_ID`/`MUX_TOKEN_SECRET` Edge Function secrets, verified live via a temporary debug function (`200` from Mux's API, function then stubbed to 410), then revoked the old token.
- [x] ~~Search git history (not just the working tree) for secrets~~ — `git log --all` filename + content scan for `.env`/key/secret patterns (Stripe, Resend, Google, PEM keys) found nothing real; a handful of `re_*` matches were all SQL/JS identifiers (`re_requirements_*` etc.), not Resend keys.
- [x] ~~Confirm `SUPABASE_SERVICE_ROLE_KEY` and `STRIPE_SECRET_KEY` never ship client-side~~ — **done 2026-09-08**: ran a real `npx expo export --platform web` and grepped the full built output (`_expo/static/js/web/*.js`) for `sk_live_`/`sk_test_`/`service_role`/Resend/Google/Mux secret patterns — zero hits. The single JWT embedded in the bundle decodes to `{"role":"anon",...}`, confirming it's the anon key, not the service-role key.

### 5. Separate production from development
Confirmed real gap: there is one Supabase project and one live Stripe key for every environment (dev, preview, production all point at the same live backend). No `.env`/staging split existed.

- [x] ~~Wire the app to read config from `EXPO_PUBLIC_*` env vars instead of hardcoded literals~~ — **done 2026-09-07**. `src/lib/supabase.ts` now reads `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY`/`EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`, falling back to today's live values so behavior is unchanged. `eas.json` now has an explicit `env` block per build profile (`development`/`preview`/`production`) instead of one hardcoded source of truth.
- [ ] **Dev Supabase project — blocked on cost.** Creating a second project on this org (already Pro plan) costs $10/mo recurring; declined for now. All three `eas.json` profiles currently point at the **same live project/keys** — the plumbing is ready, but there is *no actual separation yet*. A preview build today can still create a real order.
- [ ] Stripe test keys for dev/preview builds — blocked on the item above (needs a project to attach them to, or at minimum a Stripe test secret key to configure).
- [ ] Live Stripe keys reserved for production only — not yet true; see above.
- [ ] Separate Resend config per environment — out of scope this round.
- [x] ~~EAS dev/preview/production env vars actually differ~~ — **mechanism exists** (each profile has its own `env` block), **but values are currently identical across all three** pending the item above.

**Next step whenever ready:** create the dev Supabase project (accept the $10/mo), apply all migrations + deploy edge functions to it (same process used to restore/verify the main project this session), then swap `development`/`preview`'s `env` values in `eas.json` (and optionally add a root `.env` for safe-by-default local `npx expo start`) to point at it instead of production. No further app code changes should be needed — that's the whole point of this wiring.

**Rule of thumb:** a developer running a preview build should not be able to accidentally create a real paid order.

### 6. Protect `main`
- [ ] Enable branch protection.
- [x] ~~Require CI before merge~~ — **done 2026-09-07**: both `typecheck` and `db-regression-tests` are now required status checks on `main`.
- [x] ~~Block force pushes~~ — already enabled (confirmed 2026-09-07; deletions blocked too).
- [ ] Require PRs — deliberately deferred: enforcing this (and `enforce_admins`) would block direct pushes entirely, including how work has shipped in this repo so far. Revisit once there's more than one contributor.
- [x] ~~Review Dependabot alerts~~ — **done 2026-09-07**. All 15 (10 high, 5 moderate) traced to Expo's own build/CLI toolchain (Babel, Metro, Xcode project generation via `expo-splash-screen`/`expo-updates`), none reachable from the shipped app bundle. Deliberately left open rather than forcing transitive overrides against pinned Expo SDK 57 — see [[Bugs]]. Revisit at the next Expo SDK upgrade.
- [x] ~~Add `CODEOWNERS`~~ — **done 2026-09-07**, `.github/CODEOWNERS` assigns `@ezekielologunde` as default owner. Currently inert (no effect until PR reviews are required) but ready for when that changes.
- [x] ~~Secret scanning + dependency scanning~~ — **confirmed already enabled 2026-09-07**: `secret_scanning`, `secret_scanning_push_protection`, and `dependabot_security_updates` were all already on for this repo. `secret_scanning_validity_checks` is off and an API attempt to enable it didn't take — likely a GitHub Advanced Security feature not available on a personal free-tier public repo; not pursued further.

### 7. Harden admin controls
- [x] ~~Rate-limit `admin_suspend_kitchen`, `admin_set_user_role`~~ — was actually **already done 2026-07-15** (this checklist item was stale); confirmed and left unchanged 2026-09-07.
- [x] ~~Alert on: role changes, kitchen suspension, unusual refunds, payout `needs_review`, repeated payment failures~~ — **done 2026-09-07**. Role changes and kitchen suspensions now `notify_admins()` immediately; `detect_admin_anomalies()` (pg_cron, every 15 min) catches role-escalation bursts, kitchen suspend/reinstate churn, unusual refund volume, and repeated payment failures against `audit_log` and the `stripe.charges`/`stripe.refunds` mirror tables. Payout `needs_review` alerting already existed. See [[Security]] and [[Payments]].
- [x] ~~Route those alerts to a real destination~~ — **done 2026-09-07, via email not Slack.** No Slack workspace was available; a scoped, sending-only Resend API key (restricted to the `preppa.live` domain, which is DKIM/SPF-verified for sending — its inbound MX has a separate unrelated conflict) was created and stored as the `resend_admin_alerts_api_key` Vault secret. `notify_admins()` now emails every admin (`preppa.live@gmail.com`, `ologundeomotola@gmail.com`) directly via Resend's API in addition to the in-app notification. Verified live: a real test alert produced two HTTP 200s from Resend (`net._http_response`). The Slack-webhook branch (`admin_alert_webhook_url` secret) is still there and still inert — either or both can be active at once.
- **Related, investigated 2026-09-08 — false alarm.** A suspicion that Auth SMTP sends OTP/signup email through an unrelated Resend workspace turned out to be wrong: a real OTP send confirmed it already correctly sends from `noreply@preppa.live` via the right account. No fix needed; see [[Security]] and [[Tasks]].

## P0 — cook supply

### 8. Recruit Cohort 0
The actual launch blocker, per [[PM-Onboarding]]. Target 5-10 cooks, not fifty.

Funnel: Contacted → Interested → Signed up → Applied → Approved → Stripe verified → Menu published → Kitchen open → First paid order → First payout.

- [ ] 10 serious candidates.
- [ ] 5+ fully approved.
- [ ] 5+ Stripe payout-ready.
- [ ] ≥3 menu items per cook, real photos, real pricing, fulfillment/hours configured.

## P0 — cook compliance

### 9. Pick one launch geography
Do not launch nationwide. One city/metro, one defined service radius. Then, for that specific jurisdiction: cottage-food rules, home-kitchen restrictions, allowed vs. commercial-kitchen-only foods, food-handler requirements, permits, labeling, allergen disclosure, sales tax, insurance. The app's food-handler cert field is self-reported and unverified against any registry (see [[PM-Onboarding]]) — compliance here is entirely an ops/legal responsibility, not something the code checks.

### 10. Admin approval SOP
For Cohort 0, do this manually per cook: identity, cert (where applicable), kitchen/fridge photos, Cook Agreement, address, Stripe Connect complete, menu review (allergens, pricing sanity). Automate later, once there's a real problem worth automating.

## P0 — customer experience

### 11. Kill fake/dead surfaces before public launch
- [x] ~~Cash on delivery — backend hard-rejects it; hide the UI entirely~~ — **done 2026-09-08**. Checkout itself (`app/checkout.tsx`) turned out already COD-free (Stripe-only, a prior fix). The real dead-end was `app/payments.tsx`: a static "Cash on delivery — **Always on**" card, plus empty-state copy inviting users to "pay cash on delivery" — both false, since the server 400s any `method: 'cod'` order. Removed both. **Not done this round** (lower priority, confirmed dead-but-harmless, not user-facing): leftover `cod`-branch code in `track.tsx`, `order/[id].tsx`, `(tabs)/orders.tsx`, `hub/order/[id].tsx`, `Handoff.tsx`, `store.tsx`'s `OrderFlow` type, `Cook.acceptsCod` in `data.ts`, and a demo chat line in `chat/[cook].tsx` ("Cash on delivery is fine?") — none of these are reachable from the current checkout flow, so no user can actually trigger them, but they're worth a follow-up cleanup pass.
- [x] ~~Rewards/referrals — already flag-disabled~~ — confirmed 2026-09-08: `FLAGS.rewards = false`, and `app/rewards.tsx` itself redirects home when the flag is off (a prior audit fix) — no leftover reachable entry point found anywhere else in the app.
- [x] ~~Livestreaming — already flag-disabled~~ — confirmed 2026-09-08: `FLAGS.live = false`, and all 4 consumer sites (`hub/go-live.tsx`, `store/[cook].tsx`, `store/[cook]/live.tsx`, `(tabs)/feeds.tsx`) gate on it correctly, plus a separate server-side `LIVE_ENABLED` kill switch independent of the client flag. No leftover entry point found.
- [x] ~~"Coming soon" quotes-payment UI~~ — **turned out to be already stale/fixed**, not an open item. A repo-wide search found no "coming soon" copy anywhere near quotes/service-request payment; both `app/discover.tsx` (Services tab) and `app/request/[id].tsx` already call the real `acceptQuoteAndDeposit()` → real `CardPaymentSheet` deposit charge. [[Features]] and [[Tasks]] corrected to remove the stale claim.
- [x] ~~No demo/seed data reachable as if real inventory~~ — **done 2026-09-08**, database side closed; client-side cleanup deferred (see [[Tasks]]). The 6 hardcoded seed cooks in `src/data/data.ts` mapped via `KITCHEN_ID` to 6 real production `kitchens` rows (`verification_status = 'pending'`, 9 `meals`, and — discovered only when attempting cleanup — **30 real orders and 55 ledger entries**, all traced to dev/admin/test accounts, no real customers). Confirmed never customer-reachable (RLS requires `verified`). **Full deletion turned out to be impossible**: `ledger_entries` (all 6 kitchens), `subscription_events` (kitchen 1), and `messages` (kitchens 1, 6) are deliberately append-only tables — every delete attempt correctly rolled back rather than silently succeeding. Instead, set all 6 kitchens to `verification_status = 'rejected'` + `availability = 'paused'` with a documented `rejection_reason`, permanently un-orderable, with all history preserved. Removing the now-dead `COOKS`/`KITCHEN_ID` client fallback code itself is deferred — see [[Tasks]] for why (touches a non-optional field real meals also flow through).

## P0 — authentication

### 12. Full auth test pass — done 2026-09-08 (web); native still open
Tested live against production (disposable `@mailinator.com` test accounts, cleaned up after) via a local `expo start --web` dev client, all against the real Supabase Auth backend:
- [x] Signup with password — auto-confirmed, session created immediately, profile row created via `handle_new_user`.
- [x] Signup with email OTP — code delivered, real code retrieved from the mailinator inbox and verified.
- [x] Wrong password — clean, non-crashing error ("Wrong email or password...").
- [x] Wrong OTP code — clean error, input cleared for retry.
- [x] Resend OTP — cooldown timer shown, new code delivered.
- [x] Login with correct password — direct to app, no re-onboarding.
- [x] Logout — clean return to the welcome/sign-in screen.
- [x] Session restore — reloading the page kept the session (AsyncStorage/localStorage-backed persistence working as designed).
- [x] Account deletion (backend) — invoked `delete-account` directly: soft-deletes the auth user (`deleted_at` set, `encrypted_password` cleared), anonymizes the email to an opaque hash. A follow-up authenticated call with the same (now-deleted) session correctly gets `401`.
- [~] OTP expiry — not waited out live (Supabase's default window is long); code-reviewed instead: an expired code hits the exact same `verifyOtp` error path as a wrong code, so the wrong-code test above covers the user-facing behavior.
- [~] Suspended account — verified by code inspection rather than a live fixture: `verification_status = 'suspended'` (kitchen suspension) has zero references in any client-side auth/session gate, so a suspended cook can still sign in fully — only kitchen-specific screens/actions are blocked. Matches the documented "suspension ≠ ban" design.
- [ ] Native (iOS/Android) pass — not done this round, web only. `Alert.alert` (see bug below) behaves correctly on native, so the one bug found here is web-specific, but the full flows haven't been re-run on-device.

**Real bug found and fixed**: `Alert.alert` (from `react-native`) is a documented no-op on `react-native-web` — clicking "Delete account" produced **no dialog and no API call whatsoever** on web, silently. The exact same pattern existed in the admin waitlist's "Delete signup" (which is web-only-gated, so that one was fully broken in production with no native fallback). Added `src/lib/confirm.ts` (`window.confirm` on web, real `Alert.alert` elsewhere) and switched both call sites to it. Verified fixed: the dialog now fires with the correct copy and, on accept, correctly calls the delete API.

[[Bugs]] already flags session tokens in AsyncStorage (not `expo-secure-store`) and no password-reset flow as open (password auth exists but has no "forgot password" recovery flow yet).

## P0 — legal/store compliance

### 13. Legal pages
`help.preppa.live` has real pages for Privacy, Terms, Refunds, Food Safety, Allergen Policy, Accessibility, Cook Agreement, Independent Prepper Standards — **but the site itself says these are drafts pending legal review.** Get actual legal sign-off before public launch; don't treat "the pages exist" as "the pages are ready." No dedicated account-deletion page was found in the help center listing — needed for store compliance (Apple 5.1.1(v)); confirm and add if missing.

## P0 — support and email

### 14. Verify every transactional email actually delivers
- [x] **Support/safety/abuse inbox routing — fixed 2026-09-08, was genuinely broken.** Checked Cloudflare Email Routing (the domain's actual MX provider) directly: routing status showed **Disabled** and DNS records **Misconfigured** — a required SPF TXT record (`v=spf1 include:_spf.mx.cloudflare.net -all`) was missing entirely. Worse, **`safety@` and `abuse@preppa.live` had no routing rule at all** — the catch-all is set to Drop, so mail to those two addresses was being silently discarded, not delivered anywhere. Fixed both: added the missing SPF record (additive, Cloudflare's own "Add missing records" action) and created routing rules for `safety@`/`abuse@`, matching the other four (`info@`/`privacy@`/`support@`/`hello@`) — all six now forward to a real, monitored inbox. DNS was still propagating ("Syncing") as of this fix; should clear on its own.
- [x] **Signup/OTP email — already verified working**, see item 12 (real OTP sends confirmed via Resend, `200` logged).
- [~] **Everything else on this list is not actually email — important scope correction.** Checked every Edge Function for outbound email calls: cook application received/approved/rejected, Stripe setup reminder, order lifecycle, cancellation, refund, and payout initiated/completed/needs-review all go through `notify()` only — an **in-app notification + push**, never an email. This isn't a delivery bug to fix; it's that the underlying feature (transactional email for these events) was never built. The checklist's premise assumed it existed. Two real options going forward: (a) treat in-app/push as the actual channel for these and drop the "email" framing, or (b) build real email sending for them using the now-proven Resend integration (the `preppa.live` domain, DKIM/SPF-verified for sending, and a scoped API key already exist from the admin-alerts and Auth-SMTP work). Neither built this round — needs a product decision on which events genuinely need email vs. in-app is enough.
- [ ] Push notification delivery to a real device is unverified — the send-push Edge Function and push_tokens table exist, but no live device token was tested this session.
- [ ] "Support ticket" and "safety report" submission-confirmation notifications specifically — not traced to a call site this round; only the inbox-routing half (this item) was checked.

## P0 — monitoring

### 15. Launch dashboard
- [x] ~~Money + marketplace metrics~~ — **done 2026-09-08**. Added `admin_dashboard_metrics()` (same `SECURITY DEFINER` + `is_admin()`-gated pattern as the existing `admin_*` RPCs) and a new Admin → Dashboard screen (`app/admin/dashboard.tsx`): GMV, orders, payment success rate, refund volume, payout pipeline (pending/needs-review/paid), all-time ledger balance, fulfillment rate, active (verified) cooks, and live meal count. Stripe-derived fields (payment success rate, refund volume) degrade to `null` where the Stripe-sync schema doesn't exist (local/CI). **Caught a real bug while verifying against production**: `live_meals_count` initially counted the 6 now-permanently-rejected seed kitchens' dead `status='live'` meal rows as if they were real inventory (rejecting a kitchen doesn't cascade to its meals' own status) — fixed to join through kitchen verification; confirmed live it now correctly reads 0, matching 0 verified kitchens today.
- [x] ~~System health~~ — **partially done 2026-09-08**, the DB-observable half. `detect_system_health_issues()` (pg_cron) alerts via `notify_admins()` on (1) `cron.job_run_details` showing a scheduled job's SQL statement actually failed, and (2) `net._http_response` showing a real outbound HTTP failure (5xx or timeout) from any `pg_net` call. **Not covered, deliberately**: Vercel deploy status and Stripe webhook delivery failures live entirely outside this database — both platforms already have their own native alerting for free; recommend turning those on directly rather than building a custom poller for comparatively little gain.
  - **Real incident, fixed 2026-09-09**: two genuine "Outbound request failures" alerts fired (16:00, 16:15 UTC) — a real `pg_net` 5000ms timeout, not a false positive, but not a business-critical failure either: every payment/payout/subscription job's own run succeeded both times (checked `cron.job_run_details` directly). Root cause was self-inflicted — `detect-admin-anomalies` and `detect-system-health-issues` were both scheduled `*/15 * * * *`, landing on the exact same tick as four `*/5 * * * *` jobs plus the every-minute `stripe-sync-worker`, up to 6 concurrent `net.http_post` dispatches at once. Fixed by offsetting both to minutes 7/22/37/52. Also found and fixed a related latent issue while investigating: `cron.job_run_details` had grown to 112,440 rows since 2026-07-07 with zero retention (pg_cron never prunes it, and the project role doesn't own the table so it can't be indexed either) — added a daily prune job (3-day retention), shrinking it to ~8,000 rows immediately. See [[Decisions]].

## P1 — native app launch

### 16. Apple App Store
An `ascAppId` is already configured (`6802527112`) — **verify what that actually points to** before assuming setup starts from zero. Then: distribution cert, push entitlement, associated domains/deep links, production EAS build, TestFlight, screenshots/description/privacy disclosures, support/privacy URLs, account deletion, review notes.

### 17. Google Play
Verify actual account/app status rather than trusting `LAUNCH-ACCOUNTS.md` (already known stale, per [[Bugs]]) — it shows everything unchecked despite EAS being linked and Stripe going live back in August.

## P1 — real-device QA

### 18. Device matrix
iPhone (current + older supported), Android (Pixel/Samsung), iPad, desktop Chrome/Safari, mobile Safari/Chrome. Specifically: camera, photo picker, location, push, Stripe PaymentSheet, deep links, keyboard handling, dark mode, accessibility, bad network / offline recovery, background/resume.

## P1 — marketplace operations

### 19. Launch playbook
Someone (can be one person for Cohort 0) needs to explicitly own: cook approval queue, safety reports, disputes, refund decisions, payout reviews, food complaints, late/no-show orders, fraud, suspension, emergency escalation. Document it as a role, not tribal knowledge.

## P1 — marketing launch

### 20. Replace "Launching soon"
Confirmed still live on `preppa.live` as of 2026-09-07. Once Cohort 0 is actually orderable: swap the waitlist CTA for "Order on Preppa," link to `app.preppa.live`, add "Become a Prepper," show the real launch city and actual available cuisines (not placeholder chips), add store badges once approved.

## P1 — launch metrics

### 21. Cohort-0 dashboard
Track daily: approved cooks (target 5-10), Stripe-ready cooks (≥90%), approved cooks with a live menu (≥80%), paid completed orders (first 25), successful payouts (100%), unresolved critical money/support incidents (0). Plus two funnels — customer (visit → signup → meal view → cart → checkout → paid → completed → review → reorder) and cook (contact → apply → approved → Stripe → menu → live → order → completed → paid).

## What does NOT need to block launch

Rewards, referrals, livestreaming, Meal Drops, instant payouts, fancy analytics, fully automated cook verification, a full redesign, cash on delivery, nationwide expansion, AI features, perfected feed/video. All flag-off or deferred already — leave them that way.

## Recommended order

1. ~~Confirm Stripe live/test mode~~ — done, confirmed live.
2. Rotate outstanding secrets.
3. Separate production/dev environments.
4. Complete one real-money E2E transaction + one real payout.
5. Real-device Stripe Connect onboarding test.
6. Final legal/compliance review for the chosen launch city (get the draft legal pages signed off).
7. Recruit 5-10 cooks; approve + Stripe-onboard them; publish real menus.
8. Hide unfinished/dead-end features; verify auth + email + support flows.
9. Set up monitoring + alerts.
10. Verify Apple/Google developer account state (don't assume from scratch); build + TestFlight/internal test.
11. Closed beta (10-25 customers); 25 successful orders; confirm payouts/refunds/support hold up.
12. Replace "Launching soon"; submit to both stores; public launch.

## Related

- [[Project]] · [[PM-Onboarding]] · [[Payments]] · [[Tasks]] · [[Bugs]] · [[Decisions]] · [[Changelog]]
