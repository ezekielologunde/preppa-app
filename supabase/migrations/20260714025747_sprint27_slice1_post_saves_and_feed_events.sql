-- Sprint 27 · Slice 1
-- Additive + reversible. Mirrors the confirmed-real post_likes / toggle_post_like pattern.
-- (1) Persisted post saves. (2) Lightweight feed funnel analytics.

-- ── (1) post_saves ─────────────────────────────────────────────────────────
create table if not exists public.post_saves (
  post_id    uuid not null references public.posts(id)    on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists post_saves_user_idx on public.post_saves (user_id, created_at desc);

alter table public.post_saves enable row level security;

-- Clients may read only their own saves (to hydrate saved-state). Writes flow ONLY
-- through the SECURITY DEFINER RPC below — there is deliberately no INSERT/DELETE policy.
drop policy if exists post_saves_own on public.post_saves;
create policy post_saves_own on public.post_saves
  for select to authenticated using (user_id = auth.uid());

grant select on public.post_saves to authenticated;

create or replace function public.toggle_post_save(p_post uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_deleted int;
begin
  if v_uid is null then raise exception 'must be signed in'; end if;
  if not exists (select 1 from posts p where p.id = p_post and p.status = 'published') then
    raise exception 'post not found';
  end if;

  delete from post_saves where post_id = p_post and user_id = v_uid;
  get diagnostics v_deleted = row_count;
  if v_deleted > 0 then
    return false;
  else
    insert into post_saves (post_id, user_id) values (p_post, v_uid) on conflict do nothing;
    return true;
  end if;
end $$;

revoke all on function public.toggle_post_save(uuid) from public, anon;
grant execute on function public.toggle_post_save(uuid) to authenticated;

-- ── (2) feed_events (funnel analytics; append-only) ─────────────────────────
create table if not exists public.feed_events (
  id         bigint generated always as identity primary key,
  post_id    uuid references public.posts(id)    on delete set null,
  user_id    uuid references public.profiles(id) on delete set null,
  kind       text not null check (kind in ('impression','card_tap','save','share','open_store','open_meal')),
  created_at timestamptz not null default now()
);
create index if not exists feed_events_post_idx on public.feed_events (post_id, created_at desc);

alter table public.feed_events enable row level security;

-- No client read/write policies: writes go through the definer RPC; reads are admin-only.
drop policy if exists feed_events_admin_read on public.feed_events;
create policy feed_events_admin_read on public.feed_events
  for select to authenticated using (is_admin());

create or replace function public.record_feed_event(p_post uuid, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if p_kind not in ('impression','card_tap','save','share','open_store','open_meal') then return; end if;
  insert into feed_events (post_id, user_id, kind) values (p_post, v_uid, p_kind);
exception when others then
  null; -- analytics must never break the feed
end $$;

revoke all on function public.record_feed_event(uuid, text) from public, anon;
grant execute on function public.record_feed_event(uuid, text) to authenticated;
