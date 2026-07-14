-- Fixes audit Critical #5: create_post accepted arbitrary externally-hosted cover_url/
-- video_url with no domain allowlist, and post-videos storage objects were overwritable
-- in place after publish (bait-and-switch on already-moderated/visible media).
--
-- APPLIED LIVE to project fwidhpzwldneeaphrxgg on 2026-07-14 (via Supabase MCP
-- apply_migration, same name). This file is the vendored source-control copy.

create or replace function public.is_allowed_media_url(p_url text)
returns boolean
language sql
immutable
as $body$
  select p_url is not null and (
    p_url like 'https://fwidhpzwldneeaphrxgg.supabase.co/storage/v1/object/public/meal-photos/%'
    or p_url like 'https://fwidhpzwldneeaphrxgg.supabase.co/storage/v1/object/public/post-videos/%'
    or p_url like 'https://fwidhpzwldneeaphrxgg.supabase.co/storage/v1/object/public/avatars/%'
    or p_url like 'https://image.mux.com/%'
    or p_url like 'https://stream.mux.com/%'
  );
$body$;

-- Drop the pre-video 4-arg overload entirely: it's superseded by the 5-arg version below
-- (video_url defaults to null) and, left in place, would let a client bypass the new
-- domain check by calling the old signature directly.
drop function if exists public.create_post(text, text, text, uuid);

create or replace function public.create_post(
  p_cover_url text, p_caption text default null::text, p_tag text default null::text,
  p_meal_id uuid default null::uuid, p_video_url text default null::text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $body2$
declare
  v_uid uuid := auth.uid();
  v_kitchen uuid;
  v_post uuid;
begin
  if v_uid is null then raise exception 'must be signed in'; end if;
  if length(coalesce(p_cover_url, '')) < 4 then raise exception 'a photo is required'; end if;
  if not public.is_allowed_media_url(p_cover_url) then raise exception 'cover image must be uploaded to Preppa'; end if;
  if p_video_url is not null and length(p_video_url) > 0 and not public.is_allowed_media_url(p_video_url) then
    raise exception 'video must be uploaded to Preppa';
  end if;

  select id into v_kitchen from kitchens
  where owner_id = v_uid and verification_status = 'verified'
  order by created_at desc limit 1;
  if v_kitchen is null then raise exception 'no approved kitchen for this account'; end if;

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
end;
$body2$;

-- Storage objects must be write-once after upload: remove the owner UPDATE policy on
-- post-videos so an already-published post's media can never be silently swapped in
-- place. New content requires a new object path (new post or explicit delete+reupload).
drop policy if exists post_videos_update_owner on storage.objects;
