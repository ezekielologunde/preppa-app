-- Regression tests for the 2026-08 stabilization/hardening pass.
--
-- Plain SQL assertions (RAISE EXCEPTION on failure), not pgTAP -- no extra
-- extension dependency, and every check here was validated directly against
-- the live project before being written down, so this file encodes checks
-- already proven true, not aspirational ones.
--
-- Run via: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/regressions.sql
-- (or through `supabase test db` against a local stack with migrations applied)
--
-- Wrapped in one transaction that ALWAYS rolls back at the end -- nothing
-- here persists, so it's safe to point at any environment including a real
-- project, though CI should run it against a fresh local instance.
begin;

do $$
begin
  if has_function_privilege('authenticated', 'public.notify(uuid,text,text,text)', 'execute') then
    raise exception 'REGRESSION: authenticated can call notify() directly -- notification spoofing/spam vector reopened';
  end if;
  if has_function_privilege('anon', 'public.notify(uuid,text,text,text)', 'execute') then
    raise exception 'REGRESSION: anon can call notify() directly';
  end if;
end $$;

-- Customer isolation: these policies are the boundary preventing one signed-in buyer from
-- reading another buyer's orders, payment records, support tickets, or private messages.
do $$
declare v_qual text;
begin
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('orders','order_items','payment_intents','tickets','ticket_messages','message_threads','messages')
      and not c.relrowsecurity
  ) then
    raise exception 'REGRESSION: a customer-data table lost RLS';
  end if;

  select qual into v_qual from pg_policies
  where schemaname = 'public' and tablename = 'orders' and policyname = 'orders_select_party';
  if v_qual is null or v_qual !~ 'customer_id.*auth.uid' or v_qual !~ 'is_kitchen_owner' then
    raise exception 'REGRESSION: orders_select_party no longer restricts reads to the buyer or kitchen owner';
  end if;

  select qual into v_qual from pg_policies
  where schemaname = 'public' and tablename = 'tickets' and policyname = 'tickets_select_own';
  if v_qual is null or v_qual !~ 'reporter_id.*auth.uid' then
    raise exception 'REGRESSION: ticket reads no longer include reporter ownership';
  end if;

  if (select prosrc from pg_proc where oid = 'public.create_ticket(uuid,ticket_category,text,text)'::regprocedure)
     !~ 'customer_id = v_uid or public.is_kitchen_owner' then
    raise exception 'REGRESSION: create_ticket() no longer verifies the caller is an order party';
  end if;
end $$;

-- A taxable create-order insert must satisfy the same total formula used by Stripe.
do $$
declare v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
  from pg_constraint
  where conrelid = 'public.orders'::regclass and conname = 'orders_total_matches';
  if v_def is null or v_def !~ 'tax_cents' then
    raise exception 'REGRESSION: orders_total_matches excludes tax_cents -- taxable checkout inserts will fail';
  end if;
end $$;

-- Food-safety disclosure: new meal publishing must keep ingredients mandatory and require
-- an explicit allergen review; catalog columns must remain public-readable through meals RLS.
do $$
declare v_src text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'addresses' and column_name = 'country'
  ) then
    raise exception 'REGRESSION: addresses.country is missing';
  end if;

  if not exists (
    select 1 from information_schema.parameters
    where specific_schema = 'public'
      and specific_name like 'request_prepper_application_%'
      and parameter_name = 'p_address_postal_code'
  ) then
    raise exception 'REGRESSION: prepper applications no longer accept a structured pickup address';
  end if;

  if has_function_privilege(
    'anon',
    'public.request_prepper_application(text,text,text,text,text,text,jsonb,text,text,text[],text,text,numeric,numeric,text,text,text,text,text,text)',
    'execute'
  ) then
    raise exception 'REGRESSION: anon can submit prepper applications';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.request_prepper_application(text,text,text,text,text,text,jsonb,text,text,text[],text,text,numeric,numeric,text,text,text,text,text,text)',
    'execute'
  ) then
    raise exception 'REGRESSION: authenticated users cannot submit prepper applications';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'meals' and column_name = 'ingredients'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'meals' and column_name = 'allergens'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'meals' and column_name = 'allergen_reviewed_at'
  ) then
    raise exception 'REGRESSION: meal ingredient/allergen disclosure columns are missing';
  end if;

  select prosrc into v_src from pg_proc
  where oid = 'public.create_meal(text,text,integer,integer,text[],text,text,text[],boolean)'::regprocedure;
  if v_src !~ 'list the meal ingredients' or v_src !~ 'confirm the allergen review' then
    raise exception 'REGRESSION: create_meal() no longer requires ingredient and allergen review';
  end if;
  if has_function_privilege('anon', 'public.create_meal(text,text,integer,integer,text[],text,text,text[],boolean)', 'execute') then
    raise exception 'REGRESSION: anonymous users can publish meals';
  end if;
end $$;

-- Ambiguous off-session charges must stay frozen. Resetting one to pending allows the
-- next charge worker run to use a fresh attempt key and can double-charge the customer.
do $$
declare v_advance text; v_mark text;
begin
  select prosrc into v_advance from pg_proc where oid = 'public.advance_cycles()'::regprocedure;
  if v_advance !~ 'ambiguous_stripe_outcome' then
    raise exception 'REGRESSION: advance_cycles() can release ambiguous subscription charges for retry';
  end if;
  if to_regprocedure('public.mark_cycle_charge_ambiguous(uuid)') is null then
    raise exception 'REGRESSION: mark_cycle_charge_ambiguous() is missing';
  end if;
  select prosrc into v_mark from pg_proc where oid = 'public.mark_cycle_charge_ambiguous(uuid)'::regprocedure;
  if v_mark !~ 'payment_status = ''charging''' or v_mark !~ 'stripe_payment_intent_id is null' then
    raise exception 'REGRESSION: ambiguous cycle marker no longer preserves the charging invariant';
  end if;
  if has_function_privilege('authenticated', 'public.mark_cycle_charge_ambiguous(uuid)', 'execute')
     or has_function_privilege('anon', 'public.mark_cycle_charge_ambiguous(uuid)', 'execute') then
    raise exception 'REGRESSION: ambiguous cycle marker is exposed outside service_role';
  end if;
end $$;

do $$
declare v_claim text;
begin
  if to_regprocedure('public.claim_ambiguous_cycle_charges(interval,integer)') is null then
    raise exception 'REGRESSION: ambiguous cycle reconciliation claim RPC is missing';
  end if;
  select prosrc into v_claim from pg_proc
  where oid = 'public.claim_ambiguous_cycle_charges(interval,integer)'::regprocedure;
  if v_claim !~ 'for update skip locked' or v_claim !~ 'charge_reconcile_attempts' then
    raise exception 'REGRESSION: ambiguous cycle reconciliation is no longer concurrency-safe';
  end if;
  if has_function_privilege('authenticated', 'public.claim_ambiguous_cycle_charges(interval,integer)', 'execute')
     or has_function_privilege('anon', 'public.claim_ambiguous_cycle_charges(interval,integer)', 'execute') then
    raise exception 'REGRESSION: ambiguous cycle reconciliation claim is exposed outside service_role';
  end if;
  if has_function_privilege('authenticated', 'public.flag_ambiguous_cycle_charge(uuid,text)', 'execute') then
    raise exception 'REGRESSION: ambiguous cycle admin-review marker is exposed to authenticated users';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'subscription_cycles'
      and column_name = 'charge_ambiguous_at' and data_type = 'timestamp with time zone'
  ) then
    raise exception 'REGRESSION: subscription charge ambiguity timestamp is missing';
  end if;
end $$;

-- Order support input remains bounded at the trusted database boundary and cancellation
-- requests retain a dedicated operational category.
do $$
declare v_create text; v_reply text;
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typnamespace = 'public'::regnamespace and t.typname = 'ticket_category'
      and e.enumlabel = 'cancellation'
  ) then raise exception 'REGRESSION: cancellation ticket category is missing'; end if;
  if not exists (select 1 from pg_constraint where conname = 'tickets_subject_length')
    or not exists (select 1 from pg_constraint where conname = 'tickets_body_length')
    or not exists (select 1 from pg_constraint where conname = 'ticket_messages_body_length') then
    raise exception 'REGRESSION: order support length constraints are missing';
  end if;
  select prosrc into v_create from pg_proc where oid = 'public.create_ticket(uuid,ticket_category,text,text)'::regprocedure;
  select prosrc into v_reply from pg_proc where oid = 'public.add_ticket_message(uuid,text,boolean)'::regprocedure;
  if v_create !~ '> 120' or v_create !~ '> 2000' then raise exception 'REGRESSION: create_ticket input limits are missing'; end if;
  if v_reply !~ '> 2000' then raise exception 'REGRESSION: ticket reply input limit is missing'; end if;
end $$;

do $$
declare v_ticket_src text; v_message_src text;
begin
  select prosrc into v_ticket_src from pg_proc where oid = 'public.on_order_ticket_created()'::regprocedure;
  select prosrc into v_message_src from pg_proc where oid = 'public.on_order_ticket_message_created()'::regprocedure;
  if v_ticket_src !~ 'Cancellation request' or v_ticket_src !~ 'role = ''admin''' then
    raise exception 'REGRESSION: new order tickets no longer notify admins';
  end if;
  if v_message_src !~ 'Support replied' or v_message_src !~ 'New support reply' or v_message_src !~ 'Cook replied' then
    raise exception 'REGRESSION: order support replies no longer notify participants';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'order_ticket_created_notify' and not tgisinternal)
    or not exists (select 1 from pg_trigger where tgname = 'order_ticket_message_created_notify' and not tgisinternal) then
    raise exception 'REGRESSION: order support notification triggers are missing';
  end if;
  if has_function_privilege('authenticated', 'public.on_order_ticket_created()', 'execute')
    or has_function_privilege('authenticated', 'public.on_order_ticket_message_created()', 'execute') then
    raise exception 'REGRESSION: authenticated can execute order support trigger functions directly';
  end if;
end $$;

do $$
declare v_src text;
begin
  select prosrc into v_src from pg_proc where oid = 'public.on_order_ticket_status_changed()'::regprocedure;
  if v_src !~ 'Support request' or v_src !~ 'Resolved' or v_src !~ 'Closed' or v_src !~ 'auth.uid\(\) = new.reporter_id' then
    raise exception 'REGRESSION: order support status notifications are incomplete';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'order_ticket_status_changed_notify' and not tgisinternal) then
    raise exception 'REGRESSION: order support status notification trigger is missing';
  end if;
  if has_function_privilege('authenticated', 'public.on_order_ticket_status_changed()', 'execute') then
    raise exception 'REGRESSION: authenticated can execute support status trigger directly';
  end if;
end $$;

do $$
begin
  if has_function_privilege('authenticated', 'public.kitchen_broadcast_audience(uuid)', 'execute') then
    raise exception 'REGRESSION: authenticated can call kitchen_broadcast_audience() directly -- subscriber-list enumeration leak reopened';
  end if;
  if has_function_privilege('anon', 'public.kitchen_broadcast_audience(uuid)', 'execute') then
    raise exception 'REGRESSION: anon can call kitchen_broadcast_audience() directly';
  end if;
end $$;

do $$
begin
  if has_function_privilege('authenticated', 'public.notify_experience_waitlist(uuid)', 'execute') then
    raise exception 'REGRESSION: authenticated can call notify_experience_waitlist() directly';
  end if;
end $$;

-- The legitimate wrappers around the two locked-down functions above must
-- keep working -- this guards against a future "fix" that revokes too much.
do $$
begin
  if not has_function_privilege('authenticated', 'public.my_broadcast_audience_count()', 'execute') then
    raise exception 'REGRESSION: authenticated lost access to my_broadcast_audience_count() -- broadcast audience preview is broken';
  end if;
  if not has_function_privilege('authenticated', 'public.send_kitchen_broadcast(text,text)', 'execute') then
    raise exception 'REGRESSION: authenticated lost access to send_kitchen_broadcast() -- kitchen broadcast feature is broken';
  end if;
end $$;

-- reconcile_paid_invoice and reconcile_paid_pi must stay symmetric
-- (service_role/postgres only) -- one was historically broader than the
-- other and got tightened to match.
do $$
declare v_invoice_acl aclitem[]; v_pi_acl aclitem[];
begin
  select proacl into v_invoice_acl from pg_proc where oid = 'public.reconcile_paid_invoice'::regproc;
  select proacl into v_pi_acl from pg_proc where oid = 'public.reconcile_paid_pi'::regproc;
  if v_invoice_acl is distinct from v_pi_acl then
    raise exception 'REGRESSION: reconcile_paid_invoice and reconcile_paid_pi grants have drifted apart again (invoice=%, pi=%)', v_invoice_acl, v_pi_acl;
  end if;
end $$;

-- No RLS policy in public should call auth.uid()/auth.jwt()/auth.role() bare
-- -- every call must be wrapped in a scalar subquery so Postgres evaluates
-- it once per query instead of once per row (auth_rls_initplan fix).
do $$
declare v_count int;
begin
  select count(*) into v_count
  from pg_policies
  where schemaname = 'public'
    and (
      (qual is not null and qual ~ '(?<!SELECT )auth\.(uid|jwt|role)\(\)')
      or
      (with_check is not null and with_check ~ '(?<!SELECT )auth\.(uid|jwt|role)\(\)')
    );
  if v_count > 0 then
    raise exception 'REGRESSION: % RLS polic(y/ies) in public call auth.uid()/jwt()/role() unwrapped again (auth_rls_initplan)', v_count;
  end if;
end $$;

-- No table should have multiple PERMISSIVE policies effectively applying to
-- the same role for the same command (multiple_permissive_policies) --
-- Postgres ORs them all together and evaluates every predicate per row.
do $$
declare v_count int;
begin
  with expanded as (
    select tablename, cmd,
      (roles && '{public,authenticated}'::name[]) as applies_to_authenticated,
      (roles && '{public,anon}'::name[]) as applies_to_anon
    from pg_policies
    where schemaname = 'public' and permissive = 'PERMISSIVE'
  ),
  stacked as (
    select tablename, cmd from expanded where applies_to_authenticated group by tablename, cmd having count(*) > 1
    union all
    select tablename, cmd from expanded where applies_to_anon group by tablename, cmd having count(*) > 1
  )
  select count(*) into v_count from stacked;
  if v_count > 0 then
    raise exception 'REGRESSION: % table/command pair(s) have stacked permissive policies again (multiple_permissive_policies)', v_count;
  end if;
end $$;

-- kitchen_public must stay security_invoker so it can never silently bypass
-- RLS on `kitchens` if either the view or the underlying policy changes.
do $$
declare v_opts text[];
begin
  select reloptions into v_opts from pg_class where oid = 'public.kitchen_public'::regclass;
  if v_opts is null or not ('security_invoker=true' = any(v_opts)) then
    raise exception 'REGRESSION: public.kitchen_public lost security_invoker=true';
  end if;
end $$;

-- The one-time manual-repair backup table must stay gone.
do $$
begin
  if to_regclass('public.data_repair_backup_20260710') is not null then
    raise exception 'REGRESSION: public.data_repair_backup_20260710 exists again -- should have been dropped as dead';
  end if;
end $$;

-- is_kitchen_owner() must keep checking verification_status, not just
-- owner_id -- a suspended/rejected owner should not retain access via this
-- helper (used by messaging + financial-summary RPCs).
do $$
declare v_src text;
begin
  select prosrc into v_src from pg_proc where oid = 'public.is_kitchen_owner(uuid)'::regprocedure;
  if v_src !~* 'verification_status' then
    raise exception 'REGRESSION: is_kitchen_owner() no longer checks verification_status';
  end if;
end $$;

-- Automated payout reconciliation: needs_review must exist, keep its money reserved, and
-- stay off-limits to normal clients; kitchen_balance_cents must use the supported
-- service-role check (not the deprecated JWT-claim one) so the reconciler/auto-payout
-- sweep don't silently see balance=0.
do $$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'payout_status' and e.enumlabel = 'needs_review'
  ) then
    raise exception 'REGRESSION: payout_status is missing the needs_review value';
  end if;
end $$;

do $$
declare v_src text;
begin
  select prosrc into v_src from pg_proc where oid = 'public.reserve_payout(uuid)'::regprocedure;
  if v_src !~ 'needs_review' then
    raise exception 'REGRESSION: reserve_payout() no longer reserves funds for needs_review payouts';
  end if;
  select prosrc into v_src from pg_proc where oid = 'public.kitchen_balance_cents(uuid)'::regprocedure;
  if v_src ~ 'request\.jwt\.claim\.role' then
    raise exception 'REGRESSION: kitchen_balance_cents() reverted to the deprecated request.jwt.claim.role check';
  end if;
  if v_src !~ 'auth\.role\(\)' then
    raise exception 'REGRESSION: kitchen_balance_cents() lost its service-role branch entirely';
  end if;
end $$;

do $$
begin
  if has_function_privilege('authenticated', 'public.claim_stale_payouts(interval,integer)', 'execute') then
    raise exception 'REGRESSION: authenticated can call claim_stale_payouts() directly';
  end if;
  if has_function_privilege('authenticated', 'public.reconcile_payout(uuid,text,text,text)', 'execute') then
    raise exception 'REGRESSION: authenticated can call reconcile_payout() directly -- a client could fabricate a paid outcome';
  end if;
  if has_function_privilege('authenticated', 'public.notify_admins(text,text,text)', 'execute') then
    raise exception 'REGRESSION: authenticated can call notify_admins() directly -- admin notification spam vector';
  end if;
  if not has_function_privilege('authenticated', 'public.admin_resolve_payout(uuid,text,text,text)', 'execute') then
    raise exception 'REGRESSION: authenticated lost access to admin_resolve_payout() -- admin payout resolution is broken (it self-gates via is_admin())';
  end if;
end $$;

-- Automatic payout sweep: cooks must be able to opt out, and the worker-only claim RPC
-- must stay off-limits to normal clients (it inserts real payouts rows with no per-call
-- ownership check — it trusts its own eligibility query instead).
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'stripe_accounts' and column_name = 'auto_payout_enabled'
  ) then
    raise exception 'REGRESSION: stripe_accounts.auto_payout_enabled is missing -- cooks can no longer opt out of automatic payouts';
  end if;
  if has_function_privilege('authenticated', 'public.claim_auto_payouts(integer)', 'execute') then
    raise exception 'REGRESSION: authenticated can call claim_auto_payouts() directly';
  end if;
  if not has_function_privilege('authenticated', 'public.set_payout_preferences(uuid,boolean,integer)', 'execute') then
    raise exception 'REGRESSION: authenticated lost access to set_payout_preferences() -- cooks can no longer manage auto-payout settings';
  end if;
end $$;

-- Payout history/summary RPCs must stay reachable by cooks and keep hiding the raw
-- stripe_transfer_id (my_payouts doesn't select it at all).
do $$
begin
  if not has_function_privilege('authenticated', 'public.my_payouts(uuid,integer)', 'execute') then
    raise exception 'REGRESSION: authenticated lost access to my_payouts() -- payout history is broken';
  end if;
  if not has_function_privilege('authenticated', 'public.my_payout_summary(uuid)', 'execute') then
    raise exception 'REGRESSION: authenticated lost access to my_payout_summary() -- the money screen summary is broken';
  end if;
end $$;

-- Onboarding hardening: cooks are notified on approve/reject, the deprecated JWT-claim
-- service-role check must not have crept back into either function, and the cert-status
-- admin RPC must exist and stay off-limits to non-admin clients (it self-gates via is_admin(),
-- so it's granted broadly to authenticated -- only the negative anon/public check matters here).
do $$
declare v_src text;
begin
  select prosrc into v_src from pg_proc where oid = 'public.approve_kitchen(uuid)'::regprocedure;
  if v_src !~ 'notify\(' then
    raise exception 'REGRESSION: approve_kitchen() no longer notifies the applicant';
  end if;
  if v_src ~ 'request\.jwt\.claim\.role' then
    raise exception 'REGRESSION: approve_kitchen() reverted to the deprecated request.jwt.claim.role check';
  end if;
  select prosrc into v_src from pg_proc where oid = 'public.reject_kitchen(uuid,text)'::regprocedure;
  if v_src !~ 'notify\(' then
    raise exception 'REGRESSION: reject_kitchen() no longer notifies the applicant';
  end if;
  if v_src ~ 'request\.jwt\.claim\.role' then
    raise exception 'REGRESSION: reject_kitchen() reverted to the deprecated request.jwt.claim.role check';
  end if;
end $$;

do $$
begin
  if has_function_privilege('anon', 'public.admin_set_cert_status(uuid,text,date)', 'execute') then
    raise exception 'REGRESSION: anon can call admin_set_cert_status() directly';
  end if;
  if has_function_privilege('anon', 'public.nudge_stripe_onboarding()', 'execute') then
    raise exception 'REGRESSION: anon can call nudge_stripe_onboarding() directly';
  end if;
  if has_function_privilege('authenticated', 'public.nudge_stripe_onboarding()', 'execute') then
    raise exception 'REGRESSION: authenticated can call nudge_stripe_onboarding() directly';
  end if;
end $$;

do $$
begin
  if has_function_privilege('anon', 'public.admin_dashboard_metrics(int)', 'execute') then
    raise exception 'REGRESSION: anon can call admin_dashboard_metrics() directly';
  end if;
  if not has_function_privilege('authenticated', 'public.admin_dashboard_metrics(int)', 'execute') then
    raise exception 'REGRESSION: authenticated lost access to admin_dashboard_metrics() -- it self-gates via is_admin(), the launch dashboard is broken';
  end if;
  if (select count(*) from public.admin_dashboard_metrics()) <> 0 then
    raise exception 'REGRESSION: admin_dashboard_metrics() returned rows for a non-admin caller in this test session';
  end if;
end $$;

do $$
begin
  if has_function_privilege('authenticated', 'public.detect_system_health_issues()', 'execute') then
    raise exception 'REGRESSION: authenticated can call detect_system_health_issues() directly -- worker-only RPC exposed';
  end if;
  if has_function_privilege('anon', 'public.detect_system_health_issues()', 'execute') then
    raise exception 'REGRESSION: anon can call detect_system_health_issues() directly';
  end if;
  -- Guarded no-op locally/CI (no pg_cron/pg_net there) -- just confirm it doesn't raise.
  perform public.detect_system_health_issues();
end $$;

do $$
begin
  if has_function_privilege('authenticated', 'public.prune_cron_job_run_details(int)', 'execute') then
    raise exception 'REGRESSION: authenticated can call prune_cron_job_run_details() directly -- worker-only RPC exposed';
  end if;
  if has_function_privilege('anon', 'public.prune_cron_job_run_details(int)', 'execute') then
    raise exception 'REGRESSION: anon can call prune_cron_job_run_details() directly';
  end if;
  -- Guarded no-op locally/CI (no pg_cron there) -- just confirm it doesn't raise.
  perform public.prune_cron_job_run_details();
end $$;

do $$
declare v_src text;
begin
  select prosrc into v_src
  from pg_proc
  where oid = 'public.admin_set_cert_status(uuid,text,date)'::regprocedure;
  if v_src !~ 'reviewed.*p_expires is null' then
    raise exception 'REGRESSION: reviewed certificate no longer requires an expiration date';
  end if;
  if v_src !~ 'reviewed.*p_expires < current_date' then
    raise exception 'REGRESSION: expired certificate can be marked reviewed';
  end if;
  if v_src !~ 'case when p_status = ''unverified'' then null' then
    raise exception 'REGRESSION: unverified certificate can retain a stale expiration date';
  end if;
end $$;

-- Cook order detail must expose the customer id needed by the relationship-gated
-- messaging RPC, while remaining unavailable to anonymous callers.
do $$
declare v_result text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name = 'delivery_address_text'
      and data_type = 'text'
  ) then
    raise exception 'REGRESSION: orders.delivery_address_text is missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name = 'delivery_instructions'
      and data_type = 'text'
  ) then
    raise exception 'REGRESSION: orders.delivery_instructions is missing';
  end if;

  select pg_get_function_result('public.kitchen_order_detail(uuid)'::regprocedure) into v_result;
  if v_result !~ 'buyer_id uuid' then
    raise exception 'REGRESSION: kitchen_order_detail() no longer returns buyer_id -- cook-to-customer order messaging is broken';
  end if;
  if v_result !~ 'delivery_address_text text' then
    raise exception 'REGRESSION: kitchen_order_detail() no longer returns the delivery address snapshot';
  end if;
  if v_result !~ 'delivery_instructions text' then
    raise exception 'REGRESSION: kitchen_order_detail() no longer returns customer delivery instructions';
  end if;
  if v_result !~ 'pay_status text' then
    raise exception 'REGRESSION: kitchen_order_detail() no longer returns authoritative payment status';
  end if;
  if has_function_privilege('anon', 'public.kitchen_order_detail(uuid)', 'execute') then
    raise exception 'REGRESSION: anon can call kitchen_order_detail() directly';
  end if;
  if not has_function_privilege('authenticated', 'public.kitchen_order_detail(uuid)', 'execute') then
    raise exception 'REGRESSION: authenticated lost access to kitchen_order_detail()';
  end if;
end $$;

do $$
declare v_src text;
begin
  select pg_get_functiondef('public.update_order_status(uuid,text)'::regprocedure) into v_src;
  if v_src !~ 'pay_status.*paid' then
    raise exception 'REGRESSION: update_order_status() no longer blocks unpaid fulfillment';
  end if;
  if v_src !~ 'delivery_address_text' then
    raise exception 'REGRESSION: update_order_status() no longer blocks delivery fulfillment without an address';
  end if;
end $$;

do $$
declare v_src text;
begin
  if to_regprocedure('public.finalize_order_cancel(uuid,boolean,text)') is null then
    raise exception 'REGRESSION: reason-aware finalize_order_cancel() is missing';
  end if;
  select prosrc into v_src from pg_proc where oid = 'public.finalize_order_cancel(uuid,boolean,text)'::regprocedure;
  if v_src !~ 'v_reason' or v_src !~ 'Reason:' then
    raise exception 'REGRESSION: order cancellation reason is no longer included in the customer notification';
  end if;
  if has_function_privilege('authenticated', 'public.finalize_order_cancel(uuid,boolean,text)', 'execute') then
    raise exception 'REGRESSION: authenticated can call service-only finalize_order_cancel()';
  end if;
end $$;

-- Disclosure editing: cooks must be able to backfill ingredients/allergens on existing meals,
-- the gate must stay (ingredients + explicit review), anon must never call it, and
-- update_meal() must not wipe the description when the caller omits it.
do $$
declare v_src text;
begin
  select prosrc into v_src from pg_proc
  where oid = 'public.set_meal_disclosure(uuid,text,text[],boolean)'::regprocedure;
  if v_src !~ 'list the meal ingredients' or v_src !~ 'confirm the allergen review' or v_src !~ 'is_active_kitchen_owner' then
    raise exception 'REGRESSION: set_meal_disclosure() lost its ingredient/review/ownership checks';
  end if;
  if has_function_privilege('anon', 'public.set_meal_disclosure(uuid,text,text[],boolean)', 'execute') then
    raise exception 'REGRESSION: anonymous users can edit meal disclosures';
  end if;
  if (select prosrc from pg_proc where oid = 'public.update_meal(uuid,text,text,integer,integer,text[],text)'::regprocedure)
     !~ 'p_description is null then description' then
    raise exception 'REGRESSION: update_meal() wipes the description when it is omitted';
  end if;
  if not exists (
    select 1 from pg_proc p, unnest(p.proargnames) n where p.oid = 'public.my_meals()'::regprocedure and n = 'allergen_reviewed_at'
  ) then
    raise exception 'REGRESSION: my_meals() no longer returns disclosure status';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.reviews'::regclass
      and conname = 'reviews_body_length'
      and pg_get_constraintdef(oid) ~ 'char_length\(body\) <= 2000'
  ) then
    raise exception 'REGRESSION: review body length is no longer bounded at the database';
  end if;
end $$;

do $$
declare v_src text;
begin
  select prosrc into v_src from pg_proc
  where oid = 'public.admin_ticket_detail(uuid)'::regprocedure;
  if v_src !~ 'author_kind' or v_src !~ 'reporter_id' or v_src !~ '''cook''' then
    raise exception 'REGRESSION: admin ticket detail no longer distinguishes reporter and cook messages';
  end if;
end $$;

-- RFQ balance collection must retain an ambiguous Stripe outcome and serialize claims.
do $$
declare v_reserve text; v_finalize text; v_claim text;
begin
  select prosrc into v_reserve from pg_proc where oid = 'public.reserve_balance_charge(uuid)'::regprocedure;
  select prosrc into v_finalize from pg_proc where oid = 'public.finalize_balance_charge(uuid,text,boolean)'::regprocedure;
  select prosrc into v_claim from pg_proc where oid = 'public.claim_ambiguous_balance_charges(interval,integer)'::regprocedure;
  if v_reserve !~ 'balance_charge_status = ''charging''' or v_reserve !~ '''charging'', ''ambiguous''' then
    raise exception 'REGRESSION: booking balance reservation no longer persists or respects an active charge claim';
  end if;
  if v_finalize !~ 'balance_charge_status = ''paid''' or v_finalize !~ 'balance_charge_status = ''failed''' then
    raise exception 'REGRESSION: booking balance finalization no longer records the authoritative outcome';
  end if;
  if v_claim !~ 'for update skip locked' or v_claim !~ 'balance_charge_reconcile_attempts' then
    raise exception 'REGRESSION: ambiguous booking balance reconciliation is no longer concurrency-safe';
  end if;
  if has_function_privilege('authenticated', 'public.reserve_balance_charge(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.mark_balance_charge_ambiguous(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.claim_ambiguous_balance_charges(interval,integer)', 'execute') then
    raise exception 'REGRESSION: booking balance service RPCs are exposed to authenticated users';
  end if;
  if not exists (
    select 1 from pg_constraint where conrelid = 'public.bookings'::regclass
      and conname = 'bookings_balance_charge_status_check'
      and pg_get_constraintdef(oid) ~ 'ambiguous'
  ) then
    raise exception 'REGRESSION: booking balance charge states are no longer constrained';
  end if;
  if not exists (
    select 1 from pg_proc p, unnest(p.proargnames) n
    where p.oid = 'public.admin_booking_detail(uuid)'::regprocedure and n = 'balance_charge_status'
  ) then
    raise exception 'REGRESSION: admin booking detail no longer exposes balance charge status';
  end if;
end $$;

do $$
declare v_src text;
begin
  select prosrc into v_src from pg_proc where oid = 'public.create_experience_booking(uuid,uuid,integer)'::regprocedure;
  if v_src !~ 'confirmed.*in_progress.*completed' or v_src !~ 'alreadyPaid' then
    raise exception 'REGRESSION: experience booking no longer reuses an existing active customer booking';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_indexes where schemaname='public' and tablename='subscriptions'
      and indexname='subscriptions_one_active_plan_per_customer'
      and indexdef ~ 'customer_id, plan_id' and indexdef ~ 'cancelled' and indexdef ~ 'completed'
  ) then
    raise exception 'REGRESSION: concurrent active plan subscription guard is missing';
  end if;
end $$;

rollback;

select 'all regression checks passed' as result;
