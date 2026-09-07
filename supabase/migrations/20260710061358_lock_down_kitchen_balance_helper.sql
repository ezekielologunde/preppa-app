-- kitchen_balance_cents is a SECURITY DEFINER helper with no internal authz check;
-- it must not be a client-callable RPC (would leak any kitchen's balance). It stays
-- callable internally by the (properly gated) kitchen_earnings_summary, which runs as
-- the function owner. Defense in depth: revoke client EXECUTE + add an owner check.
revoke execute on function public.kitchen_balance_cents(uuid) from anon, authenticated;

create or replace function public.kitchen_balance_cents(kid uuid)
returns integer
language sql stable security definer set search_path to 'public'
as $function$
  select coalesce(sum(amount_cents), 0)::integer
  from ledger_entries
  where kitchen_id = kid
    and (is_kitchen_owner(kid)
         or current_setting('request.jwt.claim.role', true) is not distinct from 'service_role');
$function$;
revoke execute on function public.kitchen_balance_cents(uuid) from anon, authenticated;
