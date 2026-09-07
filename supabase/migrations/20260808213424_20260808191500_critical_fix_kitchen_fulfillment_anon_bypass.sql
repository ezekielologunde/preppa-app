-- CRITICAL: set_kitchen_fulfillment used `v_owner <> auth.uid()` which is NULL (not TRUE) for
-- an unauthenticated caller (auth.uid() is NULL), so the ownership check silently no-op'd and
-- let anon callers overwrite ANY kitchen's delivery/pickup flags. Fix: NULL-safe comparison,
-- and revoke the anon grant entirely (write RPC has no business being anon-callable).

CREATE OR REPLACE FUNCTION public.set_kitchen_fulfillment(p_kitchen_id uuid, p_delivery boolean, p_pickup boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
begin
  if not p_delivery and not p_pickup then
    raise exception 'a kitchen must support at least one fulfillment method' using errcode = '22023';
  end if;

  select owner_id into v_owner from kitchens where id = p_kitchen_id;
  if v_owner is null or v_owner is distinct from auth.uid() then
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

REVOKE EXECUTE ON FUNCTION public.set_kitchen_fulfillment(uuid, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_kitchen_fulfillment(uuid, boolean, boolean) TO authenticated;
