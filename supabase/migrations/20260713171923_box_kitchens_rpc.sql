-- The distinct kitchens in a customer's cross-kitchen box, for the messaging cook-picker
-- (a box = N per-cook threads, one per kitchen — never a group thread).
create or replace function box_kitchens(p_subscription uuid)
returns table(kitchen_id uuid, name text)
language sql security definer set search_path to 'public' stable as $$
  select distinct bi.kitchen_id, k.name
  from subscription_box_items bi
  join subscriptions s on s.id = bi.subscription_id
  join kitchens k on k.id = bi.kitchen_id
  where bi.subscription_id = p_subscription
    and (s.customer_id = auth.uid() or is_admin())
  order by k.name;
$$;

revoke all on function box_kitchens(uuid) from public, anon;
grant execute on function box_kitchens(uuid) to authenticated, service_role;
