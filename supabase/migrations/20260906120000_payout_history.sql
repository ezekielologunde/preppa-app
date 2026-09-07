-- Payout history + summary for the cook's own money screen, and rate-limit connect-status
-- (it calls Stripe on every load with no throttle at all).

create or replace function public.my_payouts(p_kitchen_id uuid, p_limit integer default 50)
returns table(
  id uuid,
  amount_cents integer,
  status payout_status,
  source text,
  created_at timestamptz,
  reconciled_at timestamptz,
  failure_reason text
)
language sql stable security definer set search_path to 'public'
as $$
  select p.id, p.amount_cents, p.status, p.source, p.created_at, p.reconciled_at, p.failure_reason
  from payouts p
  where is_kitchen_owner(p_kitchen_id) and p.kitchen_id = p_kitchen_id
  order by p.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;
revoke all on function public.my_payouts(uuid, integer) from public, anon;
grant execute on function public.my_payouts(uuid, integer) to authenticated;

-- available_cents nets out any pending/needs_review payout (same math as reserve_payout's
-- own "available" check) so the UI never shows money as cashable that a payout already has
-- a hold on -- tapping "cash out" on the raw ledger balance while one is in flight would just
-- hit reserve_payout's "nothing to cash out" error.
create or replace function public.my_payout_summary(p_kitchen_id uuid)
returns table(available_cents integer, pending_cents integer, paid_total_cents integer)
language sql stable security definer set search_path to 'public'
as $$
  select
    greatest(0, kitchen_balance_cents(p_kitchen_id) - coalesce((select sum(amount_cents) from payouts where kitchen_id = p_kitchen_id and status in ('pending', 'needs_review')), 0))::int,
    coalesce((select sum(amount_cents) from payouts where kitchen_id = p_kitchen_id and status in ('pending', 'needs_review')), 0)::int,
    coalesce((select sum(amount_cents) from payouts where kitchen_id = p_kitchen_id and status = 'paid'), 0)::int
  where is_kitchen_owner(p_kitchen_id);
$$;
revoke all on function public.my_payout_summary(uuid) from public, anon;
grant execute on function public.my_payout_summary(uuid) to authenticated;
