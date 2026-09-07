-- Real account deletion, replacing what was previously a client-side-only fake (signed the
-- user out + cleared local cache, told them "Account deleted", but their real auth.users row,
-- profile, order history, and saved card all remained fully intact and re-accessible by
-- signing back in). App Store 5.1.1(v) / Google Play require real in-app deletion; GDPR/CCPA
-- erasure requests need it to actually do something. Policy (confirmed): anonymize + disable
-- sign-in rather than hard-delete (orders.customer_id -> profiles is RESTRICT, so a hard
-- delete is blocked by any real order history anyway -- same constraint class as the seed-
-- kitchen deletion earlier). A cook with an active kitchen that has in-flight orders, an
-- uncashed balance, or active subscribers is blocked from deleting until those are resolved
-- (matches how Etsy/Airbnb gate seller account closure) -- deleting out from under paying
-- subscribers or forfeiting a real balance would be a worse outcome than the block.

create or replace function public.cook_deletion_blockers(p_kitchen_id uuid)
returns table(has_active_orders boolean, balance_cents integer, active_subscribers integer)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    exists (
      select 1 from orders o
      where o.kitchen_id = p_kitchen_id and o.status in ('confirmed','preparing','ready')
    ),
    coalesce((select sum(amount_cents) from ledger_entries where kitchen_id = p_kitchen_id), 0)::int,
    (select count(*)::int from subscriptions s where s.kitchen_id = p_kitchen_id and s.status in ('active','trialing'));
$function$;

revoke all on function public.cook_deletion_blockers(uuid) from public;
grant execute on function public.cook_deletion_blockers(uuid) to service_role;
