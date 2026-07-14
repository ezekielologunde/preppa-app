# PREPPA — Platform Integrity Audit (living report)

Grounded audit of the whole platform: real-vs-mock, integrity, security, orphans, red-team.
Produced by a 23-agent audit fleet (16 subsystem audits + 6 security red-team categories +
1 verdict-synthesis pass) reading the actual code and the live Supabase project. Read-only —
nothing was fabricated; every finding cites file:line, a query, or live row data. Full
per-subsystem traceability matrix and every red-team attempt: **[AUDIT_FULL.md](./AUDIT_FULL.md)**.

_Last run: 2026-07-14. App project: `fwidhpzwldneeaphrxgg`. Verdict: **NO GO**._

---

## Update — 2026-07-14, post-fix-merge

[PR #1](https://github.com/ezekielologunde/preppa-app/pull/1) merged to `main` (squash `2659588`): all **16 Critical** findings below have a real code fix in the repo now (status marked inline on each item below). Summary:

- **Fixed and fully live already:** #5 create_post media allowlist + storage fix (pure DB RPC, no Edge Function involved), #6 native checkout blocked, #9 review submission, #11 order tracking — plus the client-side livestream gating for #3.
- **Fixed in code, DB migration already applied live, but the Edge Function that calls the new RPC still needs redeploying:** #1 (connect-payout), #2 (accept-quote-and-deposit).
- **Fixed in code, held for a deploy step not yet authorized:** #4 (mux-webhook fail-closed — needs redeploy), #7 (meal edit/pause/archive — needs migration `20260714070000`), #8 (My Hub/My-menu — same migration), #10 (kitchen suspend — needs migration `20260714060000`), #12 (kitchen-availability persistence — needs migration `20260714050400`, which includes a one-time data-fix for the 2 real kitchens currently stuck paused).
- **Partially addressed:** #13 (tests/CI) — a typecheck CI gate now exists and runs on every PR; a full regression test suite does not.
- **Not started:** the ~22 High-severity findings (payout-gating gaps on plans/quotes, legacy Stripe-subscription cleanup, admin visibility gaps, chat rate limits, refund idempotency, etc.), real meal-photo upload (needs a new native dependency), and a fresh independent re-verification pass.

**⚠️ Superseded by the sections below:** all 16 Criticals and 9 of ~22 High findings are now merged **and deployed** ([PR #5](https://github.com/ezekielologunde/preppa-app/pull/5)), and an independent re-verification pass has run (see "Update — 2026-07-14, post-merge security re-audit" below). The "Not started" line above is stale.

---

## Update — 2026-07-14, post-merge security re-audit (supersedes the section above)

[PR #5](https://github.com/ezekielologunde/preppa-app/pull/5) (9 High findings) merged and deployed. Immediately after, a dedicated read-only security re-audit was run to retest — not assume — every fix from both PR #1 and PR #5, plus fresh ground. It found the new kitchen-suspend feature had real gaps, all now closed via [PR #6](https://github.com/ezekielologunde/preppa-app/pull/6) (migration `20260714090000`), deployed live.


A read-only security re-audit was run immediately after PR #1 (Critical) and PR #5 (High) merged and deployed, specifically to retest those fixes rather than trust them. Scope was explicitly read-only: no destructive simulations, no live credential-stuffing, no mobile-device testing, no backup/restore drills.

**Verdict at time of audit: NO GO** (score 50/100) — before the fixes in this section were applied. All 5 confirmed-open High findings below are now fixed and deployed (PR #6).

This was a read-only re-audit of Preppa (Supabase project fwidhpzwldneeaphrxgg) performed 2026-07-14, the same day two large remediation PRs (#1 "Critical", #5 "High") were merged. Scope was explicitly read-only: no destructive simulations, no live credential-stuffing, no mobile-device testing, and no backup/restore drills were run — those areas are unverified, not confirmed safe.

Of 41 raw findings, an adversarial verification pass was run on the 9 items flagged High severity (no Critical-severity items were raised in this pass). Result: 5 of 9 are CONFIRMED still open on the live system; 4 are REFUTED — independent re-checks showed they had since been redeployed/fixed live (create-subscription/manage-subscription 410 stubs, refund idempotencyKey on cancel-booking/cancel-experience-*, the chat rate-limit trigger, and the other PR #5 migrations, which turned out to be live despite a migration-ledger bookkeeping gap).

The good news, independently re-verified: the two headline Critical fixes — reserve_payout/finalize_payout's advisory-lock payout double-spend fix, and accept_quote's advisory-lock + unique-index quote double-booking fix — are genuinely live and correct, as is stripe-webhook signature verification and mux-webhook's fail-closed behavior.

The bad news: 5 confirmed-open High findings show the kitchen-suspension safety mechanism shipped in PR #5 is incomplete. A suspended kitchen (or its owner) can still: (1) cash out its full ledger balance via reserve_payout/connect-payout because that RPC checks only owner_id, never verification_status; (2) directly insert/update rows in `plans` via REST (RLS checks owner_id only) and get customers billed for an unapproved/suspended kitchen; (3) submit new paid-service quotes via submit-quote (owner_id-only check); and separately, subscribe-plan/subscribe-box are missing the payout-gating/vacation-mode checks present in the repo but never deployed live, so customers can subscribe to kitchens that cannot receive payouts or are on vacation. Independent of suspension entirely, release_experience_seats is a SECURITY DEFINER RPC granted EXECUTE to `authenticated` with zero ownership check — any logged-in user can release any other user's confirmed experience-booking seat reservation today, with no preconditions. This is a broken-access-control bug with real user-facing impact.

This audit also surfaced a recurring "merged to git ≠ deployed live" gap: several fixes existed correctly in the repo but had not been redeployed to the live Edge Functions/migrations at various points during the review window (some were fixed mid-review, some remain undeployed). This is a process risk independent of any single finding.

### High findings — status after independent follow-up

4 of the 5 confirmed-open findings below were fixed via a dedicated follow-up (PR #6, migration `20260714090000`); one (subscribe-plan/subscribe-box gating) turned out to already be resolved by an earlier deploy pass that happened concurrently with this audit run — confirmed directly against live Edge Function source rather than assumed.

1. ✅ **FIXED, live** (PR #6). High — Kitchen suspension does not revoke payout capability: reserve_payout() (called live by connect-payout Edge Function) checks only kitchens.owner_id, never verification_status; admin_suspend_kitchen() never touches stripe_accounts.payouts_enabled. A suspended kitchen with an existing Stripe Connect account and ledger balance can still cash out via connect-payout.
2. ✅ **FIXED, live** (PR #6). High — plans table RLS write policy (plans_owner_write) and plan-upsert Edge Function authorize by kitchens.owner_id only, never verification_status. Any authenticated user with a kitchens row (pending/rejected/suspended) can directly INSERT/UPDATE plans via REST, or call plan-upsert, bypassing both the suspend feature and the payouts-enabled gate; live plan-upsert (v3) additionally has no payouts_enabled check at all for new plans.
3. ✅ **FIXED, live** (PR #6). High — submit-quote Edge Function authorizes by kitchens.owner_id only (no verification_status check); a suspended kitchen can still submit new paid-service quotes, and accept_quote() does not re-check kitchen verification status before creating a real deposit PaymentIntent.
4. ✅ **Already resolved** (independently verified live — the payout-gating/vacation-mode checks were deployed in an earlier pass that overlapped with this audit run, not via PR #6). High — subscribe-plan and subscribe-box live Edge Functions are missing the payout-gating (stripe_accounts.payouts_enabled) and vacation-mode (is_kitchen_orderable) checks that exist in the repo but were never redeployed. Customers can currently subscribe to (and be billed for) plans/boxes from kitchens that cannot receive payouts or are on vacation.
5. ✅ **FIXED, live** (PR #6). High — release_experience_seats is a SECURITY DEFINER RPC granted EXECUTE to `authenticated` with zero ownership check. Any logged-in user can call it directly to release any other user's confirmed experience-booking seat reservation, with no relationship to that booking required — a live, precondition-free broken-access-control bug.

### 4 findings the re-audit flagged as open, then refuted on its own adversarial re-check
(same "merged ≠ deployed" timing issue — these had been redeployed moments before or during the review, so the audit's own second pass caught the drift itself)

- **create-subscription and manage-subscription are NOT stubbed live -- the full legacy real-money Stripe-subscription path is still deployed and callable by any authenticated user**
  Re-ran the exact same checks the finding cites. Result: the finding is REFUTED (stale) — the endpoints have since been redeployed and now match the repo's 410 stubs.

Evidence:
1. mcp__claude_ai_Supabase__get_edge_function('create-subscription', project fwidhpzwldneeaphrxgg) now returns: id d7072087-8419-4520-9239-1b670f7a9750, version 3 (not 2), created_at 1783749821701, updated_at 1784021081102 — i.e. updated_at != created_at, meaning it WAS redeployed after creation, contradicting the finding's claim that "created_at==updated_at, i.e. never redeployed." The returned file content is now word-for-word the repo's 410 stub: 'This endpoint has been retired. Use subscribe-plan instead.' with the same 'DEPRECATED (audit High finding)' header comment — not the legacy stripe.subscriptions.create(...off_session:true...) code the finding quotes.
2. Same for manage-subscription: id ce6f1edc-ae82-44a9-b4fe-5fc50e37e707, version 3, created_at 1783749849826, updated_at 1784021097096 (updated after creation). Content returned is the repo's 410 stub ('Use pause_subscription/resume_subscription/cancel_subscription instead'), not the legacy stripe.subscriptions.update()/.cancel() code.
3. Read the repo files directly (C:\Users\WT8\preppa\preppa-app\supabase\functions\create-subscription\index.ts and \manage-subscription\index.ts) — both are the 20-line 410 stubs, and the live get_edge_function content matches these stubs verbatim (same corsHeaders block, same comment text, same Deno.serve body).
4. execute_sql on public.plans still returns {total:1, with_price_id:0}, but this is now moot since the endpoint itself is properly retired regardless of plans data.

Conclusion: the divergence the finding describes (repo=stub, live=legacy real-money code) no longer exists. Both Edge Functions were redeployed (version bumped 2→3, updated_at now postdates created_at by ~4.5 days worth of seconds — consistent with a deploy that happened after the finding was first written) and the live source now exactly matches the safe stub. The finding should be marked resolved/fixed as of this verification, not left open. The regression-test recommendation (assert live sha256 matches stub on every deploy) remains sound practice going forward, but the specific vulnerability described is no longer present in the live system as of this check (2026-07-14).

- **Refund idempotency-key fix for cancel-booking / cancel-experience-booking / cancel-experience-session exists only in git -- live functions still call stripe.refunds.create() with no idempotencyKey (double-refund race is still live)**
  REFUTED — the finding's evidence is stale. Independently re-fetched all three live Edge Functions via get_edge_function (project fwidhpzwldneeaphrxgg):

- cancel-booking (id 24d3d60c-...): now version 3, created_at=1783757460413, updated_at=1784020949901 (differs from created_at, i.e. it HAS been redeployed since the version the finding examined). Live source contains: `await stripe.refunds.create({ payment_intent: (bk as any).deposit_pi_id }, { idempotencyKey: \`refund_${bookingId}\` });` — matches repo file supabase/functions/cancel-booking/index.ts:51 exactly.
- cancel-experience-booking (id 75f0454b-...): now version 3, created_at=1783980119858, updated_at=1784021009888 (redeployed). Live source contains `await stripe.refunds.create({ payment_intent: b.deposit_pi_id }, { idempotencyKey: \`refund_${b.id}\` });` matching the repo file exactly.
- cancel-experience-session (id 97dd99e9-...): now version 3, created_at=1783980149873, updated_at=1784021055177 (redeployed). Live source contains `await stripe.refunds.create({ payment_intent: b.deposit_pi_id }, { idempotencyKey: \`refund_${b.id}\` });` matching the repo file exactly, inside the per-booking loop.

All three live deployments are now version 3 (the finding cited version 2 and updated_at==created_at, i.e. never-redeployed) — meaning a redeploy happened after the finding's evidence was captured, and that redeploy carried the idempotencyKey fix from the repo into production. I re-read the exact repo files (cancel-booking/index.ts, cancel-experience-booking/index.ts, cancel-experience-session/index.ts) and diffed them line-for-line against the live get_edge_function source: they are identical with respect to the refund call and its idempotencyKey argument.

Conclusion: the double-refund race described by the finding is no longer live. This finding should be marked resolved/no longer reproducible — the underlying fix has since been deployed (functions are at version 3 now, not version 2 as the finding's evidence showed). Recommend closing this finding but noting that the regression-test recipe suggested (grep get_edge_function source for `idempotencyKey: \`refund_`) now passes for all three functions, which is good future practice to re-verify after any subsequent redeploy.

- **PR #5 'chat rate limit' fix (messages_rate_limit trigger) was never deployed — 1:1 messages remain unrate-limited on the live DB**
  Re-ran the exact evidence independently against project fwidhpzwldneeaphrxgg:

1. pg_trigger for public.messages (not tgisinternal) returns 5 rows, not 4 as the finding claimed: message_after_insert, message_sender_role, messages_no_delete, messages_no_update, AND messages_rate_limit — with definition `CREATE TRIGGER messages_rate_limit BEFORE INSERT ON public.messages FOR EACH ROW WHEN ((new.kind IS DISTINCT FROM 'broadcast'::text)) EXECUTE FUNCTION enforce_message_rate_limit()`. This directly contradicts the finding's core evidentiary claim.

2. pg_proc lookup for enforce_message_rate_limit returns 1 row (not zero as claimed), with a function body that matches the git migration file supabase/migrations/20260714080300_high_fix_chat_rate_limit.sql verbatim (20-message/60-second cap, excludes kind='broadcast', SECURITY DEFINER, search_path pinned).

3. list_migrations on the live project shows all 5 PR #5 high_fix migrations ARE present in schema_migrations, including one literally named "high_fix_chat_rate_limit" — but recorded under version "20260714092042" rather than the git filename's "20260714080300" prefix. The finding searched for version LIKE '2026071408%' and for name matching '%high_fix%' but apparently that combined/mis-scoped query (or a stale read) produced a false "zero rows" result; the actual live schema_migrations table clearly has these rows when queried by name. All 5 high_fix_* names appear consecutively (091947, 092012, 092030, 092042, 092057), just with different timestamps than the git filenames (080000-080400), which is presumably an artifact of how/when the migration was applied (e.g. reconciled or repaired), not evidence of non-deployment.

Conclusion: the finding is REFUTED. The fix (trigger + function + migration record) is fully live and functionally active on the live database exactly as the migration file specifies. The original evidence citing "4 triggers, function does not exist, zero matching migration rows" does not reproduce on independent re-query — it appears to have been stale or based on a mis-scoped/incorrect query. No open vulnerability here; 1:1 messages ARE rate-limited to 20/60s live.

- **PR #5's other 4 High-severity migrations are also undeployed live (payout-gating, vacation-mode enforcement, admin_set_user_role, active-owner gaps)**
  REFUTED (the finding does not hold up). I independently re-ran the same class of check the original finding used (querying supabase_migrations.schema_migrations on project fwidhpzwldneeaphrxgg), then went one level deeper and read the actual live function definitions via pg_get_functiondef, which is the ground truth for "is the fix live," not the migration ledger.

Step 1 - reproduced the ledger gap: `select version from supabase_migrations.schema_migrations where version in ('20260714080000','20260714080100','20260714080200','20260714080300','20260714080400')` returns 0 rows. So the finding's literal evidence claim (these exact migration versions are absent from the ledger) is TRUE and reproducible.

Step 2 - but ledger absence does not mean the fix isn't live. A broader LIKE '2026071408%' scan shows 4 *other* migrations in that same timestamp neighborhood ARE recorded (20260714081109 critical_fix_kitchen_availability_persist, 081306 critical_fix_kitchen_suspend_and_active_owner_check, 081332 critical_fix_meal_edit_pause_archive, 081926 admin_suspend_reinstate_kitchen) — different content, so this alone doesn't resolve it either way.

Step 3 - the decisive check: I pulled the live function bodies for every function each of the 4 disputed migrations touches, via `pg_get_functiondef` on pg_proc, and diffed them against the migration files in the repo:
- 20260714080000 (active-owner gaps): live `decline_order`, `advance_order_status`, `set_kitchen_capacity`, `prepper_incoming_requests` all contain `is_active_kitchen_owner(...)` checks / verified-kitchen-only joins, byte-for-byte matching the migration file (supabase/migrations/20260714080000_high_fix_remaining_active_owner_gaps.sql).
- 20260714080100 (payout gating for quotes): live `accept_quote` contains `if not public.kitchen_payouts_enabled(v_quote.kitchen_id) then raise exception ... errcode = 'P0013'` exactly as in the migration file.
- 20260714080200 (vacation mode for experience bookings): live `create_experience_booking` contains `if not public.is_kitchen_orderable(e.kitchen_id) then raise exception 'This kitchen is not taking bookings right now.'` exactly as in the migration file.
- 20260714080400 (admin_set_user_role): the function exists live, SECURITY DEFINER, with the caller-is-admin check, last-admin-protection guard, and `insert into audit_log (...) values (auth.uid(), 'user_role_changed', ...)` — identical to the migration file.

All four fixes are functionally present and live in the database right now. The only thing actually true in the cited evidence is that these specific migration filenames/timestamps never got recorded in supabase_migrations.schema_migrations — a deploy-tooling/ledger bookkeeping gap (the fixes were likely applied via a different mechanism, e.g. Supabase SQL editor or a `db push` that didn't register history for these exact versions), not a failure to deploy the actual fix. The original finding conflated "not in the migration ledger" with "not deployed / still exploitable," which is the wrong inference here — I verified the actual runtime object, which is the correct source of truth, and it shows the fix is live.

Net: I could not reproduce an exploitable gap for any of the 4 (active-owner gaps, payout-gating, vacation-mode-for-experiences, admin_set_user_role). This finding should be downgraded from "High / open, exploitable" to, at most, a low-severity process note: "migration ledger (schema_migrations) is missing entries for 5 files that were applied to the live DB by some other means; re-run `supabase migration repair`/history sync so future `db push` doesn't attempt to redeploy or drift." It is not a live security exposure. (Scope note: I did not verify the Edge-Function side of payout gating for plan-upsert/subscribe-plan, since that lives in Edge Function source, not a DB migration, and is outside what this specific finding's evidence cited — that would need a separate check of the deployed function bundle, not schema_migrations.)

### Not independently tested (explicitly out of scope, not confirmed safe)

- No destructive simulations, live credential-stuffing, mobile-device testing, or backup/restore drills were performed at all in this review (explicitly out of scope per user instruction) — these areas are UNVERIFIED, not confirmed safe, and should not be assumed fine.
- Residual bare is_kitchen_owner() usage (vs is_active_kitchen_owner()) in messaging/ticket RPCs (add_ticket_message, create_ticket, list_threads, mark_thread_read, etc.) and several read-only financial RLS policies/functions (kitchen_balance_cents, kitchen_earnings_summary, meals_select_own, ledger_select_own, payouts_select_own, stripe_accounts_select_own) — flagged as a product-decision item, not exercised against a live suspended kitchen since none currently exists in the data (0 non-'verified' kitchens today).
- reconcile_paid_invoice()'s broader EXECUTE grants (PUBLIC/anon/authenticated) vs its sibling reconcile_paid_pi() (service_role only) — not exploitable today because Postgres blocks direct invocation of trigger-return-type functions outside trigger context, so this could not be live-tested as an actual call path in this read-only review.
- connect-payout's blanket error-suppression (all non-mapped errors collapse to one generic 500) — flagged as an observability gap, not verifiable as a security issue without triggering real failure conditions, which was out of scope.
- Whether client mobile/web app code ever actually calls release_experience_seats or the plans-table direct-REST path today — confirmed these are reachable at the API layer via static analysis of grants/RLS/source, but exercising them live (even as a proof-of-concept) was out of scope for this read-only review.

### Recommended next slice (per the re-audit)

Ship one focused patch set covering the 5 confirmed-open High findings, since all are small, well-understood SQL/Edge-Function changes: (1) add `and verification_status = 'verified'` (or call is_active_kitchen_owner) to reserve_payout, and/or have admin_suspend_kitchen also flip stripe_accounts.payouts_enabled=false as defense-in-depth; (2) change plans_owner_write's RLS predicate to is_active_kitchen_owner(kitchen_id) and add the same check plus a payouts_enabled gate (applied to both inserts and updates) to plan-upsert; (3) add a verification_status check to submit-quote and to accept_quote(); (4) redeploy subscribe-plan and subscribe-box so the already-written payout-gating/is_kitchen_orderable checks actually go live; (5) REVOKE EXECUTE on release_experience_seats from authenticated/PUBLIC, granting only service_role, or add an internal auth.uid()-based ownership check. After each fix, re-verify against LIVE state via get_edge_function/pg_get_functiondef (not git diff or migration-ledger presence) — this review repeatedly found "merged" did not mean "deployed," in both directions (some fixes were live-but-uncommitted-looking, others committed-but-undeployed). As a follow-on slice: close the remaining Medium items (create-order missing Stripe idempotencyKey, cancel-booking's un-locked ledger-entry insert enabling double-deduction of a cook's balance on refund retries, main-branch branch-protection, Supabase advisor SECURITY DEFINER anon/authenticated grant triage), and put a standing process in place (e.g., a deploy-verification script that diffs live Edge Function sha256 / pg_get_functiondef output against the repo after every merge) to prevent recurrence of the git-vs-live drift seen across this and the prior audit cycle.

### Full raw finding counts (this re-audit pass only)

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 9 |
| Medium | 8 |
| Low | 10 |
| Informational | 14 |

| Status | Count |
|---|---|
| open | 27 |
| already_fixed_verified | 11 |
| not_testable_in_this_environment | 3 |

Medium/Low/Informational items (mostly: create-order missing a Stripe idempotencyKey, cancel-booking ledger-entry insert not locked, GitHub branch-protection gaps, residual bare is_kitchen_owner() usage in read-only/messaging paths) are not itemized here — see the workflow journal for the full list. None were escalated to Critical/High by adversarial review.

---

## Update — 2026-07-14, 8-section/34-item checklist audit (adapted for RN/Expo, supersedes nothing above — additive)

A separate, structured "vibe-coded app" security checklist (34 items across environment/secrets,
database, auth/session, server-side validation, dependencies, rate limiting, CORS, and file
uploads) was run against the current live state, independently of the two prior audit passes above.
14 agents (1 discovery + 8 section audits + verification), read-only/static analysis, adapted for
this being a React Native/Expo + Supabase app rather than Next.js/Vite (no middleware.ts, no
NEXT_PUBLIC_/VITE_ prefix — items that only make sense for that stack were marked N/A).

**Raw checklist result: 21 PASS · 3 FAIL · 15 PARTIAL · 2 N/A (41 items scored).**

### 🔴 One CRITICAL finding — confirmed live, fixed same session

**`reconcile_invoice()` — unauthenticated financial fraud.** This `SECURITY DEFINER` Postgres
function had **zero authorization checks in its body** and was directly `EXECUTE`-granted to
`anon` and `authenticated` (confirmed live via `pg_proc.proacl` before the fix). Any client could
call it directly with a guessed/known `stripe_subscription_id` and a fresh, attacker-chosen invoice
ID to fabricate a `pay_status='paid'` order plus a `'sale'` ledger credit — with **zero real Stripe
payment ever collected**. Since `kitchen_balance_cents()` sums `ledger_entries` and
`reserve_payout()`/Stripe Connect pays out real USD against that balance, this was a direct path to
extracting real money for fake sales. The function also had **zero presence in git/migration
history** — it was created live outside the vendored migrations, meaning the repo's version-controlled
state did not reflect production for this function.

**Fixed same session:** `EXECUTE` revoked from `anon`/`authenticated`, granted to `service_role`
only, plus an inline `service_role`-only check added to the function body as a second layer
(matching the `admin_set_user_role` inline-check idiom already used elsewhere). Applied live and
independently re-verified (`proacl` now shows only `postgres`/`service_role`). Vendored into
`supabase/migrations/20260714110000_critical_fix_reconcile_invoice_service_role_only.sql` and
merged via PR #10.

### 🟠 Three more findings confirmed and fixed same session

1. **`is_kitchen_owner()` missing `verification_status` check** — a suspended/rejected kitchen
   owner retained access to messaging RPCs (`create_ticket`, `add_ticket_message`, `open_thread`,
   `mark_thread_read`, `list_threads`, etc.) and financial-summary RPCs (`kitchen_balance_cents`,
   `kitchen_earnings_summary`) after revocation, since the check only verified `owner_id`.
   Confirmed via live grep that every caller is a messaging/financial-summary path, not an
   onboarding/application-stage flow, so tightening to require `verification_status = 'verified'`
   was safe. **Fixed and merged** (PR #10).
2. **No server-side file-type/size limits on public/private upload buckets** — `avatars`,
   `cook-docs`, `meal-photos`, and `kyc-docs` all had `file_size_limit`/`allowed_mime_types` set to
   `NULL` live, relying solely on the client's `accept="image/*"` attribute — trivially bypassed by
   calling the upload functions directly. The `post-videos` bucket, by contrast, already had a real
   allowlist/cap, proving the pattern was known and simply hadn't been applied elsewhere. **Fixed**:
   added an image-only MIME allowlist (jpeg/png/webp/heic/heif) and a size cap (8MB for
   avatars/meal-photos, 15MB for cook-docs/kyc-docs) directly on the storage buckets, so Storage
   itself rejects mismatched/oversized uploads regardless of client behavior. Applied live and
   merged (PR #10).
3. **No rate limiting on any Stripe/Mux-calling Edge Function** — a grep across all 27 hand-written
   Edge Functions for rate-limit/throttle logic returned zero hits, despite a proven, cheap DB-level
   pattern already existing for chat (`enforce_message_rate_limit()`, 20 msgs/60s) and broadcasts
   (`send_kitchen_broadcast()`'s inline 3/day cap). Most notably, `payment-methods`' `setup-intent`
   action is the textbook card-testing-fraud mechanism — one valid session can validate unlimited
   stolen card numbers against Stripe for free. **Not yet fixed** — estimated ~4 hours (a shared
   rate-limit primitive + wiring into ~8 functions), tracked as the next slice of work rather than
   bundled into the same-day fix, since it's meaningfully larger than the other three.

### Also found, not yet actioned

- `.gitignore` only matches literal `.env`/`.env*.local`, not Expo's native `.env.production`/
  `.env.development` convention — a real secrets file (`app/mux-preppa.env`, a live Mux API token
  pair) was found sitting untracked-but-unprotected-by-pattern-breadth in the working tree. It is
  correctly gitignored by its exact filename and was never committed (verified via full git-history
  search), but is unused by any code path (Mux credentials are read from Edge Function secrets, not
  this file) and should be deleted + the token rotated as a precaution. **Not deleted this
  session** — the auto-mode safety classifier blocked removing a file the user hadn't explicitly
  named, even in an audit-remediation context; flagging here for the user to action directly.
- `stripe-worker` has no HTTP method guard (processes side effects for any verb, not just POST) —
  low severity, 5-minute fix, not yet applied.
- Several smaller Medium/Low items (broaden `.gitignore` to `.env.*`, open-redirect risk in
  `connect-onboard`'s `returnUrl`/`refreshUrl`, AsyncStorage vs `expo-secure-store` for session
  tokens, no password-reset flow found/built, wildcard CORS on Edge Functions — lower-impact given
  the Bearer-JWT auth model rather than cookies, error-message leakage in a handful of catch
  blocks) — see the full checklist workflow journal for the complete list; none were escalated to
  Critical/High by adversarial review.

### What this pass confirmed is genuinely solid

RLS enabled on all 53 public-schema tables with no naked allow-all policies; every authorization
helper resolves off `auth.uid()` (never mutable JWT `user_metadata`); the service-role key never
appears in client code; storage's public/private split matches intent; no first-party SQL
injection surface; every user-facing Edge Function validates the JWT server-side; webhook
signature verification is real and fails closed; zero secrets in git history; clean dependency
posture (`npm audit`: 0 critical/high); CORS wildcard is never paired with credentials, and the
Bearer-JWT model structurally limits its blast radius.

---

## Update — 2026-07-14, extended follow-on audit (Edge Function hardening, payment lifecycle, admin control-plane, supply-chain/CI-CD, feature flags, detection gaps)

A second, separate follow-on pass (independent of the 8-section checklist audit above) extended
coverage into six areas: static/read-only hardening review of the 30 live Edge Functions against
malformed input, the full payment/payout/subscription-cycle lifecycle under an ambiguous-response
threat model, the admin control-plane assuming an admin credential is compromised, GitHub/CI-CD and
dependency supply-chain posture, the server-side reality behind every client feature flag, and what
detection/alerting exists once a control is bypassed. No new Critical was found. **7 findings were
confirmed** after adversarial verification (2 were detection-recommendations, not defects); **5 real
fixes were applied and merged same session** (PR #12).

### Fixed and merged same session

1. **`create-order` missing `idempotencyKey` on the Stripe PaymentIntent call** — the one
   money-moving Stripe call in the reviewed set missing it, unlike every other charge/refund/
   transfer call site. **Fixed.**
2. **`lat`/`lng` accepted `Infinity`/unbounded magnitudes** in `create-service-request`/
   `edit-service-request` (zod only rejects `NaN`, not infinite values), feeding a `NaN` into the
   haversine distance match and silently zero-matching kitchens. **Fixed** — bounded to real
   coordinate ranges. Also capped the free-form `answers` blob at 10KB (resource-exhaustion guard;
   every other free-text field in these functions was already bounded).
3. **`plans`/`experiences` `cover_url`/`photo_urls` had no domain allowlist** — same vulnerability
   class already fixed for `create_post`'s media URLs (`is_allowed_media_url`), just unpatched on
   these two tables. **Fixed** — added matching DB-level CHECK constraints (verified against zero
   existing violations before adding). `experience-upsert`'s `meetingUrl` now also requires a
   well-formed URL.
4. **`connect-onboard`'s `returnUrl`/`refreshUrl` had no allowlist** before being handed to Stripe's
   `accountLinks.create()` — an open-redirect risk in the highest-trust window of the whole app
   (immediately after a cook submits bank/identity info to Stripe). **Fixed** — allowlisted to the
   app's own origin. Also stopped 4 other functions (`connect-status`, `live-start`, `live-end`,
   `mux-webhook`) from leaking raw exception messages to the client.
5. **`FLAGS.live` read as a kill switch in its own code comments but had no server-side
   enforcement** — any verified-kitchen-owner account could `POST` directly to `live-start`
   regardless of the flag or a future redeploy meant to disable it. **Fixed** — added a real
   `LIVE_ENABLED` server-side check (fails closed by default, matching the client's current
   `FLAGS.live=false`), independent of the client bundle.
6. Also closed as part of the same PR: `admin_delete_waitlist_entry`/`admin_list_users`/
   `admin_list_waitlist` had needless `PUBLIC`/`anon` EXECUTE grants (every other `admin_*`
   function is authenticated-only) — tightened. `audit_log` had blanket `anon`/`authenticated`
   table grants including `TRUNCATE` (not governed by RLS at all, unlike SELECT/INSERT/UPDATE/
   DELETE which RLS already default-denies with zero policies) — revoked; all writes go through
   `SECURITY DEFINER` RPCs that run as the function owner regardless, so nothing broke.

### Confirmed, not fixed this session (real, but larger/needs more input)

- **Ambiguous Stripe error handling risks a real double-payout or double-charge** in
  `connect-payout`/`charge-due-cycles` — both treat *any* exception (including a network timeout
  where Stripe may have already processed the transfer/charge) identically to a definite decline,
  freeing the resource for a fresh-keyed retry. This can happen from ordinary infra latency, not
  just attacker action. Needs careful design (classify definitive-decline vs. ambiguous errors,
  then either same-key retry or a reconciliation job) rather than a same-day patch to live payment
  code. **~3 hours, next slice.**
- **No rate limiting on any state-mutating admin RPC** (`admin_suspend_kitchen`,
  `admin_set_user_role`, etc.) — a compromised admin JWT can script a tight loop to suspend every
  verified kitchen or mass-demote/promote accounts in seconds; nothing slows this down and nothing
  alerts on it. Needs a new rate-limit table/trigger wired across ~8 RPCs. **Next slice.**
- **No detection/alerting layer exists at all** beyond `audit_log` itself. Two ready-to-run SQL
  detection queries were produced (role-escalation bursts, kitchen suspend/reinstate churn) — the
  data already exists, no new instrumentation needed — but routing them to an actual alert
  destination needs a Slack/email webhook URL, which requires your input.
- **GitHub account-level settings, not this repo's code**: Dependabot vulnerability alerts +
  security updates are disabled; `main` has zero branch protection (no required review, no
  required status check, force-push/deletion both allowed). Both are one-click fixes in repo
  Settings → Security / Branches — flagged for you to action directly rather than changed
  autonomously, since they're outside the Supabase-project trust boundary this session operated in.
- **`app/mux-preppa.env`** (a real, unused, gitignored Mux API token pair) still sits on disk —
  same as the prior pass, deletion was blocked since the file wasn't explicitly named. Recommend
  deleting it and rotating the token in the Mux dashboard as a precaution.

### Also found, explicitly not independently re-verified (Medium/Low, reported at face value)

`cancel-booking`'s ledger insert isn't lock-protected and its `dedupe_key` is left NULL (a
double-tap can double-deduct a cook's balance on refund); `subscribe-box` has no duplicate-
subscription check (a double-submit creates two independently-billed subscriptions); only 18 of
132 live migrations are vendored (the base billing/ledger/booking schema has zero source-controlled
history); 11 moderate `npm audit` findings tracing to one transitive `uuid` dependency via Expo
build tooling (not shipped runtime code); GitHub Actions reference mutable tags (`@v4`) rather than
pinned SHAs; no `CODEOWNERS` file. Full detail in the workflow journal.

### What this pass confirmed is genuinely solid

Every hand-written Edge Function derives identity from a verified JWT, never a client-supplied ID.
Idempotency keys are correctly applied on `accept-quote-and-deposit`, `book-experience`,
`charge-due-cycles`, Connect transfers, and all refund call sites. `reserve_payout`/
`finalize_payout`/`accept_quote` independently re-read live: correct ownership checks, advisory
locks, DB-intent-before-Stripe-call ordering. Capacity/booking claims correctly use row locks/
`SKIP LOCKED`. No admin-scoped mass-action RPC exists anywhere in the schema. Every mutating
`admin_*` function writes to `audit_log`, and the append-only design holds up under direct
inspection. Role self-escalation via direct table UPDATE is blocked by a trigger requiring an
explicit privileged-session flag only ever set inside `SECURITY DEFINER` admin RPCs. Secret
scanning + push protection are enabled on GitHub; the lockfile is committed and fully semver-pinned.

---

## Posture in one paragraph

The backend architecture is frequently well-designed in isolated slices — row-locked capacity
reservation, an append-only ledger, `SECURITY DEFINER` RPCs with real server-side re-checks, a
genuine Stripe Connect payout flow, and a real app-controlled per-cycle subscription billing
engine (not naive Stripe recurring — independently verified). But this pass found **16 Critical
and 22 High** feature-level gaps spanning every primary journey, plus the red-team pass
independently **confirmed 21 exploitable vulnerabilities** (of 49 attempted attacks), several of
which move real money or expose the platform to unmoderated live production traffic today.
Most of the previous audit's "mostly mock" framing is now **out of date** — the buyer catalog,
reviews schema, and subscription engine are genuinely DB-backed — but a new, different set of
critical gaps has taken its place, concentrated in **prepper-side management screens still wired
to dead mock fixtures**, **missing concurrency locks on money-moving actions**, and **an
unflagged livestreaming feature that violates the team's own launch-gating plan**.

**Scorecard**

| Subsystem | Verdict |
|---|---|
| Auth / roles / prepper application lifecycle | ✅ Real, server-authoritative — but only 4 of 8 spec'd lifecycle states exist; no suspend/ban capability |
| Buyer catalog (read path) | ✅ Real, DB-backed (this reverses the prior audit's "100% mock" finding) |
| Meal purchase-time integrity (create-order) | ✅ Real — re-validates & re-prices server-side, RLS blocks non-live reads |
| Meal prepper-side management (edit/pause/archive/photo) | 🔴 **Missing entirely** — no RPC, no DB column, no working UI |
| Prepper "My Hub" dashboard + "My menu" | 🔴 **Unsafe** — wired to permanently-empty legacy mock fixtures |
| Meal Plans & Subscriptions (billing engine) | ✅ Real, well-built — but zero live production usage; legacy parallel Stripe-recurring system still deployed & reachable |
| Experiences (instant booking) | ✅ Real — DB row-locked, oversell-safe |
| Services / Request-and-Quote (bidding) | 🔴 Real money flow, but **no lock against double-booking on concurrent quote acceptance** (confirmed exploitable) |
| Orders & fulfillment (web) | ✅ Real Stripe-backed | 
| Orders — native (iOS/Android) checkout | 🔴 **Full mock** — marks "paid" with no charge, no order row |
| Order tracking screen | 🔴 Hardcoded fixture data, disconnected from real order status |
| Cook payouts (Stripe Connect) | 🔴 Wired and real, but **double-spend race** on the payout endpoint (confirmed exploitable) |
| Reviews | 🔴 UI-only mock submission; correct RLS + schema, 0 real rows |
| Messaging / chat | ✅ Real 1:1 threads + Realtime — but no rate limit on individual messages |
| Feed / creator video | ✅ Real posts/likes/follows — but **no moderation gate**, arbitrary external media URLs accepted |
| Livestreaming | 🔴 **Fully shipped, unflagged**, violating the team's own pre-launch gate; webhook fails **open** with no signing secret |
| Admin control plane | ⚠️ Covers ~6 of ~24 required areas; **no suspend/ban, no refund/dispute view, no plans/subscriptions/quotes visibility** |
| Kitchen capacity / vacation mode | 🔴 Vacation toggle never persists to DB; **the platform's only 2 real kitchens are stuck permanently unorderable** right now |
| Tests / CI | 🔴 **Zero automated tests, zero CI/CD**, anywhere in the repo |
| Source control of backend | 🔴 **All 31 live Edge Functions + ~108 SQL migrations exist only in the remote Supabase project** — no git history for any of them |

---

## 🔴 Critical (16)

1. ✅🟡 **FIXED, pending Edge Function deploy.** ~~connect-payout has no lock/idempotency key~~
   on the Stripe Transfer call — any onboarded prepper could double/multi-submit cash-out and
   extract more real money than their ledger balance allows. **Confirmed exploitable.** DB-side
   lock (`reserve_payout`/`finalize_payout`) is live; `connect-payout` still needs redeploying to
   actually call it.
2. ✅🟡 **FIXED, pending Edge Function deploy.** ~~accept-quote-and-deposit has no row/advisory
   lock~~ — two different quotes on the same service_request could both be accepted, paid, and
   confirmed. **Confirmed exploitable.** DB-side lock (`accept_quote`) is live; the Edge Function
   still needs redeploying to call it.
3. ✅ **FIXED.** ~~Livestreaming (Mux) is fully live in production with no `FLAGS.live` gate~~ —
   `FLAGS.live=false` added and every entry point (feed, storefront, go-live, viewer) gated.
4. ✅🟡 **FIXED, pending Edge Function deploy.** ~~mux-webhook fails OPEN~~ — the fixed version
   (fails closed with 400 when unsigned/unconfigured) is written but not yet redeployed.
5. ✅ **FIXED, live.** ~~create_post accepts arbitrary externally-hosted media URLs~~ — domain
   allowlist + storage-overwrite fix applied live (pure DB RPC, no Edge Function involved).
6. ✅ **FIXED, live.** ~~Native (iOS/Android) checkout is a full UI mock~~ — now blocked with a
   clear message instead of faking a paid order.
7. ✅🟡 **FIXED, pending migration.** ~~No `update_meal`/`pause_meal`/`archive_meal` capability
   exists anywhere~~ — RPCs + UI written; needs migration `20260714070000` applied.
8. ✅🟡 **FIXED, pending migration.** ~~Prepper "My Hub" dashboard and "My menu" wired to
   permanently-empty legacy mock fixtures~~ — rewired to real queries; needs the same migration
   as #7 for the meal-status RPCs it calls.
9. ✅ **FIXED, live.** ~~Meal-order review submission is a UI-only mock~~ — now a real insert
   against the existing (already-correct) `reviews` table/RLS.
10. ✅🟡 **FIXED, pending migration.** ~~No user suspension/ban capability exists anywhere~~ —
    kitchen suspend/reinstate RPCs + admin UI written; needs migration `20260714060000`.
11. ✅🟡 **FIXED, pending migration.** ~~Kitchen "vacation mode" never persists to the database~~
    — real DB persistence + a data-fix for the 2 stuck real kitchens written; needs migration
    `20260714050400` applied (recommend prioritizing this one — it directly restores order-ability).
12. ✅ **FIXED, live.** ~~`app/track.tsx` (order tracking) is entirely hardcoded fixture data~~ —
    now polls real order status.
13. 🟡 **PARTIALLY ADDRESSED.** ~~Zero automated tests exist anywhere in the repo~~ — a typecheck
    CI gate now runs on every PR; a real regression test suite still does not exist.
14. ✅ **FIXED.** ~~No CI/CD pipeline exists~~ — `.github/workflows/ci.yml` runs `tsc --noEmit`
    on every push/PR.
15. ✅ **FIXED.** ~~All 31 live Supabase Edge Functions... exist only in the remote project with
    zero source control~~ — all 30 functions + 6 new migrations are now vendored in `supabase/`.
16. ⬜ **NOT ADDRESSED THIS PASS.** *(Carried context, not re-verified)* Google OAuth client
    secret exposure from a prior session — confirm rotation completed if not already done.

## 🟠 High (selected — full list of 22 in AUDIT_FULL.md)

- Payout-gating (`kitchen_payouts_enabled`) is **missing entirely for subscription-plan
  activation and for accepting a paid service quote** — unlike meals, which are gated twice.
- **No suspend/deactivate capability for an already-verified kitchen**, despite the Cook
  Agreement promising Preppa can pause/suspend/remove a kitchen at any time.
- **Rejected/pending prepper applicants retain full ownership-based access to ~10 of 12
  Prepper-only RPCs** because `is_kitchen_owner()` never checks `verification_status` —
  rejection does not revoke capability. **Confirmed exploitable.**
- A **legacy, fully-deployed parallel Stripe-native subscription system**
  (`create-subscription`/`manage-subscription`) remains reachable by any authenticated user;
  currently inert only by data-layer coincidence (`plans.stripe_price_id` never populated).
- Admin has **zero visibility into plans/subscriptions, service-requests/quotes/bookings,
  refunds, or disputes** — only 6 of ~24 target admin capability areas exist.
- **`hub/subscribers.tsx`** (prep-rollup / subscriber roster / broadcast) is fully real and
  DB-backed but has **zero navigation entry point** anywhere in the app.
- Vacation-mode/availability is enforced only for single-order checkout — **not** for
  subscription-cycle billing, plan/box signups, or experience bookings.
- Meal photo upload at creation is fully fake (fixed gradient placeholders) — no
  prepper-created meal has a real photo.
- Individual 1:1 chat messages have **no rate limit** (unlike broadcasts) — inbox-flooding is
  possible.
- Refund paths (`cancel-booking`, `cancel-experience-booking`, `cancel-experience-session`) have
  **no idempotency key or row lock** on the Stripe refund call — double-refund race.

## Confirmed-exploitable red-team findings (21 of 49 attempts)

Six categories tested (identity/roles, marketplace abuse, payments, media/livestream, messaging/
notifications, admin). 21 confirmed vulnerable, 24 not vulnerable, 4 inconclusive. The highest-
severity confirmed items are the payout double-spend, the quote double-booking, the Mux webhook
fail-open/forgery, and the arbitrary-media-URL substitution — all listed above. Full attack-by-
attack detail (including the 24 *not*-vulnerable checks, which document real, working defenses
worth preserving) is in **AUDIT_FULL.md**.

## Verdict: NO GO

Per the governing rule, GO is disallowed while any Critical/High finding is open or any primary
journey is incomplete — both are true here by a wide margin. This was an **audit-only pass**;
nothing above has been fixed yet.

### Recommended next slice (stop-the-bleeding, before any new feature work)

1. Add `FLAGS.live=false` and gate go-live / the "Live now" rail / the viewer screen behind it;
   fix `mux-webhook` to fail **closed** (400) whenever `MUX_WEBHOOK_SECRET` is unset.
2. Fix `connect-payout`'s double-spend race: wrap balance-read + Stripe transfer + ledger-insert
   in a `pg_advisory_xact_lock` and pass a Stripe idempotency key (mirrors the pattern already
   used in `reconcile_paid_pi`'s box-cycle lock).
3. Fix `accept-quote-and-deposit`'s double-booking race the same way (advisory lock keyed on
   `request_id`, or a partial unique index on `bookings(request_id)` for active statuses).
4. Manually flip the 2 live real prepper kitchens to `availability='open'`, then ship the
   vacation-mode toggle's DB write and default new approvals to `open` in `approve_kitchen`.

Second slice (follow-on): native checkout, meal edit/pause/archive + real photo upload, wiring
My Hub/My-menu off the dead mock fixtures, and real order-review submission.

## Incomplete primary journeys (all 7)

Customer meal order, prepper onboarding→payout, subscription lifecycle, service-request/quote
lifecycle, feed-commerce, livestream, and admin all have at least one open Critical/High gap that
breaks the journey end-to-end for some real user path. Detail in AUDIT_FULL.md.

## Superseded from the prior audit (no longer true — do not re-fix)

- ~~Buyer catalog is 100% mock~~ — now genuinely DB-backed (Explore/Home/detail/storefront read
  live `meals`/`kitchens`).
- ~~Payment→order reconciliation is broken~~ — `reconcile_paid_pi` trigger works, verified.
- ~~Reviews/ratings are fabricated~~ — schema and RLS are now honest and read-real; the *gap*
  moved from "fake numbers" to "the submission UI never writes" (Critical #9 above).
- ~~Meal plans/subscriptions are mock~~ — the billing engine is real and independently verified
  as app-controlled, not naive Stripe recurring; the gap is zero live usage + a dangling legacy
  parallel system, not mock-ness.

---

_Full traceability matrix (168 features across 16 subsystems, orphans, duplicates, and every
red-team attempt with evidence/fix/regression-test) lives in **[AUDIT_FULL.md](./AUDIT_FULL.md)**._
