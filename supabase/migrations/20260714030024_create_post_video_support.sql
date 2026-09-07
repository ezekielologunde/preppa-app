
create or replace function public.create_post(p_cover_url text, p_caption text DEFAULT NULL::text, p_tag text DEFAULT NULL::text, p_meal_id uuid DEFAULT NULL::uuid, p_video_url text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_kitchen uuid;
  v_post uuid;
begin
  if v_uid is null then raise exception 'must be signed in'; end if;
  if length(coalesce(p_cover_url, '')) < 4 then raise exception 'a photo is required'; end if;

  select id into v_kitchen from kitchens
  where owner_id = v_uid and verification_status = 'verified'
  order by created_at desc limit 1;
  if v_kitchen is null then raise exception 'no approved kitchen for this account'; end if;

  -- meal (if featured) must belong to this kitchen
  if p_meal_id is not null and not exists (select 1 from meals m where m.id = p_meal_id and m.kitchen_id = v_kitchen) then
    raise exception 'that dish is not on your menu';
  end if;

  insert into posts (kitchen_id, caption, tag, meal_id, cover_url, video_url, media_type, status)
  values (v_kitchen, nullif(p_caption, ''), nullif(p_tag, ''), p_meal_id, p_cover_url, nullif(p_video_url, ''),
          case when p_video_url is not null and length(p_video_url) > 0 then 'video' else 'photo' end, 'published')
  returning id into v_post;

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (v_uid, 'post_created', 'post', v_post, jsonb_build_object('kitchen', v_kitchen));

  return v_post;
end $function$;
