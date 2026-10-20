# Loop 0 red-team findings

Red-team of docs/web-launch/DESIGN.md and SECURITY-SPEC.md, checked against the code at C:/Users/WT8/Projects/Preppa/preppa-web. Everything here comes from reading the source. I ran nothing against production Supabase or Stripe and changed no files.

Many of the docs' line citations are correct: the env guard (src/lib/supabase.ts:20-41), the localStorage session (authStorage.web.ts:5), the onboarding overlay (app/_layout.tsx:96), window.confirm (confirm.ts:13), meeting-link zod .url() plus Linking.openURL, the Mux non-constant compare with no timestamp window, CORS *, the hardcoded production cron URLs, the Connect allowed origin, and Google OAuth having no callers.

The docs are wrong or incomplete in four areas:
- **Setup can hit production.** Running the L1 setup against the test project with a live key would delete production's Stripe webhook. The server-side key-mode check in task 1.7 does not cover the vendored Stripe functions.
- **Payouts have no hold.** A cook can cash out the moment an order is paid, before cooking it, and refunds or chargebacks after that are not clawed back.
- **The fix proposed for the broken service-role check (S6) is wrong for its main target,** and its list of affected functions is incomplete.
- **Several money-path failures are silent or missing:**
  - a failed payment reconciliation is swallowed, so the customer is charged with no order and no alert;
  - customers have no way to cancel or get a refund on a one-off order, and an ignored order is never refunded automatically;
  - the L4 deploy order for pending migrations can break live checkout and refunds;
  - Stripe Tax calculations are never recorded as tax transactions, and subscriptions, boxes, experiences and bookings charge no tax at all;
  - the planned OG link-preview middleware adds a stored-XSS path while CSP is still report-only.

Verdict: not ready to drive Loop 1. Corrections 1 to 7 (or 1 to 8) must go into the docs before L1 starts, especially 1, because L1 itself runs stripe-setup. Corrections 8 onward can be folded into L2/L3 planning.

## [critical] production-touch / env isolation
- Where: supabase/functions/stripe-setup/index.ts:46192-46262 (findOrCreateManagedWebhook orphan loop), :48818 (Deno.env.get STRIPE_SECRET_KEY); stripe-webhook/index.ts:47103; stripe-worker/index.ts:47108; DESIGN.md:130 (1.1), :136 (1.7)
- Running stripe-setup on the new test project with a live key, or with any Stripe account whose mode is shared by several environments, deletes the other environment's Stripe webhook. Task 1.7's key-mode helper cannot prevent this because the three vendored sync-engine functions read STRIPE_SECRET_KEY directly, not through requireEnv. Failure scenario: E pastes sk_live into the test project and calls stripe-setup. The test DB's _managed_webhooks table is empty, so the engine lists every webhook on the live account, flags production's stripe-sync webhook as orphaned and deletes it. Production then stops receiving payment_intent events: orders stay unpaid, the ledger is never credited, and customers are charged for orders that never exist. The same thing happens between local and staging if both use one account's test mode. Direction: use a separate Stripe Sandbox per environment. Add a guard at the top of the stripe-setup, webhook and worker wrappers that refuses unless the key prefix matches the project ref in SUPABASE_URL. Add 'verify sk_test before stripe-setup' to the L1 checklist, plus a production alert when the managed webhook is missing or disabled.

## [critical] live-money safeguard (missing)
- Where: supabase/migrations/20260808030007_high_wire_cook_pro_fee_discount.sql:30-42 (sale+tip credited and notify_payout_available at payment); 20260906100000_payout_reconciliation.sql:51-95 (reserve_payout pays the full balance); supabase/functions/connect-payout/index.ts:92-97 and auto-payouts/index.ts:37 (no source_transaction, no reversal); create-order/index.ts:22,36 (tip up to $1,000)
- Payouts have no hold. A cook can withdraw a paid order's subtotal and tip at once, before fulfilment, and nothing recovers money already sent if the order is later refunded or charged back. Failure scenario: a colluding cook account plus a second account pays with a stolen card, adding a $1,000 tip. reconcile_paid_pi credits the ledger and connect-payout transfers it straight away. When the chargeback lands, Preppa (the merchant of record under separate charges and transfers) absorbs the loss and the ledger just goes negative. Separately, transfers without source_transaction draw on the platform's available balance, and fresh charges are still pending for days, so an early real-world cash-out fails with insufficient funds. D10/S7 cover disputes only. Direction: release ledger credit only after fulfilment plus N days, or use source_transaction with transfer_group. Reverse transfers (or offset future payouts) on refunds and disputes. Cap tips and payouts for new kitchens. Add these cases to the L1 and L4 exit gates (test card 4242 vs 0077 available-balance behaviour).

## [high] correctness of planned fix (S6 / T7)
- Where: SECURITY-SPEC.md:31,145; supabase/migrations/20260714104442_critical_fix_reconcile_invoice_service_role_only.sql:30; 20260711060016_reconcile_subscription_invoice.sql:60-73; repo precedent 20260808040519_critical_fix_guard_triggers_no_jwt_context.sql:1-15
- S6 proposes replacing the check with auth.role() = 'service_role'. That does not fix reconcile_invoice. The function runs from a trigger on stripe.invoices, fired by the sync engine over the raw SUPABASE_DB_URL connection, where no JWT claims exist at all. auth.role() is NULL there, the check still raises 42501, and the trigger swallows it. The repo already learned this lesson in 20260808040519. S6's list is also incomplete. Functions whose latest definition still uses the deprecated GUC but are missing from S6: admin_reinstate_kitchen (20260715220353), advance_order_status and decline_order (20260714091947), kitchen_earnings_summary (0007_prepper_ops). T7 also overstates the impact: legacy Stripe-subscription plans are retired (create-subscription returns 410), so the remaining invoices (PrepPlus, Cook Pro) never needed orders. The real money impact is reserve_balance_charge and finalize_balance_charge (20260925185000:37,80), which are pending deploy and would ship broken. Direction: use the 'auth.role() is not null and <> service_role means reject' pattern (or drop the body check and rely on grants), and list every function from a pg_proc scan.

## [high] live-money safeguard (missing)
- Where: supabase/migrations/20260808030007_high_wire_cook_pro_fee_discount.sql:173; 20260908030000_system_health_monitoring.sql (no such check)
- reconcile_paid_pi catches every exception and only raises a warning, and nothing compares succeeded PaymentIntents against order pay_status. Failure scenario: any error in the trigger (a constraint, a dropped column after a migration, a notify failure) leaves stripe.payment_intents at 'succeeded' with the order 'unpaid'. The customer is charged, the cook is never told, nobody is alerted, and it can only be found by hand. The docs name only the reconcile_invoice swallow. Direction: add a cron sweep that alerts admins on any succeeded PI older than 5 minutes whose order or booking or cycle is not paid, and add this as an L1 exit-gate SQL check.

## [high] product gap: strangers get food
- Where: supabase/functions/decline-order/index.ts:27 (cook-only, statuses confirmed/preparing/ready); src/lib/orders.ts:106 (only refund caller); migrations cron list (only reap-experience-holds); no admin refund function in supabase/functions
- The only refund path for a one-off order is the cook declining it. Customers cannot cancel, no SLA job refunds a paid order a cook ignores, and there is no admin refund tool. So every complaint ('food never came') is a Stripe-dashboard refund, which T6 says never reaches the ledger. Failure scenario: a cook accepts the money, never cooks, then cashes out (see the payout-hold finding). The customer complains, E refunds in the dashboard, and the cook keeps the credit. Direction: add a server-side admin refund that calls the finalize_order_cancel reversal, an auto-cancel-and-refund job for orders not accepted within X minutes or not completed by Y, and a customer cancel window. Add these to the L4 exit gate.

## [high] production-touch / deploy ordering
- Where: DESIGN.md:178 (4.2); supabase/migrations/20260925011000_order_cancel_customer_reason.sql:3 vs decline-order/index.ts:100; create-order/index.ts:298-299 vs 20260925022000/20260925025000; 20260925024000_store_kitchen_pickup_address.sql (pickup address only via application) vs create-order/index.ts:261-273; supabase/functions/MANIFEST.md (no decline-order row)
- Task 4.2 deploys pending migrations and functions as one lump, but they are interdependent and some of the changes are destructive. Failure scenarios:
- A decline-order build that passes p_reason, deployed before the 3-argument finalize_order_cancel (or the old one deployed after the 2-argument version is dropped): Stripe issues the refund, finalize fails, the order stays active and the ledger keeps the credit.
- The repo's create-order deployed before the delivery_address_text and delivery_instructions columns exist: every checkout returns 500.
- After deploy, every existing cook has no kitchen_pickup address and no UI outside the application flow to add one, so all pickup checkouts return 409.
- MANIFEST is stale (decline-order is missing), so the 4.1 diff must use the live list.
Direction: an expand-then-contract order (additive migrations, then functions, then web client, then drops), a backfill or edit UI for pickup addresses, and diffing against live list_edge_functions.

## [high] missed attack path (XSS)
- Where: DESIGN.md:155 (2.4), :194 (D1); SECURITY-SPEC.md:40 (CSP Report-Only until L3/L4); src/lib/authStorage.web.ts:5
- The D1 middleware writes prepper-controlled text (meal, store and post titles) into index.html on the app.preppa.live origin. It ships in L2, while CSP is report-only until L3 (test host) and L4 (production). Failure scenario: a prepper names a meal so that it breaks out of the meta attribute and injects a script tag. The middleware serves it to every visitor of /meal/<id>, including admins, and the script reads the localStorage session, giving full account or admin takeover. Direction: require strict HTML-attribute escaping plus a red-then-green test with a hostile title, emit only allowlisted fields, and enforce CSP (or at least script-src) before D1 ships.

## [medium] wrong claim / RLS plan
- Where: SECURITY-SPEC.md:124,151 (S12); supabase/migrations/20260817063118_perf_merge_stacked_permissive_select_policies.sql:47-51; src/data/supabaseRepository.ts:22; src/lib/connect.ts:24, src/lib/supabase.ts:524 (.eq('owner_id', uid))
- Revoking owner_id from anon does nothing while anon holds a table-level SELECT grant, which is the Supabase default. A column privilege only bites after you revoke table SELECT and grant a column list. Also, the RLS table's claim that anon reads public kitchens 'via public views only' contradicts the client, which reads the base kitchens table through an embed in meals selects. Enforcing views-only breaks guest browse and home. Meanwhile any authenticated user can read owner_id of every verified kitchen, and the authenticated client depends on filtering by owner_id. Direction: revoke table SELECT and grant an explicit column list for anon, keep owner_id for authenticated or move owner lookups to an RPC, and run this through the 2.2 anon probe.

## [medium] live-money compliance (missing)
- Where: supabase/functions/create-order/index.ts:46-54,287 (only tax.calculations.create); no tax.transactions.createFromCalculation anywhere outside the vendored bundles; subscribe-plan, subscribe-box, charge-due-cycles, book-experience, accept-quote-and-deposit compute no tax; DESIGN.md:41
- Tax is calculated and charged on one-off orders but never committed as a Stripe Tax transaction. Subscriptions, boxes, experiences and bookings charge no tax at all. Failure scenario: real orders collect sales tax that never appears in Stripe Tax reports or filings, refunds don't reverse the tax liability, and plan or box revenue goes untaxed in states that tax prepared food. Direction: call createFromCalculation in the payment reconcile path and create reversals on refund, decide tax for the recurring and booking flows, and put it on the 4.7 legal list.

## [medium] admin MFA scope (S3)
- Where: SECURITY-SPEC.md:142; supabase/migrations/20260714193000_public_support_requests.sql:58; 20260925031000_notify_order_support_participants.sql:43
- Adding aal2 inside is_admin() misses admin checks that test profiles.role = 'admin' directly. Failure scenario: a phished aal1 admin session can still read every public_support_requests row (PII, safety reports), yet the L3 exit gate ('admin RPCs reject aal1') passes. Direction: grep for role = 'admin' and route every admin check through is_admin(), then add a regression per path.

## [medium] production-touch / exit-gate gaps
- Where: DESIGN.md:131 (1.2), :145-146 (L1 gate); supabase/migrations/20260808024849_high_fix_notify_push_pass_kind.sql:16 (notify() body); 20260714065911:14-16; cron jobs guarded by 'where exists (vault secret)'
- Two gaps:
- The L1 gate checks only cron.job. notify() and the media allowlist hardcode the production host inside function bodies, so the gate passes while the test project still points at production. Check pg_proc.prosrc as well.
- The 1.2 Vault base-URL migration eventually reaches production. If production's Vault base URL is unset when it lands, every worker (reconcile-payouts, auto-payouts, charge-due-cycles, stripe-worker, push) posts to a null URL or is skipped, and nothing alerts because of the 'where exists' guard. Payouts and subscription charges stop.
Direction: set the production Vault value before deploying, have the migration fail loudly if it is absent, and add a health check.

## [medium] production-touch (tooling)
- Where: DESIGN.md:177-178 (4.1 'B read-only', 4.2 'E or B runs'); supabase/migrations/20260714065801...:12 ('APPLIED LIVE ... via Supabase MCP'); supabase/config.toml:1
- Agents in this environment have a Supabase MCP that can apply migrations, run SQL and deploy edge functions across an org that holds production. 'Read-only' is a convention, not a control. Failure scenario: once a test project exists in the same org, a builder calls apply_migration with the wrong project_id and changes production. Direction: run the builder's MCP in read-only mode scoped to the test project ref, leave production deploys to E, and keep config.toml free of the production ref (task 1.5).

## [medium] live-money safeguard
- Where: supabase/functions/connect-status/index.ts:60 (only writer of payouts_enabled); create-order/index.ts:140-145; payout_reconciliation.sql:75-79
- stripe_accounts.payouts_enabled and charges_enabled only refresh when the cook's client calls connect-status. Nothing handles account.updated. Failure scenario: Stripe restricts a cook's account for missing requirements. The DB still says enabled, so checkout keeps taking orders and reserve_payout keeps transferring to a restricted account. Direction: add an account.updated handler (a stripe.accounts mirror trigger or a cron sync) and add it to L1.

## [medium] auth claims (T2, section 4)
- Where: SECURITY-SPEC.md:26,105-106; src/components/Onboarding.tsx:156,166-169; src/lib/supabase.ts:112-139
- Two problems:
- 'Confirm email ON closes T2' is asserted, not tested. The residual case is an attacker's unconfirmed password account for the victim's email, which the victim later confirms by OTP sign-in (shouldCreateUser:true), possibly leaving the attacker's password valid.
- The spec's minimum password length of 10 contradicts the client's minimum of 8, so 8-9 character sign-ups get a generic 'Couldn't create your account'.
Direction: add that hijack sequence as an explicit test on the test project, align the client minimum, and check existing unconfirmed production users before flipping the setting.

## [medium] env guard plan (1.8)
- Where: DESIGN.md:137; scripts/check-env-separation.mjs:3-19; src/lib/share.ts:5
- check-env-separation reads only eas.json, so 'extend it to fail if Preview env is live' cannot see Vercel environment variables. Shared links on the test host also point at production (share.ts:5 hardcodes the production URL). Direction: add a build-time check in vercel buildCommand that reads VERCEL_ENV and the EXPO_PUBLIC values and fails a Preview build with pk_live or the production ref (or a Production build with test values), and derive the share base from the configured origin.

## [low] S5 feasibility and intake abuse
- Where: SECURITY-SPEC.md:144; supabase/migrations/20260725175502...:26-45 (check_rate_limit uses a uuid subject and requires service_role); 20260714193000_public_support_requests.sql:9,27-35
- Three problems:
- 'check_rate_limit by IP' does not fit the existing limiter, which keys on a uuid subject and rejects explicit subjects from non-service callers. A new IP-keyed limiter is needed.
- ref is client-settable and unique: an attacker can pre-insert refs the sequence will reach (for example S-10050), so legitimate reports later fail on the unique constraint.
- status and immediate_risk are client-set too.
Direction: an edge function with an IP-hash limiter plus CAPTCHA, a server-only ref and status, and immediate_risk triage.

## [low] threat model and launch gaps
- Where: SECURITY-SPEC.md:21-36; src/components/Onboarding.tsx (no terms consent); src/lib/connect.ts:170-174; DESIGN.md:177,181; SECURITY-SPEC.md:119
- Gaps:
- Card testing and multi-account fraud (OTP sign-up is unlimited without CAPTCHA, no Radar rules) are missing from the threat model.
- There is no terms or privacy consent at sign-up or checkout; 4.7 only reviews the pages.
- openPayoutDashboard calls window.open after an await, which Safari blocks, so preppers cannot reach bank settings there.
Citation fixes:
- Tasks.md and Launch-Plan.md live under docs/obsidian/.
- The count of '306' SECURITY DEFINER functions does not match the roughly 165 unique names in the repo's migrations.

