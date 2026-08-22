---
project: Preppa
type: tasks
status: active
last_updated: 2026-08-22
tags: [project/preppa, type/tasks]
---

# Tasks

Part of [[Project]]. Outstanding work discovered during the audit — not a sprint backlog, a snapshot.

## Security / ops hardening (from AUDIT.md's own recommended next steps)

- [ ] Confirm the Google OAuth client secret rotation (Critical #16, still open).
- [ ] Delete `app/mux-preppa.env` if it reappears; rotate the Mux token; broaden `.gitignore` to `.env.*`.
- [ ] Build the **payout/charge reconciliation job** — ambiguous Stripe errors currently leave rows `pending`/`charging` for a human to notice.
- [ ] Rate-limit and alert on state-mutating admin RPCs (`admin_suspend_kitchen`, `admin_set_user_role`); wire the two existing detection SQL queries to a real destination (Slack/email).
- [ ] Turn on branch protection on `main`; enable Dependabot security alerts; add `CODEOWNERS`.
- [ ] Vendor the remaining ~114 un-tracked live migrations; add a deploy-verification step diffing live Edge Function/RPC definitions against the repo.
- [ ] Move session tokens to `expo-secure-store`; add a password-reset flow.
- [ ] Add a real regression test suite (currently zero tests, CI is `tsc --noEmit` only).
- [ ] Add `.env`/staging separation so not every build hits the live Supabase project and live Stripe mode.

## In-code "coming soon" surfaces

- [ ] Quotes payment — reconcile the "coming soon" UI copy with the working `accept-quote-and-deposit` backend.
- [ ] In-app camera broadcast for Go Live (currently external RTMP only — no official Mux RN SDK).
- [ ] Cash on delivery — currently a placeholder UI with no real payment path; needs held cards / deposits / KYC design.

## Feature flags currently off (planned, not shipped)

- [ ] Rewards / referral program.
- [ ] Livestreaming — needs moderation, suspension-propagation, and a kill switch before re-enabling.

## Sprint 27 (approved plan, not started — see `SPRINT-27-FEED-VIDEO-PLAN.md`)

- [ ] Slice 1: feed tab entry, post saves, commerce-card availability hardening, prepper "Post" affordance, funnel logging.
- [ ] Slice 2: follows table + toggle, All/Following filter.
- [ ] Slice 3 (gated on 8 security + 8 performance ship gates): Cloudflare Stream video upload, composer, pooled player.
- [ ] Slice 4 (defer): Meal Drops — only as a scheduled/expiring post on an existing meal, never a new entity.
- [ ] Slice 5 (scaffold only, broadcast is NO-GO): `VideoProvider` interface + `AwsIvsProvider` stub.

## Redesign ("Warm Trust", `docs/REDESIGN-DIRECTION.md`)

- [ ] Slices 2–6: Discover/Store/Meal detail, Cart/Checkout/Orders/Track, Feed+Experiences, Messages/Profile/PrepPlus/Rewards, Prepper Hub + Admin — none shipped yet (only Slice 0–1 foundation + Home).

## Cleanup

- [ ] Update `README.md` (stale demo-mode description) and `LAUNCH-ACCOUNTS.md` (stale unchecked boxes).
- [ ] Resolve the two divergent `GRAD` palette exports (`src/theme/theme.ts` vs `src/data/data.ts`).
- [ ] Reduce the 39-route reliance on `src/data/data.ts` mock data; audit which persisted-store seed data is still reachable.

## Related

- [[Project]] · [[Bugs]] · [[Security]] · [[Payments]] · [[Features]]
