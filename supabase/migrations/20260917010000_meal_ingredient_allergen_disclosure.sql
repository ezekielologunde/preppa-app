-- Public-launch food safety: every newly published meal must disclose ingredients and
-- explicitly acknowledge its allergen review. Existing historical rows remain readable
-- and display a "not provided" warning until their owners update them.
alter table public.meals
  add column if not exists ingredients text not null default '',
  add column if not exists allergens text[] not null default '{}',
  add column if not exists allergen_reviewed_at timestamptz;

drop function if exists public.create_meal(text, text, integer, integer, text[], text);

create function public.create_meal(
  p_name text,
  p_description text default null,
  p_price_cents integer default 0,
  p_serves integer default 1,
  p_tags text[] default null,
  p_grad text default 'g1',
  p_ingredients text default null,
  p_allergens text[] default '{}',
  p_allergen_reviewed boolean default false
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_kitchen uuid;
  v_slug text;
  v_meal uuid;
begin
  if v_uid is null then raise exception 'must be signed in'; end if;
  if length(coalesce(btrim(p_name), '')) < 2 then raise exception 'dish name is too short'; end if;
  if coalesce(p_price_cents, 0) <= 0 then raise exception 'price must be greater than zero'; end if;
  if length(coalesce(btrim(p_ingredients), '')) < 3 then raise exception 'list the meal ingredients'; end if;
  if not coalesce(p_allergen_reviewed, false) then raise exception 'confirm the allergen review'; end if;

  select id into v_kitchen
  from kitchens
  where owner_id = v_uid and verification_status = 'verified'
  order by created_at desc
  limit 1;
  if v_kitchen is null then raise exception 'no approved kitchen for this account'; end if;

  v_slug := lower(regexp_replace(p_name, '[^a-zA-Z0-9]+', '-', 'g'))
            || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into meals (
    kitchen_id, name, description, price_cents, serves, tags, grad, slug, status,
    review_count, ingredients, allergens, allergen_reviewed_at
  ) values (
    v_kitchen, btrim(p_name), nullif(btrim(p_description), ''), p_price_cents,
    greatest(1, coalesce(p_serves, 1)), p_tags, coalesce(nullif(p_grad, ''), 'g1'),
    v_slug, (case when public.kitchen_payouts_enabled(v_kitchen) then 'live' else 'paused' end)::meal_status,
    0, btrim(p_ingredients), coalesce(p_allergens, '{}'), now()
  ) returning id into v_meal;

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (v_uid, 'meal_created', 'meal', v_meal,
    jsonb_build_object('name', p_name, 'kitchen', v_kitchen, 'allergen_reviewed', true));

  return v_meal;
end
$function$;

revoke all on function public.create_meal(text,text,integer,integer,text[],text,text,text[],boolean) from public, anon;
grant execute on function public.create_meal(text,text,integer,integer,text[],text,text,text[],boolean) to authenticated, service_role;
