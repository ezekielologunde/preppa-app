# Preppa — homemade food marketplace (Expo / React Native)

> [!IMPORTANT]
> ## Canonical Preppa repository
>
> This is the current production source of truth for the Preppa customer/prepper
> application and its Supabase backend.
>
> - Configured application URL: https://app.preppa.live
> - Default branch: `main`
>
> Two other same-account repositories exist and are **not** this app:
> - `ezekielologunde/Preppa` (default branch `master`) — an earlier/legacy Preppa
>   application foundation from July. Its `landing/` Next.js app is confirmed (via the
>   Vercel API, 2026-09-07) to be the **live** deployment behind `preppa.live` and
>   `help.preppa.live` — do not archive or stop deploying from it.
> - `ezekielologunde/preppa-landing` — a separate, more recently pushed marketing/
>   help-site implementation whose README claims the same two domains, but **has no
>   corresponding Vercel project** — confirmed not live. Treat its domain claim as stale.

Preppa is the production-configured source for a two-sided marketplace where home cooks
("preppers") can sell meals, cook in customers' homes, run subscription meal plans, and host
bookable food experiences. Customers can browse, order, subscribe, and pay through the app.
The code targets a live Supabase project and Stripe Connect, so production builds can create
real financial activity.

**Public launch is not signed off.** Deployment of the current migrations and Edge Functions,
controlled payment/refund/payout acceptance, native-device testing, legal approval, verified
cook supply, monitoring, and closed-beta evidence are still required. See
`docs/obsidian/Launch-Plan.md` for the evidence and remaining gates. See
`docs/obsidian/PM-Onboarding.md` for a plain-language tour, or `docs/obsidian/Project.md` for the
technical index.

## Run

```bash
npm ci
npx expo start            # press i / a, or scan the QR in Expo Go
npx expo start --web      # browser
```

Local release checks:

```bash
npm run typecheck
npm run build:web
npm run security:bundle
npm audit --audit-level=high
```

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

`.github/workflows/ci.yml` runs three jobs on every push or pull request to `main`:

- `typecheck` runs TypeScript validation.
- `web-build-security` exports the web app and scans the bundle for protected secret patterns.
- `db-regression-tests` replays every migration against a fresh local Supabase stack and runs
  `supabase/tests/regressions.sql`.

A green CI run validates this repository revision. It does not prove that the same migrations
and functions are deployed to the production project or that external provider acceptance has
passed.
