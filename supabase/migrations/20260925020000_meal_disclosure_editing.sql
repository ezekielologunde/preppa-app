-- Let cooks add/update the ingredient + allergen disclosure on existing meals (historical rows
-- have none), and expose it through my_meals(). Also stop update_meal() from wiping the
-- description when a caller omits it (the Edit dish sheet only sends name + price).
drop function if exists public.my_meals();

create function public.my_meals()
returns table(
  id uuid, name text, description text, price_cents integer, serves integer, tags text[],
  grad text, slug text, status text, created_at timestamptz,
  ingredients text, allergens text[], allergen_reviewed_at timestamptz
)
language sql stable security definer set search_path to 'public'
as $$
  select m.id, m.name, m.description, m.price_cents, m.serves, m.tags, m.grad, m.slug,
         m.status::text, m.created_at, m.ingredients, m.allergens, m.allergen_reviewed_at
  from meals m
  join kitchens k on k.id = m.kitchen_id
  where k.owner_id = auth.uid()
  order by m.created_at desc;
$$;
revoke all on function public.my_meals() from public, anon;
grant execute on function public.my_meals() to authenticated, service_role;

create or replace function public.update_meal(
  p_meal_id uuid, p_name text, p_description text default null, p_price_cents integer default null,
  p_serves integer default null, p_tags text[] default null, p_grad text default null
) returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_kitchen uuid;
  v_status meal_status;
begin
  select kitchen_id, status into v_kitchen, v_status from meals where id = p_meal_id;
  if v_kitchen is null then raise exception 'meal not found'; end if;
  if not public.is_active_kitchen_owner(v_kitchen) then raise exception 'not your meal'; end if;
  if v_status = 'archived' then raise exception 'this dish is archived — unarchive it first'; end if;
  if length(coalesce(p_name, '')) < 2 then raise exception 'dish name is too short'; end if;
  if p_price_cents is not null and p_price_cents <= 0 then raise exception 'price must be greater than zero'; end if;

  update meals set
    name = p_name,
    description = case when p_description is null then description else nullif(p_description, '') end,
    price_cents = coalesce(p_price_cents, price_cents),
    serves = greatest(1, coalesce(p_serves, serves)),
    tags = coalesce(p_tags, tags),
    grad = coalesce(nullif(p_grad, ''), grad)
  where id = p_meal_id;

  insert into audit_log (actor_id, action, entity, entity_id)
  values (auth.uid(), 'meal_updated', 'meal', p_meal_id);
end;
$function$;

create function public.set_meal_disclosure(
  p_meal_id uuid, p_ingredients text, p_allergens text[], p_allergen_reviewed boolean
) returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_kitchen uuid;
begin
  select kitchen_id into v_kitchen from meals where id = p_meal_id;
  if v_kitchen is null then raise exception 'meal not found'; end if;
  if not public.is_active_kitchen_owner(v_kitchen) then raise exception 'not your meal'; end if;
  if length(coalesce(btrim(p_ingredients), '')) < 3 then raise exception 'list the meal ingredients'; end if;
  if not coalesce(p_allergen_reviewed, false) then raise exception 'confirm the allergen review'; end if;

  update meals set
    ingredients = btrim(p_ingredients),
    allergens = coalesce(p_allergens, '{}'),
    allergen_reviewed_at = now()
  where id = p_meal_id;

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (auth.uid(), 'meal_disclosure_updated', 'meal', p_meal_id,
          jsonb_build_object('allergens', coalesce(p_allergens, '{}')));
end;
$function$;
revoke all on function public.set_meal_disclosure(uuid,text,text[],boolean) from public, anon;
grant execute on function public.set_meal_disclosure(uuid,text,text[],boolean) to authenticated, service_role;
