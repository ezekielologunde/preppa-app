---
project: Preppa
type: database
status: active
last_updated: 2026-09-07
tags: [project/preppa, type/database]
---

# Database

Part of [[Project]]. Live Supabase project: `fwidhpzwldneeaphrxgg`. See also [[Backend]], [[Security]].

> [!success] Full migration history restored (2026-09-07)
> `supabase/migrations/` previously held only 34 remediation-only files (2026-07-14→07-25); everything before and much of what was interleaved after had been applied live via dashboard/MCP and never vendored. Pulled the exact SQL for every applied migration from `supabase_migrations.schema_migrations` on the live project and reconstructed the full history: **212 migrations now replay cleanly from scratch** (verified via `supabase start` + `supabase/tests/regressions.sql`, wired into CI). A handful of statements that assume hosted-only objects (the platform's auto-RLS event trigger, the Stripe Sync Engine's `stripe.*` schema, `pg_cron`'s `cron.*` schema) were guarded with `to_regclass`/`to_regnamespace` checks so they no-op on a fresh local/CI stack but still run against the real hosted project. The schema below is now grounded in that history, not just observed from code.

## Core tables (fields as observed in code)

- **Identity/kitchens:** `profiles`, `kitchens` (`verification_status` incl. `suspended`, `availability`), `kitchen_private`, `kitchen_public`, `kitchen_capacity`, `verifications`, `audit_log` (append-only, RLS on with zero policies + all grants revoked).
- **Catalog:** `meals` (`status`: live/paused/sold_out/archived), `posts`, `post_likes`, `post_saves`, `follows`, `reviews`, `kitchen_rating`.
- **Orders/money:** `orders`, `order_items`, `ledger_entries` (append-only cook balance, kind: sale/fee/tip/refund/payout/adjustment/cod_liability), `payouts` (`status`: pending/paid/failed/**needs_review** (added 2026-09-07); `source`: manual/auto; `reconcile_attempts`, `failure_reason`, `reconciled_at`), `stripe_accounts` (now also `auto_payout_enabled`, `auto_payout_min_cents`, `payout_interval`, `last_auto_payout_at`), `payment_intents`, `memberships` (PrepPlus), `cook_memberships`, `rate_limits` (only table with its DDL fully in-repo). `kitchen_private` gained `food_handler_cert_status`/`food_handler_cert_expires_at` (2026-09-07).
- **RFQ/services:** `service_requests`, `service_request_targets`, `quotes`, `bookings` (unified RFQ + experience booking; `balance_cents` is `GENERATED ALWAYS AS (amount_cents - deposit_cents) STORED`).
- **Subscriptions:** `plans` (incl. `cadence_weeks`), `plan_items`, `subscriptions`, `subscription_cycles`, `subscription_cycle_items`, `subscription_box_items`, `subscription_preferences`.
- **Experiences/live:** `experiences`, `experience_sessions`, `experience_seat_reservations`, `experience_private`, `experience_waitlist`, `livestreams`, `livestream_secrets`.
- **Messaging/support:** `message_threads`, `messages` (rate-limited by trigger), `message_broadcasts`, `message_blocks`, `tickets`, `ticket_messages`, `notifications`, `push_tokens`.
- **`stripe` schema** — mirrored Stripe objects via `@stripe/sync-engine`.

## RPCs (SECURITY DEFINER convention)

Authorization pattern: `SECURITY DEFINER` + `set search_path` + in-body `auth.uid()`/role check, with tight per-role `revoke`/`grant execute`:
1. Self-scoped → `authenticated`, checks `auth.uid()`.
2. Money-finalizing/worker-only → `service_role` only, plus redundant in-body role assertion (defense in depth).
3. Admin → `authenticated`, re-checks `profiles.role` in body, `service_role` bypass branch.
4. `anon` systematically stripped from `SECURITY DEFINER` functions except deliberate read paths.

Key RPCs defined in-repo: `is_kitchen_owner`/`is_active_kitchen_owner`, `is_allowed_media_url(_array)`, `reserve_payout`/`finalize_payout` (advisory-lock two-phase payout), `accept_quote` (advisory lock + idempotency key), `reserve_balance_charge`/`finalize_balance_charge`, `finalize_booking_cancel`, `create_experience_booking` (`FOR UPDATE` seat claim), `finalize_experience_cancel`, `update_order_status`/`advance_order_status`/`decline_order`, `update_meal`/`set_meal_status`/`my_meals`, `set_kitchen_availability`/`set_kitchen_capacity`, `send_kitchen_broadcast`, `approve_kitchen`/`admin_suspend_kitchen`/`admin_reinstate_kitchen`/`admin_set_user_role`, 8 read-only `admin_list_*`/`admin_*_detail` RPCs, `reconcile_invoice` (service-role only — was anon-callable, could fabricate paid orders), `check_rate_limit`.

**Payout reconciliation RPCs (added 2026-09-07)**, all service-role-only unless noted: `claim_stale_payouts`/`reconcile_payout` (resolve payouts left `pending` by an ambiguous Stripe response), `claim_auto_payouts` (weekly sweep eligibility + advisory lock, mirrors `reserve_payout`'s math), `notify_admins`, `admin_list_payouts`/`admin_resolve_payout` (authenticated, `is_admin()`-gated — the only path that can move a `needs_review` payout to `paid`/`failed`), `my_payouts`/`my_payout_summary` (authenticated, owner-scoped), `set_payout_preferences` (authenticated, owner-scoped auto-payout opt-out/threshold), `admin_set_cert_status` (food-handler cert review), `nudge_stripe_onboarding`. `kitchen_balance_cents` was fixed to detect `service_role` via `auth.role()` instead of a deprecated `current_setting('request.jwt.claim.role')` check that silently returned 0 for every real service-role caller (worker functions, the auto-payout sweep) — see [[Bugs]].

Now fully vendored: the schema/RPC gap described above is closed as of 2026-09-07 (see migration-history callout at top). Historical audits (`AUDIT_FULL.md`) still document the pre-restoration state for reference.

## Trigger

`messages_rate_limit` (BEFORE INSERT on `messages`, 20/60s per sender) — the only trigger created in-repo.

## RLS

Only 3 policies are actually defined in-repo (`meals_write_own`, `capacity_owner_write`, `plans_owner_write`, all via `is_active_kitchen_owner`). `AUDIT.md` states RLS is enabled on all 53 public-schema tables with no naked allow-all policies; the real authorization surface is the RPC layer above, not RLS directly.

## Storage buckets

`avatars`, `meal-photos`, `post-videos` (public, in the media URL allowlist, 8MB, image MIME types), `cook-docs`, `kyc-docs` (private, signed URLs, 15MB). Direct-write policies dropped for all — writes go through `upload-media` Edge Function only (see [[Architecture]]).

## Client types

**No generated Supabase types exist** (`database.types.ts` absent). Every query is untyped; results are cast ad hoc. Real gap given how much schema lives only on the server.

## Migration history highlights

Full history now spans 2026-07-05 (base schema: profiles/kitchens/meals) through 2026-09-07 (payout reconciliation). Highlights: payout double-spend lock, quote double-booking lock, media-URL allowlist, kitchen-suspend bypass + seat-release bug, `reconcile_invoice` locked to service-role, rate-limit service-role-detection fixed twice (once broke checkout for 10 days — see [[Bugs]]), cancel-ledger double-deduction race fixed, `subscribe_box` duplicate guard, storage MIME/size limits, plan `cadence_weeks` added, in-home vetting schema/RPCs (2026-08-12), payout reconciliation + auto-payouts + onboarding hardening (2026-09-07). Full list in git history / migration filenames.

## Related

- [[Project]] · [[Architecture]] · [[Backend]] · [[Security]] · [[Bugs]]
