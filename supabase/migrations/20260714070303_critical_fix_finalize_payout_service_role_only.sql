-- Tightening follow-up to critical_fix_payout_double_spend_lock: finalize_payout must
-- only ever be invoked by the trusted connect-payout Edge Function (via its service-role
-- admin client) AFTER a real Stripe Transfer call resolves -- not directly by an
-- authenticated user, who could otherwise call it themselves with a fabricated
-- stripe_transfer_id and mark their own payout 'paid' (and write a real ledger debit)
-- without any money ever moving through Stripe.
--
-- APPLIED LIVE to project fwidhpzwldneeaphrxgg on 2026-07-14 (via Supabase MCP
-- apply_migration, same name). This file is the vendored source-control copy.

revoke execute on function public.finalize_payout(uuid, text, boolean) from authenticated;
grant execute on function public.finalize_payout(uuid, text, boolean) to service_role;

-- finalize_payout no longer needs to check auth.uid() against the kitchen owner (it is
-- now only reachable via service_role, which the edge function uses after confirming the
-- caller owned the kitchen inside reserve_payout). Simplify accordingly.
create or replace function public.finalize_payout(p_payout_id uuid, p_stripe_transfer_id text, p_success boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $body3$
declare
  v_kitchen_id uuid;
  v_amount integer;
begin
  select po.kitchen_id, po.amount_cents into v_kitchen_id, v_amount
  from payouts po where po.id = p_payout_id and po.status = 'pending';
  if v_kitchen_id is null then
    return;
  end if;

  if p_success then
    update payouts set status = 'paid', stripe_transfer_id = p_stripe_transfer_id where id = p_payout_id;
    insert into ledger_entries (kitchen_id, kind, amount_cents, memo)
    values (v_kitchen_id, 'payout', -v_amount, 'Payout to your account');
    insert into audit_log (actor_id, action, entity, entity_id, meta)
    values (null, 'payout_created', 'kitchen', v_kitchen_id,
            jsonb_build_object('transfer', p_stripe_transfer_id, 'amount_cents', v_amount));
  else
    update payouts set status = 'failed' where id = p_payout_id;
  end if;
end;
$body3$;

revoke all on function public.finalize_payout(uuid, text, boolean) from public;
revoke all on function public.finalize_payout(uuid, text, boolean) from anon;
revoke all on function public.finalize_payout(uuid, text, boolean) from authenticated;
grant execute on function public.finalize_payout(uuid, text, boolean) to service_role;
