---
project: Preppa
type: project
status: active
last_updated: 2026-08-22
tags: [project/preppa, status/active]
---

# Preppa

## What it is

A two-sided marketplace for homemade food from vetted local home-kitchen cooks ("preppers"), plus adjacent food services: meal-plan subscriptions, ticketed experiences/classes, a food-services marketplace (cook-at-home/catering/grocery/bulk/errands via request→quote→accept→deposit), a creator video/photo feed, 1:1 chat, a paid PrepPlus membership, a cook back-office ("My Hub"), and an admin console.

Brand: warm-orange `#F26B1D`/`#FF5A24`, "Warm Trust" design direction (Airbnb-style warmth over gradient-saturated orange). Bundle id `live.preppa.app`.

**Stack:** Expo SDK 57 / React Native 0.86 / React 19.2 / expo-router 57 / TypeScript, deployed to iOS/Android (EAS) and web (Vercel, static SPA export). Backend: Supabase (Postgres + RLS + Auth + Edge Functions + Storage + Realtime). Payments: Stripe (Connect Express for payouts, native recurring for PrepPlus). Livestream: Mux (flag-disabled). Push: Expo Notifications.

## Status: live-money production system

Despite the README describing a "demo with no server," the app is wired to a **live** Supabase project (`fwidhpzwldneeaphrxgg`) and **live-mode Stripe** as of 2026-08-08. Real money moves through this app. See [[Bugs]] for the docs-drift note.

## Honest-v1 feature flags

Preppa was built as a ~48-screen demo; feature flags (`src/config/flags.ts`) hide surfaces that aren't real yet for the v1 pilot rather than deleting code.

| Flag | State | Note |
|---|---|---|
| experiences, feed, plans, services, prepplus, chat, notifications | ON | real, DB-backed |
| rewards | OFF | not live — hardcoded demo data, now redirect-guarded |
| live | OFF | Mux schema + plumbing exists; no moderation/kill-switch yet |

## Knowledge Base

- [[Architecture]] — system components, data flow, deployment
- [[Frontend]] — expo-router routes, `src/` layout, state management
- [[Database]] — Supabase schema, RPCs, RLS, migrations
- [[Backend]] — Edge Functions
- [[Security]] — auth, authorization, secrets, open risks
- [[Payments]] — full Stripe/Connect lifecycle
- [[Features]] — feature-by-feature implementation status
- [[Decisions]] — architectural & product decisions with rationale
- [[Bugs]] — known bugs, tech debt, docs drift
- [[Tasks]] — outstanding work
- [[Changelog]] — project history

## Source documents (in the repo, not duplicated here)

- `AUDIT.md` / `AUDIT_FULL.md` — living platform-integrity security audit (2026-07-14, verdict NO GO at the time, largely remediated since)
- `docs/REDESIGN-DIRECTION.md` — "Warm Trust" design brief
- `SPRINT-27-FEED-VIDEO-PLAN.md` — approved-but-unbuilt feed/video plan
- `LAUNCH-ACCOUNTS.md` — founder account-enrollment tracker (no credentials)
