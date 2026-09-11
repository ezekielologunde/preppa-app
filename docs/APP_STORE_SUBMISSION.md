# App Store Submission — Reviewer Notes & Listing Draft

Everything in this doc is ready to paste into App Store Connect once you're logged into your
Apple Developer account and the iOS build exists. Nothing here requires your Apple login —
it's all prep work done ahead of time so that step is the only thing left blocking submission.

## Reviewer demo account

Created live in Supabase (test mode), works today at `app.preppa.live` or in the iOS build once built.

- **Email:** `appreview@preppa.live`
- **Password:** `PreppaReview2026!`
- Signs in immediately — no email confirmation step, no OTP needed.
- This is a plain customer account with no order history yet. Reviewers are expected to
  exercise the real flow (see walkthrough below) rather than land on pre-seeded data — that's
  normal for marketplace apps and reads as more credible than fake seeded orders would.

**Test payment card:** `4242 4242 4242 4242`, any future expiry, any CVC, any ZIP. Stripe is in
test mode, so no real charge occurs.

## Reviewer walkthrough (put this in App Store Connect's "Notes" field)

1. Sign in with the demo account above.
2. On Home, browse "Fresh near you" and "Preppers near you" — tap into a meal or a prepper's
   storefront.
3. Add a meal to cart, go to Checkout, pay with the test card above. You'll land on live order
   tracking.
4. From Experiences → Meal plans, browse available plans (subscription model). From Profile →
   Messages, you can message a cook directly.
5. To see the seller side: the demo account isn't a verified prepper. If you want reviewers to
   see prepper tools (menu builder, earnings, order queue), say so explicitly in your reply to
   Apple and we can create a second verified-prepper demo account on request — flag this to me
   and I'll set one up the same way.

## Known content-sparsity note (be upfront, don't let Apple find it first)

Today the marketplace has 8 verified kitchens, 10 active meals, 0 active meal plans, and 0
reviews (all real, no fake data). This is honest early-marketplace state, not a broken app —
but a reviewer landing on an empty "Meal plans" tab could misread it as incomplete (Guideline
2.1). Two options before submitting:
- Publish at least 1–2 real active meal plans from an existing verified kitchen so that tab
  isn't empty, **or**
- Add a line to the reviewer notes explicitly acknowledging "we're an early-stage marketplace —
  the plans/reviews sections will be sparse while our cook community grows; core ordering flow
  is fully functional" so it reads as intentional, not broken.

## App Store Connect listing draft

**App name:** Preppa - Meal Prep Marketplace (the exact name "Preppa" was already taken on the
App Store; this is the variant actually used when the app record was created)
**Subtitle** (30 char max): `Real meals from verified cooks`
**Category:** Food & Drink
**Age rating:** 4+ (no objectionable content; standard e-commerce/food-delivery rating)

**Description draft:**
> Preppa connects you with verified home cooks and meal preppers — order a single meal,
> subscribe to a weekly plan, or book a private chef to cook in your own kitchen.
>
> • Browse real meals from verified cooks near you, with full nutrition info
> • Subscribe to weekly meal-prep plans — pause, skip, or cancel anytime
> • Message your cook directly for allergies, substitutions, or delivery coordination
> • Book "Cook at My Place" — a background-checked, insured prepper cooks in your home
> • Secure payments, ratings & reviews, and real-time order tracking
>
> Preppa is a growing marketplace of independent home cooks — new kitchens join every week.

**Keywords** (100 char max, comma-separated, no spaces needed): 
`meal prep,local food,home cook,healthy meals,meal plan,subscription,personal chef,food delivery`

**Support URL:** `https://help.preppa.live/support`
**Marketing URL:** `https://preppa.live`
**Privacy Policy URL:** `https://help.preppa.live/legal/privacy` (lawyer-reviewed, confirmed final)

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

## What's still blocked on you specifically

Nothing above needs your Apple Developer login. What does:
1. Log into your Apple Developer account (on your machine — I can't authenticate as you).
2. I run the iOS EAS build once you confirm you're logged in / the account is active.
3. Real-device test of native Stripe PaymentSheet (needs a physical iPhone or the EAS-built
   .ipa on a simulator/TestFlight).
4. Create the App Store Connect app record and paste in the listing draft above.

## Since this doc was written

- Stale `NSCameraUsageDescription` referencing removed cash-on-delivery QR scanning was fixed
  in `app.json` (was describing a feature that never actually used the camera — `FauxQR` in
  `Handoff.tsx` is a purely illustrative animation, not a real camera scan).
