-- Sprint 27 · Slice 2 — kitchen follows.
-- Additive + reversible. Mirrors the toggle_post_like / toggle_post_save idempotent-RPC pattern.

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  kitchen_id  uuid not null references public.kitchens(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, kitchen_id)
);
create index if not exists follows_follower_idx on public.follows (follower_id, created_at desc);
create index if not exists follows_kitchen_idx  on public.follows (kitchen_id);

alter table public.follows enable row level security;

-- Clients may read only their own follows (to hydrate follow-state + the Following filter).
-- Writes flow ONLY through the SECURITY DEFINER RPC below.
drop policy if exists follows_own on public.follows;
create policy follows_own on public.follows
  for select to authenticated using (follower_id = auth.uid());

grant select on public.follows to authenticated;

create or replace function public.toggle_follow(p_kitchen uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_deleted int;
begin
  if v_uid is null then raise exception 'must be signed in'; end if;
  if not exists (select 1 from kitchens k where k.id = p_kitchen and k.verification_status = 'verified') then
    raise exception 'kitchen not found';
  end if;

  delete from follows where kitchen_id = p_kitchen and follower_id = v_uid;
  get diagnostics v_deleted = row_count;
  if v_deleted > 0 then
    return false;
  else
    insert into follows (follower_id, kitchen_id) values (v_uid, p_kitchen) on conflict do nothing;
    return true;
  end if;
end $$;

revoke all on function public.toggle_follow(uuid) from public, anon;
grant execute on function public.toggle_follow(uuid) to authenticated;
