-- Real delivery/pickup capability per kitchen, so the Home fulfillment toggle can actually
-- filter listings instead of only affecting checkout fees. Defaults match today's implicit
-- behavior (every kitchen effectively supports both) so nothing existing silently disappears.
alter table kitchens
  add column supports_delivery boolean not null default true,
  add column supports_pickup boolean not null default true;

create or replace function public.set_kitchen_fulfillment(p_kitchen_id uuid, p_delivery boolean, p_pickup boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner uuid;
begin
  if not p_delivery and not p_pickup then
    raise exception 'a kitchen must support at least one fulfillment method' using errcode = '22023';
  end if;

  select owner_id into v_owner from kitchens where id = p_kitchen_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not your kitchen' using errcode = '42501';
  end if;

  update kitchens
     set supports_delivery = p_delivery,
         supports_pickup = p_pickup
   where id = p_kitchen_id;

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (auth.uid(), 'kitchen_fulfillment_set', 'kitchen', p_kitchen_id, jsonb_build_object('delivery', p_delivery, 'pickup', p_pickup));
end;
$function$;

revoke all on function public.set_kitchen_fulfillment(uuid, boolean, boolean) from public;
grant execute on function public.set_kitchen_fulfillment(uuid, boolean, boolean) to authenticated;
