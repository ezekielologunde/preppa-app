---
project: Preppa
type: architecture
status: active
last_updated: 2026-08-22
tags: [project/preppa, type/architecture]
---

# Architecture

Part of [[Project]]. See also [[Frontend]], [[Database]], [[Backend]], [[Security]].

## Components & data flow

```
Expo app (iOS / Android / RN-Web SPA)
  ├─ supabase-js (anon key) ──► Supabase Postgres  [RLS + SECURITY DEFINER RPCs]
  │                             └─ Realtime (chat threads, notifications)
  │                             └─ Storage: avatars, meal-photos, post-videos, cook-docs, kyc-docs
  ├─ supabase.functions.invoke ─► Supabase Edge Functions (Deno) ──► Stripe (live)
  │                                                              └─► Mux (livestream, flag-off)
  ├─ Stripe SDKs directly: @stripe/stripe-js (web) / @stripe/stripe-react-native (native)
  └─ expo-notifications ──► Expo push service ◄── send-push edge function
Vercel  ── hosts `expo export -p web` SPA output only (no serverless functions)
GitHub Actions ── typecheck only, no tests/lint/build/deploy
```

- Single Supabase client: `src/lib/supabase.ts`, AsyncStorage-persisted session, `detectSessionInUrl:false`.
- **Authorization is server-authoritative.** `fetchAccountState()` derives `role`, `prepperStatus` (kitchen ownership + `verification_status='verified'`), `payoutsEnabled` (`stripe_accounts.payouts_enabled`), `isPrepPlus` (mirrors server `is_prepplus_member()`). `isAdmin` client-side is cosmetic only — every admin action is independently re-checked server-side.
- **Media uploads** are funneled through a single `upload-media` Edge Function (not vendored in-repo) which sniffs magic bytes server-side. Direct-to-Storage INSERT/UPDATE policies were dropped for 4 buckets so the proxy is the only write path, after a 2026-08-08 finding that HTML was accepted as `image/png`.
- **Provider split (SPRINT-27 plan):** Supabase is system of record for ownership, state, moderation, commerce links; provider APIs (Cloudflare Stream planned, Mux shipped for live) own media ingest/transcode/delivery only.

## Deployment

- **EAS** (`eas.json`): `development` (dev client), `preview` (internal, Android APK), `production` (`autoIncrement:true`). `submit.production` is empty — no store-submit config yet.
- **Vercel** (`vercel.json`): `expo export -p web` → `dist`, SPA catch-all rewrite.
- **CI** (`.github/workflows/ci.yml`): checkout → Node 20 → `npm ci` → `tsc --noEmit` only. No tests, lint, build, or deploy job.
- No `.env`/`app.config.ts` seam — every build (any branch) points at the same live Supabase project and live Stripe mode. See [[Bugs]].

## Known structural risk: git-vs-live drift

`supabase/migrations/` contains **no base schema** — only 34 remediation migrations dated 2026-07-14→07-25. The base schema (tables, most RLS policies, most RPCs) was created directly against the live project and is not vendored. Migration comments document real incidents caused by this (see [[Database]] §"Cross-cutting observations" and [[Bugs]]).

## Related

- [[Project]] · [[Frontend]] · [[Database]] · [[Backend]] · [[Security]]
