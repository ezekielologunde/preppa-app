-- Fixes audit Critical #1: connect-payout had no lock/idempotency key on the Stripe
-- Transfer call, so an onboarded prepper could double/multi-submit cash-out and extract
-- more real money than their ledger balance allowed.
--
-- reserve_payout atomically locks the kitchen (pg_advisory_xact_lock), computes the
-- payable balance net of any already-'pending' payouts, and inserts a 'pending' payout
-- row reserving that amount. Concurrent calls for the same kitchen serialize on the lock,
-- so a second concurrent call sees the first call's reservation before deciding its own
-- amount. finalize_payout transitions that specific row from 'pending' to 'paid'/'failed'
-- exactly once (WHERE status='pending' guards against replay).
--
-- APPLIED LIVE to project fwidhpzwldneeaphrxgg on 2026-07-14 (via Supabase MCP
-- apply_migration, same name). This file is the vendored source-control copy.

create or replace function public.reserve_payout(p_kitchen_id uuid)
returns table(payout_id uuid, amount_cents integer, stripe_account_id text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_owner uuid;
  v_stripe_account_id text;
  v_payouts_enabled boolean;
  v_available integer;
  v_pending integer;
  v_payout_id uuid;
begin
  select owner_id into v_owner from kitchens where id = p_kitchen_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not your kitchen' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('payout:' || p_kitchen_id::text));

  select sa.stripe_account_id, sa.payouts_enabled into v_stripe_account_id, v_payouts_enabled
  from stripe_accounts sa where sa.kitchen_id = p_kitchen_id;
  if v_stripe_account_id is null or not coalesce(v_payouts_enabled, false) then
    raise exception 'Finish payout setup first.' using errcode = 'P0001';
  end if;

  select coalesce(sum(p.amount_cents), 0) into v_pending
  from payouts p where p.kitchen_id = p_kitchen_id and p.status = 'pending';

  v_available := kitchen_balance_cents(p_kitchen_id) - v_pending;
  if v_available <= 0 then
    raise exception 'Nothing to cash out yet.' using errcode = 'P0002';
  end if;

  insert into payouts (kitchen_id, amount_cents, status)
  values (p_kitchen_id, v_available, 'pending')
  returning id into v_payout_id;

  return query select v_payout_id, v_available, v_stripe_account_id;
end;
$$;

revoke all on function public.reserve_payout(uuid) from public;
revoke all on function public.reserve_payout(uuid) from anon;
grant execute on function public.reserve_payout(uuid) to authenticated;

create or replace function public.finalize_payout(p_payout_id uuid, p_stripe_transfer_id text, p_success boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_kitchen_id uuid;
  v_amount integer;
  v_owner uuid;
begin
  select po.kitchen_id, po.amount_cents into v_kitchen_id, v_amount
  from payouts po where po.id = p_payout_id and po.status = 'pending';
  if v_kitchen_id is null then
    return;
  end if;

  select owner_id into v_owner from kitchens where id = v_kitchen_id;
  if v_owner <> auth.uid()
     and current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'not your kitchen' using errcode = '42501';
  end if;

  if p_success then
    update payouts set status = 'paid', stripe_transfer_id = p_stripe_transfer_id where id = p_payout_id;
    insert into ledger_entries (kitchen_id, kind, amount_cents, memo)
    values (v_kitchen_id, 'payout', -v_amount, 'Payout to your account');
    insert into audit_log (actor_id, action, entity, entity_id, meta)
    values (auth.uid(), 'payout_created', 'kitchen', v_kitchen_id,
            jsonb_build_object('transfer', p_stripe_transfer_id, 'amount_cents', v_amount));
  else
    update payouts set status = 'failed' where id = p_payout_id;
  end if;
end;
$$;

revoke all on function public.finalize_payout(uuid, text, boolean) from public;
revoke all on function public.finalize_payout(uuid, text, boolean) from anon;
grant execute on function public.finalize_payout(uuid, text, boolean) to authenticated;
