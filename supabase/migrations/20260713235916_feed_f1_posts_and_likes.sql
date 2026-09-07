-- Feed F1: real DB-backed creator posts (photo-first; video_url reserved for the next slice).
-- Preppers post; everyone browses + likes. Replaces the in-memory FEED/reels mock.

create table if not exists public.posts (
  id           uuid primary key default gen_random_uuid(),
  kitchen_id   uuid not null references public.kitchens(id) on delete cascade,
  caption      text,
  tag          text,
  meal_id      uuid references public.meals(id) on delete set null,
  cover_url    text not null,
  media_type   text not null default 'photo' check (media_type in ('photo','video')),
  video_url    text,
  like_count   int  not null default 0,
  status       text not null default 'published' check (status in ('published','removed')),
  created_at   timestamptz not null default now()
);
create index if not exists posts_feed_idx on public.posts (created_at desc) where status = 'published';
create index if not exists posts_kitchen_idx on public.posts (kitchen_id);

create table if not exists public.post_likes (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.posts enable row level security;
alter table public.post_likes enable row level security;

-- Public read: published posts from a verified kitchen. PURE SQL (no is_admin()/is_kitchen_owner()
-- in an anon-facing policy — the E1 lesson).
drop policy if exists posts_public_read on public.posts;
create policy posts_public_read on public.posts
  for select to anon, authenticated
  using (status = 'published' and exists (
    select 1 from public.kitchens k where k.id = posts.kitchen_id and k.verification_status = 'verified'
  ));

-- Owner read: a prepper sees their own kitchen's posts in any status (authenticated only).
drop policy if exists posts_owner_read on public.posts;
create policy posts_owner_read on public.posts
  for select to authenticated
  using (exists (select 1 from public.kitchens k where k.id = posts.kitchen_id and k.owner_id = auth.uid()));

-- Likes: read/insert/delete your own only (like_count is maintained by the RPC).
drop policy if exists post_likes_own on public.post_likes;
create policy post_likes_own on public.post_likes
  for select to authenticated using (user_id = auth.uid());

grant select on public.posts to anon, authenticated;
grant select on public.post_likes to authenticated;

-- Publish a post from the caller's verified kitchen (mirrors create_meal). Writes are RPC-only.
create or replace function public.create_post(p_cover_url text, p_caption text default null, p_tag text default null, p_meal_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
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

  insert into posts (kitchen_id, caption, tag, meal_id, cover_url, media_type, status)
  values (v_kitchen, nullif(p_caption, ''), nullif(p_tag, ''), p_meal_id, p_cover_url, 'photo', 'published')
  returning id into v_post;

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (v_uid, 'post_created', 'post', v_post, jsonb_build_object('kitchen', v_kitchen));

  return v_post;
end $$;

-- Like/unlike a post; maintains like_count atomically. Returns the new liked state.
create or replace function public.toggle_post_like(p_post uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_deleted int;
begin
  if v_uid is null then raise exception 'must be signed in'; end if;
  if not exists (select 1 from posts p where p.id = p_post and p.status = 'published') then
    raise exception 'post not found';
  end if;

  delete from post_likes where post_id = p_post and user_id = v_uid;
  get diagnostics v_deleted = row_count;
  if v_deleted > 0 then
    update posts set like_count = greatest(0, like_count - 1) where id = p_post;
    return false;
  else
    insert into post_likes (post_id, user_id) values (p_post, v_uid) on conflict do nothing;
    update posts set like_count = like_count + 1 where id = p_post;
    return true;
  end if;
end $$;

grant execute on function public.create_post(text, text, text, uuid) to authenticated, service_role;
grant execute on function public.toggle_post_like(uuid) to authenticated, service_role;
