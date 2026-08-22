---
project: Preppa
type: frontend
status: active
last_updated: 2026-08-22
tags: [project/preppa, type/frontend]
---

# Frontend

Part of [[Project]]. See also [[Architecture]], [[Features]].

## Routing (`app/`, expo-router, 69 route files)

- `app/_layout.tsx` — root providers: `GestureHandlerRootView` → `SafeAreaProvider` → `StripeRoot` → `StoreProvider` → `ThemeProvider` → `AppShell`. Loads 8 font faces (Hanken Grotesk + Fraunces) without blocking first paint; `SplashOverlay` covers the swap.
- `app/(tabs)/` — Home, Experiences, Feed, My Hub, Profile, Orders. Tab visibility double-gated: `href:null` for off flags, and `BottomNav` hides on desktop (replaced by `SideRail` ≥700px) and hides `my-hub` unless `prepperStatus==='approved'`.
- Customer flow: `meal/[id]`, `cart`, `checkout`, `cod`, `handoff`, `track`, `order/[id]`, `review/[id]`, `discover`, `saved`, `favorites`, `addresses`, `payments`, `edit-profile`, `notifications`, `messages/*`, `chat/[cook]`, `apply`, `prepplus`, `rewards`, `tickets`.
- Services/experiences/plans: `service-request`, `request/[id]`, `quotes/[id]`, `experience/[id]`, `rate-experience/[bookingId]`, `plans`, `plan/[id]`, `build-plan`.
- Storefront: `store/[cook]`, `store/[cook]/feed`, `store/[cook]/live`, `post/[id]`.
- `app/hub/` (21 screens) — cook back-office: orders, requests, quotes, catering, money, menu, meal creation, plans, subscribers, experiences, tickets, analytics, fulfillment, pro tier, go-live, video recording/posting.
- `app/admin/` (9 screens) — index, applications, users, orders, plans, bookings, experiences, tickets, waitlist, audit.

**Navigation model:** single flat root `Stack`, headers disabled everywhere, screens supply their own `TopBar`. Responsive nav is a runtime branch, not a route change: `SideRail` (icon-only <1000px, labeled ≥1000px) replaces `BottomNav` at ≥700px width.

## `src/` layout

- `src/ui/` — primitive kit (`Press`, `GradBox`, `Avatar`, `Btn`, `Sheet`, `Dialog`, `Icon`, `Screen`, `TopBar`, `ToastHost`, …), barrel-exported.
- `src/components/` — 30 feature components: `Onboarding`, `cards` (MealGrid/HeroDrop/CookRail/…), `FeedReel`, `Handoff`, `MealsBrowser`, `CardPaymentSheet`, `PhotoUploader`, `LocationPicker`, `SideRail`, `admin/*`, `plans/*`.
- `src/theme/theme.ts` — design tokens: `GRAD` (8 warm per-cook ramps), `BRAND_PRIMARY='#FF5A24'`, light/dark `Palette`, `type()`/`radius`/`shadow` helpers. Public API kept stable across the 2026-07 "Warm Trust" redesign so ~74 screens inherited without churn.
- `src/store/store.tsx` (716 lines) — **hand-rolled React Context store**, no Redux/Zustand/react-query. Holds onboarding, dark mode, cart, tip, fulfillment mode, location, identity, addresses, role/prepper lifecycle, notification counts, toasts. Persisted to AsyncStorage key `preppa.v1`. Imports seed/mock data (`SEED_REQUESTS`, `CONVERSATIONS`, `SEED_ORDERS`, `SEED_ADDRESSES`) alongside real state — see [[Bugs]].
- `src/data/` — repository seam: `repository.ts` (`MealRepository`/`CookRepository`/`ExperienceRepository`/`PlanRepository`, defaults to `makeSupabaseRepositories()`), `cache.ts` (bespoke stale-while-revalidate cache over `useSyncExternalStore`, dedupes concurrent fetches per key), `data.ts` (mock catalog, still imported by 39 route files).
- `src/lib/` — 24 domain API modules: `supabase.ts`, `admin.ts`, `subscriptions.ts`, `feed.ts`, `experiences.ts`, `messages.ts`, `services.ts`, `payments.ts`, `orders.ts`, `connect.ts`, `membership.ts`, `tickets.ts`, `cookPro.ts`, `livestream.ts`, `push.ts`, `geo.ts` (keyless OSM Nominatim), `nativeStripe.ts`/`.web.ts`.
- `src/config/flags.ts` — the v1 feature-flag file (see [[Project]]).

## Testing

No test files, no test runner configured (`devDependencies` only has `@types/react`, `typescript`).

## Related

- [[Project]] · [[Architecture]] · [[Features]] · [[Bugs]]
