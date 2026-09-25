---
project: Preppa
type: launch-plan
status: active
last_updated: 2026-09-25
tags: [project/preppa, type/launch-plan]

---

# Launch Plan

## Readiness review — 2026-09-17

**Not signed off for public launch.** Core implementation exists, but the customer-to-cook money journey and operational gates remain open. Older completed items below are historical evidence, not a fresh production verification.

- Local `npm run typecheck`, web export, targeted bundle-secret scan, full local migration replay, and SQL regressions passed on 2026-09-25. GitHub CI run `36165757460` at `7d8af50` passed `typecheck`, `web-build-security`, and `db-regression-tests`.
- Local `npx expo export --platform web` passed. Built output scan found no Stripe secret-key prefixes, PEM private-key headers or `SUPABASE_SERVICE_ROLE_KEY` identifiers; this is a targeted scan, not a comprehensive secret audit.
- Expo SDK 57 patch alignment removed the high findings and Hermes regression. Current `npm audit` reports zero known vulnerabilities, and `expo-doctor` passes 21/21.
- Fixed build-upload exclusions by removing the two-line `.easignore` overriding `.gitignore`; added general `.env.*` protection with example-file exceptions. A local `.p8` file exists and is Git-ignored; its contents were not read. Prior build archives were not inspected, so no credential leak is confirmed. See [[Security]].
- Native session persistence now uses SecureStore and sign-in includes OTP-verified password recovery. The absence of a full UI customer-flow suite remains.
- Development and preview profiles no longer contain production Supabase or Stripe values and the app fails closed when isolated configuration is missing. CI rejects any profile that points back to the production Supabase project or a live Stripe key. Production native builds and `app.preppa.live` retain explicit production configuration. A separate test backend and Stripe test credentials are still required before non-production builds can run realistic acceptance testing.
- New meals now require a full ingredient list and explicit allergen review, store major allergens, and show the disclosure plus a cross-contact warning on meal detail. Historical meals without disclosure show a visible warning until updated.
- Customer checkout now requires a delivery address, keeps payment failures visible, preserves quantity controls at one item, and discloses the server-calculated tax-inclusive total before charging a saved card. New-card Stripe sheets also receive the tax-inclusive amount.
- Cook order and earnings surfaces now distinguish backend failures from legitimate empty or zero states. Order detail opens the real customer conversation, and cancellation can include a customer-facing reason in the refund notification. The supporting migrations replayed locally and passed SQL regressions; target-project migration and Edge Function deployment evidence is still required.
- Admin order, service-request, booking, plan, and subscription detail sheets now show load failures and a retry action instead of remaining on a false loading state. The public safety/support queue can open a pre-addressed email draft to the reporter while retaining audited status tracking.
- Customer feed, saved-post, experience-detail, and live order-tracking screens now distinguish request failures from empty or loading states and provide recovery. Cook dashboard totals and the needs-prep queue no longer fall back to misleading zero or "all caught up" states when their requests fail; analytics and shared support threads now expose errors and retry actions.
- OTP resend now shows success and starts its cooldown only after the resend request succeeds; failures remain retryable and visible instead of being reported as a sent code.
- Customer experience browsing, kitchen feeds, message lists and threads, support history, and experience review loading now recover from request failures. Cook experience, meal-plan, service-request, subscriber/prep, and admin experience-review queues also distinguish load failures from legitimate empty queues.
- Customer orders and request detail, cook order detail, and shared post detail distinguish transient load failures from empty or missing records and provide retry recovery.
- Customer order detail now preserves the real order and kitchen identifiers when opening live tracking, represents cancelled orders honestly, and warns when status refresh fails instead of showing a false live state.
- Cook order lists and detail now place cancelled orders in history, label them correctly, and remove duplicate fulfillment and cancellation actions.
- Checkout now distinguishes saved-card loading and failure from an empty wallet, supports retry or an explicit new-card path, and recovers from rejected Stripe card and wallet promises without leaving payment controls stuck busy.
- Favorites and custom-box catalog failures now show retry recovery instead of false empty inventory. PrepPlus blocks subscription actions when membership state cannot be loaded, preventing a failed lookup from being presented as a non-member state.
- Cook experience and meal-plan editors now recover from failed or missing edit records instead of remaining on an indefinite loading screen or opening a blank form that could overwrite the wrong state.
- Cook in-home vetting and Preppa Pro membership now distinguish backend failures from missing applications or non-membership and provide retry recovery, preventing duplicate or incorrect membership actions.
- Admin role changes now require a separate review step, with typed confirmation for any admin elevation or demotion. Payout reconciliation now validates Stripe transfer IDs and requires an explanatory note before marking a payout failed.
- Admin application and in-home-vetting document previews now tolerate partial signed-URL failures, report unavailable evidence, and provide retry actions instead of displaying an indefinite loading label.
- The notification center now distinguishes loading and request failures from a legitimate empty inbox, exposes failed mark-read persistence, and provides refresh recovery. Stale messaging-unavailable copy was removed because relationship messaging is live.
- Public kitchen storefronts now distinguish failed profile, meal, review, and experience requests from missing or empty content, preserve stale meal and experience data when available, and provide retry actions.
- Cook post creation now reports menu-loading failures, explains that posting can continue without a featured dish, and provides a menu retry action instead of silently hiding the selector.
- Pending cook applications now show payout-setup loading, lookup failures, missing kitchen records, and retry actions instead of silently removing the Stripe onboarding path.
- Admin application review now checks Supabase errors when loading Stripe identity and payout status, labels unavailable data clearly, and offers retry instead of misreporting a failed lookup as onboarding not started.
- Experience ratings, reviews, and waitlist lookups now propagate Supabase errors. The customer detail screen preserves stale reviews, reports unavailable review data, and provides retry instead of presenting a failed request as unrated.
- Experience browse, detail, session, seat, private-link, and availability helpers now propagate backend failures to existing recovery UI instead of converting them to empty lists, missing records, or "no upcoming sessions."
- Feed, saved-post, shared-post, follow-state, cook-menu, and pending-kitchen helpers now propagate authentication and query failures to their recovery UI instead of converting failures to empty content or missing records.
- Seeded and live kitchen storefronts now show follow-state loading and retry controls, and distinguish authentication failures from network or backend failures when a follow update fails.
- Cook availability and payout-preference reads now reject backend failures. The hub availability control shows checking and retry states instead of displaying or toggling a stale cached open state.
- Customer and cook membership, meal-plan, subscription, cycle, capacity, prep, and subscriber reads now propagate backend failures. Real plan detail distinguishes load failure from a missing plan and provides retry.
- Cook plan editing now blocks on an unknown kitchen capacity instead of treating it as unlimited, and publishing reports a partial save if the capacity limit could not be updated.
- Stripe Connect status errors now propagate from the Edge Function and the onboarding return flow distinguishes a verification failure from incomplete setup.
- Service requests, bookings, experience review status, message threads, unread counts, and broadcast audience counts now propagate backend failures instead of appearing empty or complete.
- Editing a customer service request now waits for saved data and provides a retry state instead of exposing a blank form during a failed prefill.
- Kitchen directory and profile ratings now surface query failures instead of showing verified cooks as unrated.
- Checkout now clears stale saved-card selections when payment methods cannot be refreshed, and the web card sheet reports Stripe or mount failures instead of remaining indefinitely disabled.
- Order tracking no longer presents a decorative route as live location data. It identifies the screen as kitchen status updates, discloses that location tracking is unavailable, and provides recovery when an order cannot be read.
- Customer meal-order history now hydrates from RLS-scoped paid/refunded server orders. Demo orders and device-persisted order history were removed, and sign-out clears in-memory order data to prevent cross-account leakage.
- Customer delivery addresses now load and mutate through owner-scoped database rows rather than shared device fixtures. Delivery checkout requires a server-verified address, snapshots it on the order, and exposes that immutable fulfillment address only through the assigned kitchen’s protected order detail.
- Checkout now stops when Stripe Tax fails instead of silently turning a provider or configuration error into a zero-tax order. A successful Stripe calculation may still return zero where applicable.
- Checkout retries now recover a succeeded PaymentIntent as the existing paid order and route the customer to tracking. A lost browser or native confirmation response no longer strands a paid customer behind an “already paid” error.
- Quote-deposit and experience-booking retries now recover the original PaymentIntent, distinguish paid from pending, and never treat a missing client secret as confirmation. Experience retries reuse the customer’s active booking for that session instead of reserving and charging a second booking.
- Meal-plan and build-a-box signup retries now return the existing active subscription and its first-cycle dates after a lost response. A database partial unique index closes concurrent duplicate plan signups, matching the existing box guard; paused or payment-failed subscriptions still direct customers to management.
- PrepPlus and Cook Pro subscription keys now include the prior Stripe subscription ID. Network retries reuse the same provider operation, while a canceled member can later create a genuinely new subscription. Stripe connection, API, and timeout failures are described as safely retryable instead of card declines, and database entitlement writes are checked.
- The cook hub bell now opens the real notification center and only shows an unread marker when unread alerts exist. Notification read updates propagate persistence failures to the existing recovery UI instead of silently clearing the local badge.
- Meal publishing now reports when a selected photo fails to attach while preserving the successfully created meal. The nonfunctional per-meal daily-quantity input was removed because inventory is enforced at kitchen capacity level and no per-meal stock model exists.
- Resolving an immediate-risk public support request now requires confirmation because resolution removes it from the active urgent count. The confirmation tells operators to verify that the risk response is complete and documented.
- Legacy catering, quote, and request deep links no longer show static customer data or local-only success screens. They redirect to the live server-backed service request hub.
- Service completion distinguishes a confirmed balance failure from an ambiguous Stripe response. Confirmed failures remain due; ambiguous charges stay locked, tell both parties not to collect again, and are reconciled without creating a second charge. Meal-plan request fulfillment no longer claims customer notification when request linking fails.
- Customers can now open their support requests, read the non-internal support thread, retry failed loads, reply securely, and reopen resolved tickets through the existing server authorization path. Closed tickets clearly direct customers to report a new issue from the related order.
- Expo SDK 57 patch dependencies are aligned, vulnerable transitive URI-decoding and UUID packages are pinned to patched releases, Expo Doctor passes all 21 checks, and `npm audit` reports zero known vulnerabilities.
- Delivery addresses now preserve separate unit, city, state or region, postal code, and ISO country fields. Checkout rejects incomplete legacy rows and Stripe Tax receives the owner-verified saved delivery address instead of a broad client location.
- Pickup checkout now requires a geocoded country before order creation, and failed area geocoding clears any stale prior country instead of silently reusing the wrong tax jurisdiction.
- Payment and service clients now extract the JSON reason from failed Edge Function responses, preserving actionable checkout, saved-card, request, quote, booking, and refund messages instead of replacing them with a generic SDK failure.
- The same Edge Function error handling now covers cook onboarding, payouts, order refunds, experiences, subscriptions, plan publishing, and livestream controls. Admin experience review and live-feed reads no longer convert backend failures into false empty states.
- Checkout retries now recover an order that was saved before its Stripe PaymentIntent row, but only after matching the customer, kitchen, unpaid state, total, and exact persisted cart. Concurrent retries cannot attach one Stripe intent to another order, finalized orders are not charged again, and unrecoverable states give the customer a clear path back to a fresh checkout.
- Cook applications now collect and privately store a structured pickup address. Pickup checkout uses that kitchen address for Stripe Tax and blocks kitchens with incomplete legacy address data instead of calculating tax from the buyer's rough location.
- Reorder now checks current meal availability, kitchen status, fulfillment support, prices, and images before adding historical items to the cart. Cook ownership UI now compares the authenticated cook's real kitchen UUID instead of a legacy presentation persona. Checkout rejects self-orders server-side and revalidates kitchen, payout, and meal eligibility before resuming an interrupted payment.
- Newly confirmed Stripe payments now remain in an explicit "Confirming payment" state until the protected order row reports `pay_status = paid`. Customer order detail and tracking no longer present webhook-pending orders as if the kitchen were already preparing them.
- Delivery checkout now accepts a 500-character order-specific handoff note with a visible counter. The note is snapshotted on the order and exposed to the assigned active kitchen only through the protected order-detail RPC.
- Cook cancellation now refunds a split-cart order's full customer-facing kitchen allocation, including tax and service fee. Paid orders remain active when Stripe cannot confirm the refund, with an actionable retry/support error instead of silently requiring manual reconciliation.
- Order support now includes an explicit cancellation-request category. Ticket subjects, descriptions, and replies have matching client and database limits so oversized input cannot degrade the customer, cook, or admin workflow.
- New order support requests alert admins, and non-internal replies alert the customer, shared cook, or admin queue as appropriate. The persisted support thread no longer depends on each participant manually reopening the queue to discover activity.
- Customers receive an in-app and push notification when admins move an order support request to in progress, resolved, closed, or reopened, completing the support lifecycle feedback loop.
- Removed the remaining cash-on-delivery presentation branches and cook preference field. Tracking now requires a real order ID instead of falling back to a static "live" timeline. The decorative pickup QR and random backup code were also removed because no server verification or cook scanner existed, so old or malformed links cannot present fabricated fulfillment or handoff controls.
- The latest UI and workflow hardening removed obsolete seeded-kitchen deep links, requires live catalog IDs at checkout, adds recovery for empty or failed custom-box and subscription-plan loads, confirms customer booking financial actions, protects cook menu mutations, and confirms high-impact admin payout, kitchen-application, support-ticket, and safety-request decisions. These safeguards have local typecheck, web-build, bundle-security, and audit evidence; provider and real-device acceptance remain separate launch gates.
- Checkout preview now mirrors the order function's 10% service fee for every live kitchen and shows the actual zero delivery fee directly. Obsolete seed-cook waivers and an invented crossed-out delivery price were removed, so customers no longer see promotions the server does not model.
- Checkout idempotency now changes when the customer changes the kitchen cart, fulfillment method, address, delivery instructions, tip, or payment path, while unchanged retries keep the same key. The order function also verifies fulfillment, subtotal, tip, instructions, and exact persisted meal quantities before returning an existing PaymentIntent, preventing a reused key from resuming stale checkout terms.
- Live meal cards now carry the kitchen's current delivery and pickup capabilities into cart and reorder state. Checkout disables unavailable fulfillment choices, automatically moves a stale global selection to the kitchen's valid option, and the order function independently rejects disabled methods.
- Cook order detail now reads the authoritative payment status from its owner-scoped RPC. Unpaid deep links show a prominent wait-for-payment warning and cannot expose preparation, completion, or refund actions until payment is confirmed.
- The owner-scoped `update_order_status` RPC now independently requires `pay_status = paid` before any preparation, ready, delivery, pickup, or completion transition. SQL regressions pin both the payment-status detail field and the server-side fulfillment guard.
- Cook payout setup and bank-management actions now allow only one Stripe account session request at a time. Cash out and shared hub buttons expose real disabled semantics, so unavailable or in-progress financial controls cannot be retriggered by rapid taps, keyboard input, or assistive technology.
- CI now pins the Supabase CLI and GitHub Actions to reviewed versions and immutable action commits. The database job logs the CLI version, preventing an unreviewed upstream release from silently changing clean-schema migration evidence.
- Checkout now locks order creation and saved-card confirmation synchronously before React rerenders. Rapid taps cannot start a second customer payment action, and the primary control exposes its disabled state while the request is in flight.
- The same synchronous submission protection now covers experience bookings, service quote deposits, meal-plan subscriptions, custom-box subscriptions, PrepPlus membership changes, and service-request cancellation. Related controls expose disabled states while a money or cancellation action is running.
- Cook Pro subscription and billing actions now use the same synchronous lock. Switching billing cadence discloses Stripe proration before confirmation, and cancellation requires confirmation with the benefit end-state explained.
- Admin ticket status, replies, cook sharing, urgent support status changes, and payout reconciliation now use synchronous shared mutation locks. Conflicting rapid operator actions cannot race before the disabled state renders.
- Admin kitchen applications, in-home vetting, experience review, user-role changes, suspension, and reinstatement now use the same synchronous review lock, preventing duplicate or conflicting approval and access decisions.

### Customer acceptance evidence still needed

Run synthetic cases in an isolated backend with Stripe test mode first. Development and preview now fail closed without isolated credentials, but the external test project and Stripe test configuration still need to be created.

| Scenario | Required outcome | Current evidence |
|---|---|---|
| Signup, login, wrong code/password, logout, session restore, deletion | Correct session and recovery behavior | Historical web pass September 8; native unverified |
| Payment through fulfillment, review and cook payout | One charge/order, correct fees/ledger, payout received | Controlled real-money acceptance unchecked |
| Declined card, cancelled checkout, timeout and retry/double tap | Clear outcome; no duplicate charge/order | Acceptance unchecked |
| Cook cancellation and refund | Customer sees cancellation; refund reconciles | Acceptance unchecked |
| Customer A requests customer B's orders/messages/tickets | Access denied without leaking data | Dedicated multi-account acceptance evidence needed |
| Missing-item ticket and safety report | Ticket saved, customer confirmation, admin alert and follow-up | Implementation present; historical safety alert verification September 12; full support resolution unverified |
| Native Connect return/expired link and bad-network recovery | Correct return state, status refresh, retry | Device pass outstanding |

Public launch also needs real approved cooks/menus, selected geography and legal sign-off, a named support operator, and device/store acceptance. See detailed gates below and [[Tasks]].

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
The repository now prevents development and preview builds from falling back to production. An external test Supabase project and Stripe test configuration still need to be provisioned before those profiles are operational.

- [x] ~~Wire the app to read config from `EXPO_PUBLIC_*` env vars and fail closed outside production~~ — completed 2026-09-25. `src/lib/supabase.ts` requires isolated values for development and preview. `eas.json` no longer embeds production service values in those profiles, `.env.development.example` documents local setup, and `security:env` enforces the separation in CI.
- [ ] **Dev Supabase project — blocked on cost.** Creating a second project on this org (already Pro plan) costs $10/mo recurring; declined for now. Development and preview builds now stop with a configuration error instead of touching production, so they remain intentionally unusable until this project exists.
- [ ] Stripe test keys for dev/preview builds — blocked on the item above (needs a project to attach them to, or at minimum a Stripe test secret key to configure).
- [x] ~~Live Stripe keys reserved for production build configuration only~~ — completed 2026-09-25. Development and preview reject `pk_live_` values at runtime and in CI. A Stripe test key is still needed to make those profiles usable.
- [ ] Separate Resend config per environment — out of scope this round.
- [x] ~~EAS dev/preview/production config cannot silently converge on production~~ — completed 2026-09-25. The non-production profiles contain only their environment labels and must receive isolated service values externally.

**Next step whenever ready:** create the dev Supabase project, apply all migrations and deploy Edge Functions, then configure its public URL/anon key plus a Stripe test publishable key in the development and preview EAS environments. For local work, copy `.env.development.example` to `.env.development` and fill in the same isolated values.

**Rule of thumb:** a developer running a preview build should not be able to accidentally create a real paid order.

### 6. Protect `main`
- [x] ~~Enable branch protection~~ — **confirmed active 2026-09-10** via `gh api repos/.../branches/main/protection` (this checklist item had gone stale — the sub-items below were already done, the parent line just never got checked off). `required_status_checks` (typecheck, db-regression-tests, strict), force-push/deletion both blocked.
- [x] ~~Require CI before merge~~ — **done 2026-09-07**: both `typecheck` and `db-regression-tests` are now required status checks on `main`.
- [x] ~~Block force pushes~~ — already enabled (confirmed 2026-09-07; deletions blocked too).
- [ ] Require PRs — deliberately deferred: enforcing this (and `enforce_admins`) would block direct pushes entirely, including how work has shipped in this repo so far. Revisit once there's more than one contributor.
- [x] ~~Review Dependabot alerts~~ — **done 2026-09-07, re-reviewed 2026-09-10** (count jumped to 27: 21 high, 6 moderate — mostly one new `@xmldom/xmldom` disclosure cluster, 13 alerts on that package alone). All still trace to Expo's own build/CLI toolchain (Babel, Metro, Xcode project generation via `expo-splash-screen`/`expo-updates`), none reachable from the shipped app bundle. Deliberately left open rather than forcing transitive overrides against pinned Expo SDK 57 — see [[Bugs]]. Revisit at the next Expo SDK upgrade.
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

**Cook training now exists (2026-09-18):** a 68-second walkthrough for Preppers (apply → Stripe payouts → post a meal with allergens → orders and cash-out) is live at [help.preppa.live/training](https://help.preppa.live/training#preppers) — the `#preppers` link opens it at the Preppers section. Send candidates there before they apply. See [[Changelog]].

- [ ] 10 serious candidates.
- [ ] 5+ fully approved.
- [ ] 5+ Stripe payout-ready.
- [ ] ≥3 menu items per cook, real photos, real pricing, fulfillment/hours configured.

## P0 — cook compliance

### 9. Pick one launch geography
Do not launch nationwide. One city/metro, one defined service radius. Then, for that specific jurisdiction: cottage-food rules, home-kitchen restrictions, allowed vs. commercial-kitchen-only foods, food-handler requirements, permits, labeling, allergen disclosure, sales tax, insurance. The app's food-handler cert field is self-reported and unverified against any registry (see [[PM-Onboarding]]) — compliance here is entirely an ops/legal responsibility, not something the code checks.

### 10. Admin approval SOP — written 2026-09-10

For Cohort 0, one person (can be you) does this manually, in order, for every application. Grounded in what the admin console actually shows today (`app/admin/applications.tsx`, `admin_application_detail()` RPC) — not a generic checklist.

**Step 1 — Open the queue.** Admin → Applications. Each pending row is one kitchen application; tap it to open the detail view (photos load via signed URLs, expire after viewing — normal, just re-open if a photo looks broken).

**Step 2 — Identity.** Confirm the `govid` and `selfie` photos are present, legible, and the face plausibly matches. There is no automated ID-verification check — this is entirely a human look.

**Step 3 — Food safety self-attestation.** Three checkboxes (`food_safety.refrigeration`/`foodPrep`/`allergens`) plus a free-text `note` — confirm all three are checked and the note (if any) doesn't raise a red flag. This is self-reported, not verified against any registry (see [[PM-Onboarding]]) — don't treat a checked box as proof.

**Step 4 — Food handler certification (where your launch jurisdiction requires one — see item 9).**
- If they uploaded a real cert number/file: verify it looks legitimate, then use the certificate review controls in Admin → Applications. Enter the expiration date from the certificate and save it as Reviewed. The form rejects invalid or past dates and records the audited status through `admin_set_cert_status()`.
- If your jurisdiction doesn't require one for this category, or they didn't provide one: leave `food_handler_cert_status` at its default `'unverified'` — don't mark `'reviewed'` for something you didn't actually review.

**Step 5 — Kitchen & fridge photos.** Confirm the `kitchen`/`fridge` photo groups show a real, plausibly-clean home kitchen — not a stock photo, not someone else's commercial kitchen.

**Step 6 — Cook Agreement.** Confirm both `agreement_version` and `agreement_accepted_at` are populated (not null) — that's proof they actually clicked accept on the current version, not just that the field exists.

**Step 7 — Address.** `kp.address` plus the geocoded `verified_lat`/`verified_lng` — sanity-check the pin actually lands in your chosen launch service radius (item 9). An address outside it should be rejected regardless of how good everything else looks — this is the one check with real legal consequences (cottage-food law is jurisdiction-specific).

**Step 8 — Decide.** Approve or Reject, right there in the detail view.
- **Approve** calls `approve_kitchen()`: sets `verification_status='verified'`, promotes the owner's role to `'prepper'`, opens the kitchen for listing. It does **not** check or require Stripe Connect completion — a cook can be approved before finishing Stripe onboarding.
- **Reject** requires a reason (enforced client-side, minimum 3 characters) — write an actual reason, it's shown to the applicant and stored in `rejection_reason`.

**Step 9 — For the "Cook at My Place" (in-home) category specifically: a second, separate review.** Admin → In-home safety (`app/admin/in-home-vetting.tsx`) — background-check and insurance documents, distinct from the kitchen application above and gated by its own `kitchens.in_home_vetting_status`. Do this before letting an approved cook accept in-home bookings, not as part of Step 8.

**Step 10 — After approval, before calling a cook "launch ready":**
- Confirm Stripe Connect actually completed: check `stripe_accounts.payouts_enabled = true` for their kitchen (Admin → Payouts, or query directly) — a verified-but-not-Stripe-ready cook can't actually get paid. The system already sends an automated nudge (`stripe-setup-nudge`, daily cron) if they stall.
- Spot-check their first published menu for pricing sanity and verify that the structured ingredient list and explicit allergen review are complete. The app now blocks new meals without that disclosure, but a human review should still catch implausible pricing or unsafe content before launch.

Automate later, once there's a real volume of applications to justify it — this SOP is intentionally manual for Cohort 0's scale (5-10 cooks).

## P0 — customer experience

### 11. Kill fake/dead surfaces before public launch
- [x] ~~Cash on delivery and decorative handoff controls~~ — completed 2026-09-25. The backend still rejects COD. All client COD branches and preference data are gone, along with the fake pickup QR, random backup code, and static tracking fallback. Tracking requires a real server order ID.
- [x] ~~Rewards/referrals — already flag-disabled~~ — confirmed 2026-09-08: `FLAGS.rewards = false`, and `app/rewards.tsx` itself redirects home when the flag is off (a prior audit fix) — no leftover reachable entry point found anywhere else in the app.
- [x] ~~Livestreaming — already flag-disabled~~ — confirmed 2026-09-08: `FLAGS.live = false`, and all 4 consumer sites (`hub/go-live.tsx`, `store/[cook].tsx`, `store/[cook]/live.tsx`, `(tabs)/feeds.tsx`) gate on it correctly, plus a separate server-side `LIVE_ENABLED` kill switch independent of the client flag. No leftover entry point found.
- [x] ~~"Coming soon" quotes-payment UI~~ — **turned out to be already stale/fixed**, not an open item. A repo-wide search found no "coming soon" copy anywhere near quotes/service-request payment; both `app/discover.tsx` (Services tab) and `app/request/[id].tsx` already call the real `acceptQuoteAndDeposit()` → real `CardPaymentSheet` deposit charge. [[Features]] and [[Tasks]] corrected to remove the stale claim.
- [x] ~~No demo/seed data reachable as if real inventory~~ — database side closed 2026-09-08 and live-catalog client fallback removed 2026-09-25. The 6 hardcoded seed cooks mapped via `KITCHEN_ID` to production history that cannot be deleted because ledger, subscription, and message records are append-only. Their kitchens remain permanently `rejected` and `paused`. Live Supabase meals now use their real kitchen UUID throughout customer search, cart, ownership, checkout, and display instead of the prior Maria fallback; verified-kitchen discovery renders only live directory fields. Prototype plans, experiences, and legacy seed routes still use `COOKS`/`KITCHEN_ID` and remain tracked as mock-data cleanup in [[Tasks]].

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

The two auth-hardening gaps found in that pass were closed 2026-09-17: native sessions now use SecureStore and sign-in offers an emailed-OTP password reset. The historical web session-restore result above still refers to browser storage, which remains appropriate on web.

## P0 — legal/store compliance

### 13. Legal pages
`help.preppa.live` has real pages for Privacy, Terms, Refunds, Food Safety, Allergen Policy, Accessibility, Cook Agreement, Independent Prepper Standards — **but the site itself says these are drafts pending legal review.** Get actual legal sign-off before public launch; don't treat "the pages exist" as "the pages are ready." No dedicated account-deletion page was found in the help center listing — needed for store compliance (Apple 5.1.1(v)); confirm and add if missing.

## P0 — support and email

### 14. Verify every transactional email actually delivers
- [x] **Support/safety/abuse inbox routing — fixed 2026-09-08, was genuinely broken.** Checked Cloudflare Email Routing (the domain's actual MX provider) directly: routing status showed **Disabled** and DNS records **Misconfigured** — a required SPF TXT record (`v=spf1 include:_spf.mx.cloudflare.net -all`) was missing entirely. Worse, **`safety@` and `abuse@preppa.live` had no routing rule at all** — the catch-all is set to Drop, so mail to those two addresses was being silently discarded, not delivered anywhere. Fixed both: added the missing SPF record (additive, Cloudflare's own "Add missing records" action) and created routing rules for `safety@`/`abuse@`, matching the other four (`info@`/`privacy@`/`support@`/`hello@`) — all six now forward to a real, monitored inbox. DNS was still propagating ("Syncing") as of this fix; should clear on its own.
- [x] **Signup/OTP email — already verified working**, see item 12 (real OTP sends confirmed via Resend, `200` logged).
- [~] **Everything else on this list is not actually email — important scope correction.** Checked every Edge Function for outbound email calls: cook application received/approved/rejected, Stripe setup reminder, order lifecycle, cancellation, refund, and payout initiated/completed/needs-review all go through `notify()` only — an **in-app notification + push**, never an email. This isn't a delivery bug to fix; it's that the underlying feature (transactional email for these events) was never built. The checklist's premise assumed it existed. Two real options going forward: (a) treat in-app/push as the actual channel for these and drop the "email" framing, or (b) build real email sending for them using the now-proven Resend integration (the `preppa.live` domain, DKIM/SPF-verified for sending, and a scoped API key already exist from the admin-alerts and Auth-SMTP work). Neither built this round — needs a product decision on which events genuinely need email vs. in-app is enough.
- [ ] Push notification delivery to a real device is unverified — the send-push Edge Function and push_tokens table exist, but no live device token was tested this session.
- [x] ~~"Support ticket" and "safety report" submission-confirmation notifications specifically~~ — **traced fully and fixed 2026-09-12.** There is no separate "safety report" flow: it's `public_support_requests` (anon-writable marketing-site intake, `report_type` support/safety/abuse, `immediate_risk` flag) — which had **zero rows and zero alerting** wired to it, unlike every other event in the app. Fixed with the existing, already-decided `notify_admins()` channel (no email-vs-in-app decision needed, unlike the bullet above): an `AFTER INSERT` trigger alerts every admin (in-app + push + email), escalated wording for `immediate_risk`. Also added `admin_list_support_requests()`/`admin_set_support_request_status()` RPCs and a real Admin → Safety & support requests screen (`app/admin/support-requests.tsx`) — there was previously no way to even view these reports in the app. Separately, the authenticated order-`tickets` flow's `create_ticket()` wrote the row and an audit entry but never confirmed receipt to the reporter — added one `notify()` call. Verified live: inserted a real test `immediate_risk` row, confirmed both admins got a real in-app notification and email (`net._http_response` 200s), then deleted the test row. See [[Decisions]] and [[Changelog]].

## P0 — monitoring

### 15. Launch dashboard
- [x] ~~Money + marketplace metrics~~ — **done 2026-09-08**. Added `admin_dashboard_metrics()` (same `SECURITY DEFINER` + `is_admin()`-gated pattern as the existing `admin_*` RPCs) and a new Admin → Dashboard screen (`app/admin/dashboard.tsx`): GMV, orders, payment success rate, refund volume, payout pipeline (pending/needs-review/paid), all-time ledger balance, fulfillment rate, active (verified) cooks, and live meal count. Stripe-derived fields (payment success rate, refund volume) degrade to `null` where the Stripe-sync schema doesn't exist (local/CI). **Caught a real bug while verifying against production**: `live_meals_count` initially counted the 6 now-permanently-rejected seed kitchens' dead `status='live'` meal rows as if they were real inventory (rejecting a kitchen doesn't cascade to its meals' own status) — fixed to join through kitchen verification; confirmed live it now correctly reads 0, matching 0 verified kitchens today.
- [x] ~~System health~~ — **partially done 2026-09-08**, the DB-observable half. `detect_system_health_issues()` (pg_cron) alerts via `notify_admins()` on (1) `cron.job_run_details` showing a scheduled job's SQL statement actually failed, and (2) `net._http_response` showing a real outbound HTTP failure (5xx or timeout) from any `pg_net` call. **Not covered, deliberately**: Vercel deploy status and Stripe webhook delivery failures live entirely outside this database — both platforms already have their own native alerting for free; recommend turning those on directly rather than building a custom poller for comparatively little gain.
  - **Real incident, fixed 2026-09-09**: two genuine "Outbound request failures" alerts fired (16:00, 16:15 UTC) — a real `pg_net` 5000ms timeout, not a false positive, but not a business-critical failure either: every payment/payout/subscription job's own run succeeded both times (checked `cron.job_run_details` directly). Root cause was self-inflicted — `detect-admin-anomalies` and `detect-system-health-issues` were both scheduled `*/15 * * * *`, landing on the exact same tick as four `*/5 * * * *` jobs plus the every-minute `stripe-sync-worker`, up to 6 concurrent `net.http_post` dispatches at once. Fixed by offsetting both to minutes 7/22/37/52. Also found and fixed a related latent issue while investigating: `cron.job_run_details` had grown to 112,440 rows since 2026-07-07 with zero retention (pg_cron never prunes it, and the project role doesn't own the table so it can't be indexed either) — added a daily prune job (3-day retention), shrinking it to ~8,000 rows immediately. See [[Decisions]].
  - **Follow-up, fixed 2026-09-11 — the 09-09 fix was incomplete, not wrong.** Four more real timeout alerts fired 2026-09-10/11 (17:07, 18:52, ~17:22, ~17:52 UTC) with `detect-admin-anomalies`/`detect-system-health-issues` confirmed absent from `cron.job_run_details` at every actual failure instant — the two offset jobs were never the (whole) problem. Traced properly this time: `charge-due-cycles` and `reconcile-payouts` (both `*/5 * * * *`) are the only other jobs in that cluster that actually call `net.http_post` (checked via `pg_get_functiondef` — `advance_cycles`/`reap_experience_holds` are pure SQL, no HTTP), and they land on the exact same tick as the every-minute `stripe-sync-worker` — 3 concurrent dispatches, still enough to occasionally exceed 5000ms. Fixed by staggering `charge-due-cycles`→minutes `1,6,11...`, `reconcile-payouts`→`3,8,13...`, and raising `timeout_milliseconds` 5000→15000 on all three (none are latency-sensitive). See [[Decisions]] and [[Bugs]].

## P1 — native app launch

### Admin decision safety — hardened locally 2026-09-25
- [x] Experience review now requires an explicit confirmation before publishing customer-visible sessions or rejecting a cook submission. Buttons lock while a decision is running and server errors remain retryable.
- [x] In-home cooking vetting now requires an explicit confirmation before granting or denying access. Approval copy tells reviewers to confirm current background-check and insurance evidence; rejection shows the recorded reason before submission.
- [x] User administration now enforces its mutation lock inside suspension, reinstatement, and role handlers and disables other row actions while a privileged write is running.

### Storefront interaction safety — hardened locally 2026-09-25
- [x] Kitchen follow and unfollow writes are serialized. The button shows a saving state, blocks rapid duplicate taps, and restores the prior state when the server rejects the change.

### Subscription charge ambiguity — duplicate-charge risk closed locally 2026-09-25
- [x] Ambiguous Stripe responses now mark the cycle while preserving `payment_status='charging'`. `advance_cycles()` only releases a stale claim when Stripe was never contacted, so the cycle cannot be charged again under a fresh attempt key.
- [x] Automated reconciliation is implemented locally. The worker searches the original PaymentIntent by cycle metadata without creating a new charge, applies authoritative Stripe states, sends term mismatches to admin review, and waits 24 hours before treating an exhaustive no-match as a failed attempt. Production migration, function deployment with JWT verification disabled, and a controlled ambiguity test remain launch gates.

### Booking cancellation and refund truthfulness — hardened locally 2026-09-25
- [x] Service bookings remain active when Stripe cannot confirm the promised deposit refund. The customer receives a retryable error instead of a completed-cancellation response.
- [x] Cook-initiated experience cancellation stops on an unconfirmed guest refund before reversing that booking's ledger credit or notifying the customer. Retrying is safe because every refund uses the same booking-scoped idempotency key.
- [x] Customer booking cancellation, paid-balance completion, and cook session cancellation use the cross-platform confirmation dialog on web, iOS, and Android. Mutation controls lock while the request runs.

### Booking balance charge ambiguity — duplicate-charge risk closed locally 2026-09-25
- [x] RFQ balance reservation now persists a charge state before Stripe is called, so concurrent completion requests cannot start separate attempts.
- [x] Stripe connection, timeout, and API errors after charge creation begins remain `ambiguous`. Customer and cook messaging says confirmation is pending and explicitly prevents collecting again.
- [x] `reconcile-booking-balances` finds the original PaymentIntent by booking metadata without creating a charge, validates amount and currency, settles authoritative outcomes, and routes mismatches to admin review. Production migration, function deployment with JWT verification disabled, and a controlled ambiguity test remain launch gates.
- [x] Customer history persists the balance outcome after the completion toast, including paid, due, and confirmation-pending states. Admin booking detail shows the same state instead of labeling every original balance as still due.

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
