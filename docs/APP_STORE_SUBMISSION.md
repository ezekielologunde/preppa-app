# App Store Submission — Reviewer Notes & Listing Draft

Status: draft, not approved for submission. Revalidated November 6, 2026. The current production EAS configuration uses a live Stripe publishable key. Earlier test-mode instructions and marketplace counts were stale and have been removed. Do not submit this document unchanged as reviewer notes.

## Reviewer access and payment environment

A reviewer credential was previously committed in this file. Its password has been removed from the current document, but remains exposed in repository history. The account owner must rotate or replace that credential before reuse. Do not place replacement credentials in source control; supply them only through the store's private review-access fields.

Verify a dedicated review account can sign in, browse available content and exercise supported flows on the exact submitted build. Verify its privileges and whether its environment is test or live. A Stripe test card must never be presented as usable against the live payment configuration. Never charge a real customer or create a real food order merely to test submission readiness.

The latest inspected iOS EAS artifact is a finished production/store build from August 18, 2026, version 1.0.0 build 4, at an older commit. It does not verify current source or current backend behavior. Android's recent inspected builds were internal previews. New signed builds and physical-device checks are still required.

## Reviewer walkthrough to verify before submission

1. Sign in with the privately supplied review account.
2. Browse current meals and cook storefronts. Describe unavailable or sparse features honestly using current evidence, not old inventory counts.
3. Confirm the cart, final total and payment flow in the verified environment. Record the actual payment-mode and test instructions privately.
4. Exercise account deletion, support, messaging/reporting and order-state handling without sending unsolicited messages or placing real orders.
5. Supply a separate scoped cook account only if seller review is required and the account is verified. Do not grant administrator access.

## App Store Connect listing draft

**App name:** Preppa - Meal Prep Marketplace (the exact name "Preppa" was already taken on the
App Store; this is the variant actually used when the app record was created)
**Subtitle** (30 char max): `Meals from independent cooks`
**Category:** Food & Drink
**Age rating:** complete the current store questionnaire from actual content and messaging/moderation behavior; do not reuse a guessed rating.

**Description draft:**
> Preppa connects you with independent home cooks and meal preppers — order a single meal,
> subscribe to a weekly plan, or book a private chef to cook in your own kitchen.
>
> • Browse available meals from cooks near you, with the information each cook provides
> • Subscribe to weekly meal-prep plans — pause, skip, or cancel anytime
> • Message your cook directly for allergies, substitutions, or delivery coordination
> • Book "Cook at My Place" — a participating cook offers an in-home service where available
> • Secure payments, ratings & reviews, and real-time order tracking
>
> Preppa is a growing marketplace of independent home cooks — availability depends on your location and participating cooks.

**Keywords** (100 char max, comma-separated, no spaces needed): 
`meal prep,local food,home cook,healthy meals,meal plan,subscription,personal chef,food delivery`

**Support URL:** `https://help.preppa.live/support`
**Marketing URL:** `https://preppa.live`
**Privacy Policy URL:** `https://help.preppa.live/legal/privacy` (must be checked against current processing and confirmed by the operator)

## App Privacy questionnaire answers (App Store Connect → App Privacy)

Data collected and linked to the user's identity:
- **Location** (Precise) — "used to show nearby cooks and set delivery address" — used for App
  Functionality, not shared with third parties for advertising.
- **Photos/Videos** — profile photo, dish photos, video posts — App Functionality.
- **Contact Info** (email, name) — account creation, App Functionality.
- **User Content** (messages, reviews) — App Functionality.
- **Purchase History / Payment Info** — processed by Stripe; Preppa does not store raw card
  numbers. Disclose as collected (passes through Stripe) even though not stored server-side.
- **Identifiers** (push token via Expo/FCM) — App Functionality (order/message notifications).

No data used for third-party advertising or tracking (no ad SDKs in this app).

## Required before submission

- Rotate the previously committed review credential and verify scoped review access.
- Verify support/privacy URLs, current listing claims, moderation and account deletion.
- Confirm live versus test payment separation, connected-account readiness, refund handling and recurring-charge reconciliation.
- Build the current source for both platforms, test native payments and recovery on physical devices, and finish store privacy disclosures and screenshots.
- Obtain store submission receipts. A successful bundle export or an older EAS build is not a submission.


## November 6 deployment preparation evidence

- Current release source 5e644e6 passed CI run 42317607142: database regressions, tests/typecheck/production audit, web security, iOS bundle and Android bundle. Native bundles include Hermes string-table scans for credential markers. No EAS credits or production database access were used.
- HTTPS GET checks returned 200 for `https://help.preppa.live/support` (Contact Support) and `https://help.preppa.live/legal/privacy` (Privacy Policy). This proves reachability, not the correctness of every disclosure or successful support delivery.
- The production dashboard was rechecked: project paused, Resume disabled. The owner directed continuing without production access and without upgrades. Review-account rotation, live order/payment/refund/deletion checks and store review access remain unverified.
- The historical baseline audit is explicitly marked outdated where it describes Pro hosting and test-mode Stripe.

## Signed-build acceptance record

Complete this record on the exact release build before uploading for review. Do not fill unknown results with assumed passes.

| Check | Evidence needed | Current state |
| --- | --- | --- |
| Build identity | Commit, iOS build number, Android version code, signed artifact IDs | Current signed artifacts not built |
| Authentication | Fresh sign-in, wrong password, recovery, expired session and logout | Requires backend access |
| Buyer checkout | Final price, failure/cancel/retry, no duplicate order or charge | Requires authorized test environment |
| Seller payments | Connect onboarding, payout eligibility and refund handling | Requires authorized test environment |
| Account deletion | Buyer and cook cases, retained transaction explanation, failed deletion recovery | Requires backend access |
| Moderation | Report/block content and users, permissions and support routing | Requires backend access |
| Native behavior | Camera/photo permission denial, notification opt-in, links, offline/resume, accessibility | Requires signed devices |
| Review access | Rotated scoped credentials entered only in private store fields | Blocked, credential remains exposed in history |
| Submission | Completed privacy/data safety, screenshots and upload receipt | Not submitted |
