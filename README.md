# Preppa — customer + prepper app (Expo / React Native)

A faithful implementation of the **Preppa** design prototype (`../design/Preppa App.html`)
as a real Expo Router + TypeScript app. Preppa is a marketplace for homemade food cooked by
vetted local cooks — warm-orange `#F26B1D` brand, calm surfaces, trust & safety as the core.

Conventions mirror the reference production codebase (`../design/_reference/app-source`):
Expo Router, an `@preppa/ui`-style primitive kit, `expo-linear-gradient` placeholder gradients,
and the canonical WARM design tokens.

## Run

```bash
npm install --legacy-peer-deps
npx expo start            # press i / a, or scan the QR in Expo Go
npx expo start --web      # browser
```

Type-check: `npx tsc --noEmit`. Bundle check: `npx expo export -p ios`.

## What's implemented

**Customer side**
- **Splash** → **premium onboarding/auth** (welcome, Apple/Google/email, 6-digit OTP with
  error + resend cooldown, goal + cuisine steps, "setting up" with a recoverable error). Demo
  OTP code: **481206**. Replay from Profile → *Replay onboarding*.
- **Tabs**: Home · Experiences · Feed · My Hub · Profile.
- **Home** — calm hub: warm header, sticky search, "Today's drop" hero, curated grid, experiences
  rail, Cook-at-my-place + meal-plan shortcuts.
- **Explore** — search + cuisine chips + responsive meal grid.
- **Order flow** — meal detail → cart (tip, founding-cook fee waiver) → checkout (Pay online vs
  **Cash on delivery**) → the signature **COD QR handoff** → **live tracking**.
- **Experiences** — services (Cook at My Place, Catering, Grocery, Bulk, Errands) with a full
  request → fixed-price quotes → accept & pay flow, plus classes/supper-club experience details.
- **Meal plans** — subscribe to a cook's weekly box, build-your-own (10% bundle), and manage.
- **Storefronts** — every cook has a public kitchen page (menu, plans, experiences, reviews).
- **Feed** — vertical video reels; **Notifications** (alerts + messages) and **chat**.
- **Dark mode** — warm near-black theme, toggle in Profile.

**Prepper "My Hub"**
- Landing with **Focus / Dashboard** layouts, pinned **Open/Paused** availability toggle, dark
  balance card, and an **action queue** (accept/decline orders, respond to catering, confirm won
  quotes). Orders, catering requests/quotes, earnings + payout, menu + create-meal/create-plan,
  order detail, analytics, meal plans, subscribers.

**Responsive** — bottom tab bar on phones; a persistent **left rail** on tablet (icon-only) and
desktop (labeled), with the bottom bar hidden and the Home header de-duplicated.

## Structure

```
app/                      Expo Router routes
  _layout.tsx             providers, fonts, splash + onboarding gating, responsive rail
  (tabs)/                 home, experiences, feeds, my-hub, profile + custom tab bar
  meal/[id], cart, checkout, cod, track, explore, notifications, chat/[cook],
  experience/[id], request/[svc], quotes/[id], plans, plan/[id], build-plan, store/[cook]
  hub/                    orders, order/[id], catering, request/[id], money, payout, menu,
                          create-meal, create-plan, bid/[id], plans, subscribers, analytics
src/
  theme/  data/  store/  ui/  components/
```

Data and forms are illustrative demo content (they validate and confirm but don't hit a server),
matching the prototype. Placeholder food imagery uses the design system's deterministic
per-item gradient convention.
