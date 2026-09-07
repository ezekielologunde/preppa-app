DROP FUNCTION cook_subscribers();
CREATE FUNCTION public.cook_subscribers()
 RETURNS TABLE(subscription_id uuid, customer_id uuid, customer_name text, plan_name text, lifecycle text, price_cents integer, preferred_day text, created_at timestamptz)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.id, s.customer_id, coalesce(p.display_name,'Customer'), pl.name, s.lifecycle::text, pl.price_cents, s.preferred_day, s.created_at
  from subscriptions s
  join kitchens k on k.id = s.kitchen_id and k.owner_id = auth.uid() and k.verification_status = 'verified'
  join plans pl on pl.id = s.plan_id
  join profiles p on p.id = s.customer_id
  where s.lifecycle not in ('cancelled','completed','draft')
  order by s.created_at desc;
$function$;
revoke execute on function public.cook_subscribers() from public, anon;
grant execute on function public.cook_subscribers() to authenticated;
