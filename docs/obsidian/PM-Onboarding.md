---
project: Preppa
type: onboarding
status: active
last_updated: 2026-09-07
tags: [project/preppa, type/onboarding]
---

# PM Onboarding

Part of [[Project]]. Written for a product manager joining the team cold. This is a narrative tour, not a spec — every claim links to the technical note that backs it up. Start here, then go deep in whichever linked note matches what you're deciding.

## What Preppa is

A two-sided marketplace: home cooks ("preppers") sell homemade meals, cook in customers' homes, run subscription meal plans, or host bookable food experiences; customers browse, order, subscribe, and pay through the app. Cooks get paid out via Stripe Connect. See [[Project]] for the full pitch and [[Features]] for what's actually shipped vs. planned.

## The one thing to internalize first

**The app is technically further along than the business is.** Checkout, meal plans, messaging, reviews, cook payouts, and admin tooling are all real, working, backed by a live database — not a prototype. But a marketplace with zero real cooks is an empty app no matter how solid the code is. If you take away one thing: **the current bottleneck is cook supply, not engineering.** See "What's actually blocking launch" below.

## Which repo is this, actually? (resolved 2026-09-07)

There are three same-account GitHub repositories with confusingly similar names. Only one is this app:

- **`ezekielologunde/preppa-app` (`main`) — this repo, canonical.** Live at `app.preppa.live`. All the September payout/reconciliation work described below lives here; CI (`typecheck` + DB regression suite) is green.
- **`ezekielologunde/Preppa` (`master`) — a separate, earlier (July) application foundation.** Not this app, not kept in sync with it. Its `landing/` Next.js app is, however, confirmed via the Vercel dashboard to be the real production deployment behind `preppa.live` and `help.preppa.live` — so this repo is legacy for the *app*, but still load-bearing for the *marketing/help site*. Its own CI has a stale-generated-types failure that's being left red on purpose since nothing depends on its app/backend side anymore.
- **`ezekielologunde/preppa-landing` — archived.** Its README claimed the same two marketing domains, but it turned out to have no live Vercel deployment at all — just stale documentation. Archived rather than deleted, so it's recoverable if that's ever wrong.

If you're ever pointing a contractor, a new engineer, or a domain/DNS change at "the Preppa repo," it's `preppa-app`, full stop — unless the change is specifically about the `preppa.live`/`help.preppa.live` marketing site, in which case it's `Preppa`'s `landing/` folder.

## How the pieces fit together

- **Frontend**: Expo/React Native, one codebase for iOS, Android, and web. [[Frontend]]
- **Backend**: Supabase (Postgres + Edge Functions), Stripe for all money movement. [[Backend]] · [[Database]]
- **Money model**: cooks accrue a ledger balance (not Stripe escrow) and cash out to a Stripe Connect Express account, either on demand or via an automatic weekly sweep. [[Payments]]
- **Authorization**: almost everything privileged runs through `SECURITY DEFINER` Postgres functions with in-body ownership/role checks, not client-side trust. [[Security]] · [[Decisions]]

## What's actually blocking launch

Not code. To have real customers order real food, you need:

1. **Recruit real cooks.** There's no automated lead-gen or acquisition flow — someone has to find and pitch people. This is the critical path.
2. **Walk each cook through the real pipeline** (all of it works today): apply in-app → an admin approves → the cook completes Stripe Connect identity/bank verification → the cook builds a menu and goes live. See [[Payments]] for the exact payout mechanics and [[Features]] for onboarding hardening added 2026-09-07 (cert review status, a nudge if a cook stalls mid-Stripe-onboarding).
3. **Real regulatory compliance is on you, not the app.** The in-app food-handler certificate field is self-reported text — it is not verified against any government registry. Cottage-food-law and commercial-kitchen licensing requirements vary by state/city and are a legal/ops responsibility, not something the code checks.
4. **Manual review capacity.** Every application's kitchen/fridge photos get eyeballed by a human admin today — this doesn't scale without someone doing it.

Realistic path: treat the first cohort of cooks as high-touch. Recruit a handful, personally walk them through approval and Stripe setup, get their menus live, and use that to learn what actually breaks before trying to scale acquisition.

## What was just built (2026-09-07 session) — payouts are now trustworthy

Before this session, a Stripe payout that hit an ambiguous error (timeout, API hiccup) just sat stuck with a code comment telling a human to go check the Stripe dashboard by hand — no automated recovery existed. That's now fixed:

- **Automated reconciliation** resolves stuck payouts every 5 minutes, safely (never guesses a stuck payout into "failed" — that would risk paying a cook twice).
- **Automatic weekly payouts** now run alongside on-demand cash-out, so a cook who forgets to tap "cash out" still gets paid.
- **Cooks can now see payout history and manage their bank account** from inside the app (via a real Stripe-hosted dashboard link — Preppa never touches the actual bank/card details).
- This was verified **end-to-end with real Stripe test-mode calls** — a real cook signup, real application, real admin approval, real Stripe onboarding, real cash-out, real reconciliation, real auto-sweep — not just tested in theory. See [[Payments]] and [[Changelog]] for the full account.

Separately, the project's `supabase/migrations/` history — which had large, silent gaps (65 migrations missing, 36 more mistimestamped) — was fully reconstructed from the live database. This matters to you mainly as: **CI can now actually verify database changes before they ship**, which it couldn't reliably do before. See [[Database]].

## Open questions worth asking the team

- **What's the actual go/no-go bar for launch?** [[Decisions]] documents a "GO is disallowed while any Critical/High audit finding is open" rule from an earlier audit — confirm whether that's still the standing policy and whether it's been re-run against the current state.
- **Who owns cook recruitment?** This is the real gating function right now, and it's not an engineering deliverable.
- **There is no dev/staging environment separation** — every build, on every branch, hits the same live Supabase project and (confirmed 2026-09-07) live Stripe key. This isn't a question so much as a standing hazard: anyone testing a change casually can create real orders and charge real cards. See [[Launch-Plan]] item on environment separation.

## Ready to launch, blocked on business work, not engineering

See [[Launch-Plan]] for the detailed checklist. In short: the technical foundation (payments, payouts, reconciliation, CI, migrations, hosting) is done and verified. What's left is confirming a few operational/security gaps (secret rotation, environment separation, monitoring) and — the real blocker — recruiting the first 5-10 real cooks.

## Where to go next

- Curious what's built vs. stubbed vs. flagged off → [[Features]]
- Planning a payments-adjacent change → [[Payments]] (read the reconciliation section before touching payout code)
- Wondering what's known-broken or fragile → [[Bugs]]
- Want the backlog, not just a snapshot → [[Tasks]]
- Want the "why" behind a technical choice → [[Decisions]]
- Want the full history of how we got here → [[Changelog]]

## Related

- [[Project]] · [[Architecture]] · [[Features]] · [[Payments]] · [[Tasks]] · [[Decisions]] · [[Changelog]] · [[Launch-Plan]]
