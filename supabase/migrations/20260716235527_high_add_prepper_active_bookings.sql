-- Adds the RPC backing the newly-wired "Active bookings" section in hub/requests.tsx (cook-side
-- Mark complete / Cancel actions for accepted rfq bookings). Direct-query alternative wasn't
-- viable: profiles' RLS (profiles_select_self_or_public_cook) only lets a cook read their OWN
-- profile or another VERIFIED COOK's profile, not a customer's -- a plain
-- `.from('bookings').select('..., profiles(display_name)')` would silently return null for every
-- customer name. Mirrors prepper_incoming_requests()'s existing pattern exactly (same
-- SECURITY DEFINER + auth.uid()-scoped-to-owned-kitchens shape) for this same class of problem:
-- a cook needs limited visibility into a customer's identity, but only for an active engagement
-- (an accepted booking), not blanket profile access.
create or replace function public.prepper_active_bookings()
returns table(booking_id uuid, customer_name text, status booking_status, amount_cents integer, deposit_cents integer, balance_cents integer, event_date date)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select b.id, coalesce(p.display_name, 'A customer'), b.status, b.amount_cents, b.deposit_cents, b.balance_cents, b.event_date
  from public.bookings b
  join public.kitchens k on k.id = b.kitchen_id and k.owner_id = auth.uid()
  left join public.profiles p on p.id = b.customer_id
  where b.booking_kind = 'rfq' and b.status in ('confirmed', 'in_progress')
  order by b.event_date asc;
$function$;

revoke all on function public.prepper_active_bookings() from public, anon;
grant execute on function public.prepper_active_bookings() to authenticated;
