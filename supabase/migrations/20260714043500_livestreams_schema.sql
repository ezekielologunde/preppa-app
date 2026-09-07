
create table public.livestreams (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  mux_stream_id text not null unique,
  mux_playback_id text not null,
  status text not null default 'idle' check (status in ('idle','live','ended')),
  title text,
  cover_url text,
  vod_post_id uuid references public.posts(id),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create index livestreams_kitchen_idx on public.livestreams(kitchen_id);
create index livestreams_live_idx on public.livestreams(status) where status = 'live';

alter table public.livestreams enable row level security;

-- Anyone can see a stream once it's left 'idle' (live or ended/VOD); the owning kitchen can
-- always see its own (e.g. to resume/check a pending 'idle' stream it just created).
create policy livestreams_select_public on public.livestreams for select
  using (status <> 'idle' or public.is_kitchen_owner(kitchen_id));

-- The Mux stream key never has a client-readable policy at all — only the service-role
-- client (inside edge functions) can read it. Mirrors the cook-docs/kyc-docs private pattern.
create table public.livestream_secrets (
  livestream_id uuid primary key references public.livestreams(id) on delete cascade,
  stream_key text not null
);
alter table public.livestream_secrets enable row level security;
