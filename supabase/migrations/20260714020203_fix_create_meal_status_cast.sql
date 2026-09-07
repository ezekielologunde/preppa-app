
create or replace function public.create_meal(p_name text, p_description text DEFAULT NULL::text, p_price_cents integer DEFAULT 0, p_serves integer DEFAULT 1, p_tags text[] DEFAULT NULL::text[], p_grad text DEFAULT 'g1'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_kitchen uuid;
  v_payouts_enabled boolean;
  v_slug text;
  v_meal uuid;
begin
  if v_uid is null then raise exception 'must be signed in'; end if;
  if length(coalesce(p_name, '')) < 2 then raise exception 'dish name is too short'; end if;
  if coalesce(p_price_cents, 0) <= 0 then raise exception 'price must be greater than zero'; end if;

  select id, payouts_enabled into v_kitchen, v_payouts_enabled
  from kitchens
  where owner_id = v_uid and verification_status = 'verified'
  order by created_at desc
  limit 1;
  if v_kitchen is null then raise exception 'no approved kitchen for this account'; end if;

  v_slug := lower(regexp_replace(p_name, '[^a-zA-Z0-9]+', '-', 'g'))
            || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into meals (kitchen_id, name, description, price_cents, serves, tags, grad, slug, status, review_count)
  values (v_kitchen, p_name, nullif(p_description, ''), p_price_cents, greatest(1, coalesce(p_serves, 1)),
          p_tags, coalesce(nullif(p_grad, ''), 'g1'), v_slug,
          (case when coalesce(v_payouts_enabled, false) then 'live' else 'paused' end)::meal_status, 0)
  returning id into v_meal;

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (v_uid, 'meal_created', 'meal', v_meal, jsonb_build_object('name', p_name, 'kitchen', v_kitchen));

  return v_meal;
end $function$;
