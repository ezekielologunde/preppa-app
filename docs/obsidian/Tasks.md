---
project: Preppa
type: tasks
status: active
last_updated: 2026-09-07
tags: [project/preppa, type/tasks]
---

# Tasks

Part of [[Project]]. Outstanding work discovered during the audit — not a sprint backlog, a snapshot.

## Newly discovered (2026-09-07 session)

- [ ] **Confirm Stripe mode definitively** — evidence points to test mode (see [[Payments]] warning) contradicting the prior "LIVE since 2026-08-08" note; check the key prefix directly before either doc claim is trusted.
- [ ] **Test the native deep-link return path** — `connect-onboard`'s `?connect=return`/`?connect=refresh` redirect is proven on web; needs a real-device check that the universal link/app-scheme equivalent actually returns a cook to the app on iOS/Android after Stripe onboarding.
- [x] ~~Rotate the Resend API key found exposed in `api-keys-*.csv`~~ — **done 2026-09-08**, see [[Launch-Plan]] item 4.
- [ ] Recruit real cooks — the app is technically launch-ready end-to-end (onboarding, payments, payouts, reconciliation all proven), but zero real cooks means an empty marketplace on day one. This is manual business work, not an engineering task.
- [ ] Revisit instant payouts (debit card, ~1.5% Stripe fee) once the auto-sweep + reconciliation have run in production for a while — deliberately deferred, see [[Payments]] and [[Decisions]].
- [ ] Consider a real reconciliation job for `charge-due-cycles` (subscription billing) — it has the same ambiguous-error-leaves-row-pending pattern as payouts did, but no automated resolver was built for it this round.

## Security / ops hardening (from AUDIT.md's own recommended next steps)

- [x] ~~Confirm the Google OAuth client secret rotation~~ — **done 2026-09-08** (Critical #16 closed), see [[Launch-Plan]] item 4.
- [x] ~~Delete `app/mux-preppa.env` if it reappears; rotate the Mux token~~ — token rotated **2026-09-08**, see [[Launch-Plan]] item 4; file has not reappeared. Broadening `.gitignore` to `.env.*` still worth doing but low priority (no `.env*` file has ever been committed, per the git-history secret search this session).
- [x] ~~Build the payout/charge reconciliation job~~ — **done 2026-09-07** for payouts (see [[Payments]]); subscription-charge reconciliation is still open, see above.
- [x] ~~Rate-limit and alert on state-mutating admin RPCs~~ — rate limiting was already done 2026-07-15; alerting (real-time on role change/suspension + `detect_admin_anomalies()` cron for escalation bursts, suspend churn, refund volume, payment-failure bursts) added 2026-09-07. See [[Security]].
- [x] ~~Route admin alerts to a real destination~~ — **done 2026-09-07** via a scoped Resend API key (`resend_admin_alerts_api_key` Vault secret, sending-only, `preppa.live`-domain-restricted); `notify_admins()` emails both admins directly, verified live with a real test alert. The `admin_alert_webhook_url` Slack branch is still there, still unset, and not needed now.
- [x] ~~Fix Preppa's Auth SMTP sender~~ — **investigated 2026-09-08, turned out to be a false alarm.** A similarly-named `Supabase Auth SMTP` key was spotted in an unrelated Resend workspace and mistaken for Preppa's; a real OTP send (via the Auth REST API) confirmed Preppa's Auth SMTP already correctly sends from `noreply@preppa.live` through the right Resend account (`200`, logged). No change needed.
- [ ] Turn on branch protection on `main`; enable Dependabot security alerts (15 vulnerabilities flagged on push 2026-09-07: 10 high, 5 moderate — unreviewed); add `CODEOWNERS`.
- [x] ~~Vendor the remaining ~114 un-tracked live migrations~~ — **done 2026-09-07**, full 212-migration history restored; add a deploy-verification step diffing live Edge Function/RPC definitions against the repo is still open.
- [ ] Move session tokens to `expo-secure-store`; add a password-reset flow.
- [ ] Add a real regression test suite beyond the DB-level `supabase/tests/regressions.sql` (currently zero JS/TS tests, CI is `tsc --noEmit` + DB regressions only).
- [ ] Add `.env`/staging separation so not every build hits the live Supabase project and live Stripe mode.

## In-code "coming soon" surfaces

- [x] ~~Quotes payment — reconcile the "coming soon" UI copy with the working `accept-quote-and-deposit` backend~~ — **confirmed stale 2026-09-08**, no such copy exists in the current codebase; both quote-payment entry points already call the real backend flow.

## Dead-surface cleanup (found during Launch-Plan item 11, 2026-09-08)

- [ ] Remove the remaining `cod`-branch dead code now that checkout no longer offers it: `app/track.tsx`, `app/order/[id].tsx`, `app/(tabs)/orders.tsx`, `app/hub/order/[id].tsx`, `src/components/Handoff.tsx`'s `HandoffMode`, `src/store/store.tsx`'s `OrderFlow` type + seed mock order, `src/data/data.ts`'s `Cook.acceptsCod` field, and the demo line "Cash on delivery is fine?" in `app/chat/[cook].tsx`. None of these are currently reachable (checkout is Stripe-only), so this is cleanup, not a functional fix.
- [x] ~~Decide what to do with the 6 fake seed kitchens sitting in the live production `kitchens` table~~ — **done 2026-09-08**. Attempted full deletion (kitchens + their 30 orders/55 ledger entries/etc., all confirmed to be your own dev/admin/test accounts, no real customers) but it's genuinely impossible without weakening real safety guarantees: `ledger_entries` (all 6 kitchens), `subscription_events` (kitchen 1), and `messages` (kitchens 1 and 6) are all deliberately **append-only** tables (`block_mutation()` triggers), same protection class as `audit_log`. Every delete attempt correctly rolled back (nothing was ever partially deleted). Instead, set all 6 kitchens to `verification_status = 'rejected'`, `availability = 'paused'`, with a `rejection_reason` documenting why — permanently un-orderable, with real history (orders/ledger/messages) preserved intact per the ledger's own design intent.
- [ ] **Remove the `COOKS`/`KITCHEN_ID`/`seedCookForKitchen` client-side fallback system** — now provably dead for all customer traffic (the 6 kitchens it could ever resolve to are permanently `rejected`, so `seedCookForKitchen()` can never return a value for any RLS-visible kitchen). Not removed this round: `Meal.cook: CookId` (`src/data/data.ts`) is a *non-optional* field that real, non-seed meals also flow through via a `?? 'maria'` fallback (`src/data/supabaseRepository.ts:46`) — cleanly removing it means changing the `Meal` type and auditing every screen that reads `.cook` (broader than just the 8 screens that do `COOKS[cook]` lookups), which is a real refactor deserving its own careful pass against a codebase with zero JS/TS test coverage, not a rushed tack-on. See [[Launch-Plan]] item 11 and [[Decisions]].
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
