-- Launch-prep gap: is_kitchen_orderable() (used by meals_select_live_public, the RLS policy
-- gating public/customer meal browsing) only checked verification_status='verified' and
-- availability='open' -- NOT whether the kitchen can actually receive money. create-order's
-- payout gate separately requires stripe_accounts.payouts_enabled. Divergence between the two
-- meant a kitchen could appear as a normal, orderable listing in discovery while checkout
-- permanently 409s -- exactly what the 6 seed-owned kitchens (seed+*@preppa.local, no real
-- human behind them, can never complete Connect KYC) do today, and what any real cook who
-- hasn't finished payout onboarding yet would also do.
--
-- Rather than special-case the 6 seed kitchens (a list that has to be remembered and kept in
-- sync), fix the general rule at its single source of truth: a kitchen is only "orderable" if
-- it can also get paid. This immediately removes the 6 seed kitchens from public browse/
-- checkout (none have payouts_enabled) with zero data touched -- no rows deleted, no orders/
-- ledger history affected -- and prevents the same dead-end for any future real cook mid-
-- onboarding. "I made Kitchen" (payouts_enabled=true) is unaffected.
create or replace function public.is_kitchen_orderable(kid uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from kitchens k
    join stripe_accounts sa on sa.kitchen_id = k.id
    where k.id = kid
      and k.verification_status = 'verified'
      and k.availability = 'open'
      and sa.payouts_enabled = true
  );
$function$;
