
-- Real meal creation for approved preppers. Resolves the caller's own VERIFIED
-- kitchen from auth.uid() (client can't forge a kitchen_id), auto-slugs, and
-- inserts a live meal. SECURITY DEFINER so it can insert regardless of table RLS,
-- but it only ever writes to the caller's own kitchen.
create or replace function public.create_meal(
  p_name text,
  p_description text default null,
  p_price_cents integer default 0,
  p_serves integer default 1,
  p_tags text[] default null,
  p_grad text default 'g1'
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_kitchen uuid;
  v_slug text;
  v_meal uuid;
begin
  if v_uid is null then raise exception 'must be signed in'; end if;
  if length(coalesce(p_name, '')) < 2 then raise exception 'dish name is too short'; end if;
  if coalesce(p_price_cents, 0) <= 0 then raise exception 'price must be greater than zero'; end if;

  select id into v_kitchen
  from kitchens
  where owner_id = v_uid and verification_status = 'verified'
  order by created_at desc
  limit 1;
  if v_kitchen is null then raise exception 'no approved kitchen for this account'; end if;

  v_slug := lower(regexp_replace(p_name, '[^a-zA-Z0-9]+', '-', 'g'))
            || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into meals (kitchen_id, name, description, price_cents, serves, tags, grad, slug, status, review_count)
  values (v_kitchen, p_name, nullif(p_description, ''), p_price_cents, greatest(1, coalesce(p_serves, 1)),
          p_tags, coalesce(nullif(p_grad, ''), 'g1'), v_slug, 'live', 0)
  returning id into v_meal;

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (v_uid, 'meal_created', 'meal', v_meal, jsonb_build_object('name', p_name, 'kitchen', v_kitchen));

  return v_meal;
end $$;

revoke execute on function public.create_meal(text,text,integer,integer,text[],text) from public, anon;
grant execute on function public.create_meal(text,text,integer,integer,text[],text) to authenticated;
