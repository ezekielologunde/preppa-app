-- Automated payout reconciliation.
--
-- connect-payout leaves a payouts row 'pending' whenever Stripe's answer to the transfer is
-- ambiguous (timeout / connection / API error even after same-key retries), and any crash
-- between reserve_payout and finalize_payout does the same. Nothing aged those out; the code
-- comment told a human to go search the Stripe dashboard. This adds the schema + RPCs for a
-- cron-driven worker (reconcile-payouts edge fn) that resolves them safely:
--   * replay the SAME idempotency key (Stripe returns the original transfer, never a second one)
--   * or look the transfer up by metadata.payout_id
--   * or, when still unknown, park the row as 'needs_review' with the money still reserved
--     and notify admins -- never auto-fail (that would free funds for a possible double payout).

-- ---------------------------------------------------------------------------------------
-- payouts: bookkeeping columns for the reconciler and the admin screen.
alter table public.payouts
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'auto')),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists reconciled_at timestamptz,
  add column if not exists reconcile_attempts integer not null default 0,
  add column if not exists failure_reason text;

drop trigger if exists payouts_updated_at on public.payouts;
create trigger payouts_updated_at before update on public.payouts
  for each row execute function public.set_updated_at();

create index if not exists payouts_open_idx
  on public.payouts (status, created_at)
  where status in ('pending', 'needs_review');

-- ---------------------------------------------------------------------------------------
-- kitchen_balance_cents: the service-role branch used the deprecated
-- current_setting('request.jwt.claim.role') check (see critical_fix_rate_limit_service_role_detection),
-- which never fires for a real service-role caller, so any worker got balance = 0. Detect the
-- role the supported way so the auto-payout sweep can share this one canonical balance function.
create or replace function public.kitchen_balance_cents(kid uuid)
returns integer
language sql stable security definer set search_path to 'public'
as $function$
  select coalesce(sum(amount_cents), 0)::integer
  from ledger_entries
  where kitchen_id = kid
    and (is_kitchen_owner(kid) or auth.role() = 'service_role');
$function$;
revoke execute on function public.kitchen_balance_cents(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- reserve_payout: a 'needs_review' payout must keep its amount reserved exactly like a
-- 'pending' one, otherwise a cook could cash the same balance out again while an admin is
-- still working out whether the first transfer actually landed.
create or replace function public.reserve_payout(p_kitchen_id uuid)
returns table(payout_id uuid, amount_cents integer, stripe_account_id text)
language plpgsql
security definer
set search_path to 'public'
as $body$
declare
  v_owner uuid;
  v_status verification_status;
  v_stripe_account_id text;
  v_payouts_enabled boolean;
  v_available integer;
  v_pending integer;
  v_payout_id uuid;
begin
  select owner_id, verification_status into v_owner, v_status from kitchens where id = p_kitchen_id;
  if v_owner is null or v_owner is distinct from auth.uid() then
    raise exception 'not your kitchen' using errcode = '42501';
  end if;
  if v_status <> 'verified' then
    raise exception 'This kitchen cannot cash out right now.' using errcode = 'P0014';
  end if;

  perform pg_advisory_xact_lock(hashtext('payout:' || p_kitchen_id::text));

  select sa.stripe_account_id, sa.payouts_enabled into v_stripe_account_id, v_payouts_enabled
  from stripe_accounts sa where sa.kitchen_id = p_kitchen_id;
  if v_stripe_account_id is null or not coalesce(v_payouts_enabled, false) then
    raise exception 'Finish payout setup first.' using errcode = 'P0001';
  end if;

  select coalesce(sum(p.amount_cents), 0) into v_pending
  from payouts p where p.kitchen_id = p_kitchen_id and p.status in ('pending', 'needs_review');

  v_available := kitchen_balance_cents(p_kitchen_id) - v_pending;
  if v_available <= 0 then
    raise exception 'Nothing to cash out yet.' using errcode = 'P0002';
  end if;

  insert into payouts (kitchen_id, amount_cents, status, source)
  values (p_kitchen_id, v_available, 'pending', 'manual')
  returning id into v_payout_id;

  return query select v_payout_id, v_available, v_stripe_account_id;
end;
$body$;

-- ---------------------------------------------------------------------------------------
-- notify_admins: fan a notification out to every admin profile (via notify(), which handles
-- the in-app row + push). Worker-only.
create or replace function public.notify_admins(p_kind text, p_title text, p_body text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_admin uuid;
begin
  for v_admin in select id from profiles where role = 'admin' loop
    perform notify(v_admin, p_kind, p_title, p_body);
  end loop;
end;
$$;
revoke all on function public.notify_admins(text, text, text) from public, anon, authenticated;
grant execute on function public.notify_admins(text, text, text) to service_role;

-- ---------------------------------------------------------------------------------------
-- claim_stale_payouts: hand the worker a batch of pending payouts old enough that no live
-- connect-payout request can still be inside its own retry loop for them. skip locked so
-- overlapping cron ticks never double-process a row.
create or replace function public.claim_stale_payouts(
  p_min_age interval default interval '10 minutes',
  p_limit integer default 50
)
returns table(
  payout_id uuid,
  kitchen_id uuid,
  amount_cents integer,
  stripe_account_id text,
  created_at timestamptz,
  reconcile_attempts integer
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  return query
  with claimed as (
    select p.id
    from payouts p
    where p.status = 'pending'
      and p.created_at < now() - p_min_age
    order by p.created_at
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    for update skip locked
  ),
  bumped as (
    update payouts p
       set reconcile_attempts = p.reconcile_attempts + 1
      from claimed c
     where p.id = c.id
    returning p.id, p.kitchen_id, p.amount_cents, p.created_at, p.reconcile_attempts
  )
  select b.id, b.kitchen_id, b.amount_cents, sa.stripe_account_id, b.created_at, b.reconcile_attempts
  from bumped b
  left join stripe_accounts sa on sa.kitchen_id = b.kitchen_id
  order by b.created_at;
end;
$$;
revoke all on function public.claim_stale_payouts(interval, integer) from public, anon, authenticated;
grant execute on function public.claim_stale_payouts(interval, integer) to service_role;

-- ---------------------------------------------------------------------------------------
-- reconcile_payout: the only way a reconciled outcome is written. 'paid' and 'failed' delegate
-- to finalize_payout so the ledger debit + audit trail stay single-sourced; 'needs_review'
-- parks the row (amount still reserved -- see reserve_payout) and pages the admins.
create or replace function public.reconcile_payout(
  p_payout_id uuid,
  p_outcome text,
  p_stripe_transfer_id text default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_kitchen_id uuid;
  v_amount integer;
  v_attempts integer;
  v_kitchen_name text;
begin
  if p_outcome not in ('paid', 'failed', 'needs_review') then
    raise exception 'invalid outcome %', p_outcome using errcode = '22023';
  end if;

  select po.kitchen_id, po.amount_cents, po.reconcile_attempts
    into v_kitchen_id, v_amount, v_attempts
  from payouts po where po.id = p_payout_id and po.status = 'pending'
  for update;
  if v_kitchen_id is null then
    return; -- already resolved by a concurrent path; nothing to do
  end if;

  if p_outcome = 'paid' then
    if p_stripe_transfer_id is null then
      raise exception 'a stripe transfer id is required to mark a payout paid' using errcode = '22023';
    end if;
    perform finalize_payout(p_payout_id, p_stripe_transfer_id, true);
    update payouts set reconciled_at = now(), failure_reason = null where id = p_payout_id;
  elsif p_outcome = 'failed' then
    perform finalize_payout(p_payout_id, null, false);
    update payouts set reconciled_at = now(), failure_reason = p_reason where id = p_payout_id;
  else
    update payouts set status = 'needs_review', failure_reason = p_reason where id = p_payout_id;
    insert into audit_log (actor_id, action, entity, entity_id, meta)
    values (null, 'payout_needs_review', 'payout', p_payout_id,
            jsonb_build_object('kitchen_id', v_kitchen_id, 'amount_cents', v_amount,
                               'reason', p_reason, 'attempts', v_attempts));
    select name into v_kitchen_name from kitchens where id = v_kitchen_id;
    perform notify_admins(
      'admin',
      'Payout needs review',
      '$' || to_char(v_amount / 100.0, 'FM999999990.00') || ' payout for ' || coalesce(v_kitchen_name, 'a kitchen')
        || ' could not be confirmed with Stripe (' || coalesce(p_reason, 'unknown') || '). Resolve it in Admin › Payouts.'
    );
  end if;
end;
$$;
revoke all on function public.reconcile_payout(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.reconcile_payout(uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------------------
-- Admin surface: list payouts and resolve the parked ones by hand after checking Stripe.
create or replace function public.admin_list_payouts(p_status payout_status default null, p_limit integer default 100)
returns table(
  id uuid,
  kitchen_id uuid,
  kitchen_name text,
  amount_cents integer,
  status payout_status,
  source text,
  stripe_transfer_id text,
  failure_reason text,
  reconcile_attempts integer,
  created_at timestamptz,
  updated_at timestamptz,
  reconciled_at timestamptz
)
language sql stable security definer set search_path to 'public'
as $$
  select p.id, p.kitchen_id, k.name, p.amount_cents, p.status, p.source, p.stripe_transfer_id,
         p.failure_reason, p.reconcile_attempts, p.created_at, p.updated_at, p.reconciled_at
  from payouts p
  join kitchens k on k.id = p.kitchen_id
  where public.is_admin()
    and (p_status is null or p.status = p_status)
  order by (p.status = 'needs_review') desc, p.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;
revoke all on function public.admin_list_payouts(payout_status, integer) from public, anon;
grant execute on function public.admin_list_payouts(payout_status, integer) to authenticated;

-- Only needs_review -> paid | failed. 'paid' requires the real transfer id the admin found in
-- Stripe. finalize_payout only acts on 'pending', so flip back inside the same transaction.
create or replace function public.admin_resolve_payout(
  p_payout_id uuid,
  p_outcome text,
  p_stripe_transfer_id text default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_kitchen_id uuid;
  v_amount integer;
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if p_outcome not in ('paid', 'failed') then
    raise exception 'outcome must be paid or failed' using errcode = '22023';
  end if;
  if p_outcome = 'paid' and coalesce(length(btrim(p_stripe_transfer_id)), 0) < 4 then
    raise exception 'the Stripe transfer id is required to mark a payout paid' using errcode = '22023';
  end if;

  select kitchen_id, amount_cents into v_kitchen_id, v_amount
  from payouts where id = p_payout_id and status = 'needs_review'
  for update;
  if v_kitchen_id is null then
    raise exception 'payout is not awaiting review' using errcode = 'P0001';
  end if;

  update payouts set status = 'pending' where id = p_payout_id;
  perform finalize_payout(p_payout_id, p_stripe_transfer_id, p_outcome = 'paid');
  update payouts
     set reconciled_at = now(),
         failure_reason = case when p_outcome = 'failed' then coalesce(p_note, 'admin marked failed') else null end
   where id = p_payout_id;

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (auth.uid(), 'payout_admin_resolved', 'payout', p_payout_id,
          jsonb_build_object('kitchen_id', v_kitchen_id, 'amount_cents', v_amount,
                             'outcome', p_outcome, 'transfer', p_stripe_transfer_id, 'note', p_note));
end;
$$;
revoke all on function public.admin_resolve_payout(uuid, text, text, text) from public, anon;
grant execute on function public.admin_resolve_payout(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------
-- Schedule the worker. pg_cron + the worker secret only exist on the hosted project, so this
-- is a guarded no-op on a fresh local/CI stack.
do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.unschedule('reconcile-payouts')
      where exists (select 1 from cron.job where jobname = 'reconcile-payouts');
    perform cron.schedule(
      'reconcile-payouts',
      '*/5 * * * *',
      $job$
        select net.http_post(
          url := 'https://fwidhpzwldneeaphrxgg.supabase.co/functions/v1/reconcile-payouts',
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'stripe_sync_worker_secret'),
            'Content-Type', 'application/json'),
          body := '{}'::jsonb
        )
        where exists (select 1 from vault.decrypted_secrets where name = 'stripe_sync_worker_secret');
      $job$
    );
  end if;
end $$;
