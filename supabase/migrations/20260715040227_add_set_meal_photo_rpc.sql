-- Owner-gated setter for a meal's photo. The meals.image_url column, the meal-photos
-- storage bucket + write policies, and the catalog SELECT already exist live; this only
-- adds the missing "write the URL back onto the meal" path so preppers can attach/change
-- a photo from the app. Mirrors update_meal/create_meal conventions.
create or replace function public.set_meal_photo(p_meal_id uuid, p_image_url text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_kitchen uuid;
begin
  if v_uid is null then raise exception 'must be signed in'; end if;
  if p_image_url is not null and not public.is_allowed_media_url(p_image_url) then
    raise exception 'photo url not allowed';
  end if;
  select kitchen_id into v_kitchen from public.meals where id = p_meal_id;
  if v_kitchen is null then raise exception 'meal not found'; end if;
  if not public.is_active_kitchen_owner(v_kitchen) then
    raise exception 'not your kitchen';
  end if;
  update public.meals set image_url = p_image_url, updated_at = now() where id = p_meal_id;
  insert into public.audit_log (actor_id, action, entity, entity_id, meta)
  values (v_uid, 'meal_photo_set', 'meal', p_meal_id, jsonb_build_object('image_url', p_image_url));
end
$function$;

revoke all on function public.set_meal_photo(uuid, text) from public, anon;
grant execute on function public.set_meal_photo(uuid, text) to authenticated;
