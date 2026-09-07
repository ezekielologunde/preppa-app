# Preppa — homemade food marketplace (Expo / React Native)

**This is the canonical repository** for the Preppa app and backend. A separate repository
(`ezekielologunde/Preppa`) exists under the same account and is an earlier/adjacent project
(landing-page work) — it is not this app and should not be treated as production truth for it.

Preppa is a real, live two-sided marketplace: home cooks ("preppers") sell homemade meals, cook
in customers' homes, run subscription meal plans, or host bookable food experiences; customers
browse, order, subscribe, and pay through the app. It is wired to a live Supabase project
(Postgres + Auth + Edge Functions + Storage + Realtime) and Stripe (Connect Express for cook
payouts). **This is not a demo** — orders, payments, and payouts move through real backend
services. See `docs/obsidian/PM-Onboarding.md` for a plain-language tour, or `docs/obsidian/Project.md`
for the full technical index (Architecture, Database, Backend, Payments, Features, Security,
Decisions, Bugs, Tasks, Changelog — kept in sync with the codebase per this repo's `CLAUDE.md`).

## Run

```bash
npm install --legacy-peer-deps
npx expo start            # press i / a, or scan the QR in Expo Go
npx expo start --web      # browser
```

Type-check: `npm run typecheck`. Bundle check: `npx expo export -p ios`.

## Structure

```
app/                      Expo Router routes (file-based; see app/ for the current route tree)
  (tabs)/                 home, experiences, feeds, my-hub, profile + custom tab bar
  hub/                    prepper "My Hub": orders, money, menu, create-meal, create-plan,
                          analytics, subscribers, in-home-vetting, fulfillment, ...
  admin/                  admin console (applications, orders, payouts, users, waitlist, ...)
src/
  theme/  data/  store/  ui/  components/  lib/
supabase/
  migrations/             full schema history (see docs/obsidian/Database.md)
  functions/              Edge Functions (see docs/obsidian/Backend.md and functions/MANIFEST.md)
  tests/regressions.sql   DB regression suite, run in CI
```

Route names change as features ship — the Expo Router tree in `app/` is the source of truth for
current screens; this README doesn't attempt to enumerate them.

## CI

`.github/workflows/ci.yml` runs `typecheck` (`tsc --noEmit`) and `db-regression-tests` (replays
every migration in `supabase/migrations/` from scratch against a fresh local Postgres, then runs
`supabase/tests/regressions.sql`) on every push/PR to `main`.
