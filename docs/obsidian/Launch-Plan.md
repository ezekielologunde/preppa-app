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

### 4. Rotate exposed/uncertain credentials
- [ ] Rotate the Resend API key found exposed at the repo root and removed 2026-09-07 (see [[Bugs]]) — this is still open; removal from disk isn't rotation.
- [ ] Confirm the Google OAuth client secret rotation (flagged open in earlier audits, per [[Tasks]]).
- [ ] Rotate the Mux token if not already done.
- [ ] Search git history (not just the working tree) for secrets.
- [ ] Confirm `SUPABASE_SERVICE_ROLE_KEY` and `STRIPE_SECRET_KEY` never ship client-side (spot-checked this session: the client bundle only contains the anon key and `pk_live_` publishable key — consistent with this, but worth a full `expo export` grep before launch).

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
- **Related, discovered while wiring this:** Preppa's live Supabase Auth SMTP (OTP/signup emails) is configured with a Resend key from an unrelated "getbagsly" Resend workspace/domain (`mail.bagsly.co`), not a Preppa-owned domain — worth fixing before launch. Not yet actioned; see [[Security]] and [[Tasks]].

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
- [ ] Cash on delivery — backend hard-rejects it; hide the UI entirely rather than let it dead-end (see [[Payments]] placeholder table).
- [ ] Rewards/referrals — already flag-disabled, keep it that way.
- [ ] Livestreaming — already flag-disabled, keep it that way.
- [ ] Any "coming soon" UI that looks transactional (the "quotes payment" UI, per [[Features]], says "coming soon" even though the backend deposit flow is real — reconcile the copy either direction).
- [ ] No demo/seed data reachable as if it were real inventory.

## P0 — authentication

### 12. Full auth test pass
Signup, OTP (correct/expired/wrong/resend), login, logout, session restore, account deletion, suspended account, deleted account. [[Bugs]] already flags session tokens in AsyncStorage (not `expo-secure-store`) and no password-reset flow as open.

## P0 — legal/store compliance

### 13. Legal pages
`help.preppa.live` has real pages for Privacy, Terms, Refunds, Food Safety, Allergen Policy, Accessibility, Cook Agreement, Independent Prepper Standards — **but the site itself says these are drafts pending legal review.** Get actual legal sign-off before public launch; don't treat "the pages exist" as "the pages are ready." No dedicated account-deletion page was found in the help center listing — needed for store compliance (Apple 5.1.1(v)); confirm and add if missing.

## P0 — support and email

### 14. Verify every transactional email actually delivers
Signup/OTP, cook application received/approved/rejected, Stripe setup reminder, order lifecycle, cancellation, refund, payout initiated/completed/needs-review, support ticket, safety report. Confirm `support@`, `safety@`, `abuse@preppa.live` all reach a real inbox someone monitors.

## P0 — monitoring

### 15. Launch dashboard
System health (Vercel, Supabase, Edge Function errors, Stripe webhook failures, cron failures), money (payment success rate, refunds, ledger discrepancies, pending/`needs_review` payouts), marketplace (active cooks, live meals, orders/day, GMV, fulfillment rate). None of this currently has a dashboard or alerting — it's all queryable but not surfaced.

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
