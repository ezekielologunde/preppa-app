-- Waitlist capture for the preppa.live landing page. Anon can INSERT their own
-- email+zip (join the list) but cannot read/update/delete anything (privacy: no
-- one can enumerate other people's emails). Admin reads via service role.
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  zip text,
  source text default 'landing',
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;

-- anon may insert only email/zip/source (not id/created_at); no SELECT policy => reads denied
revoke all on public.waitlist from anon, authenticated;
grant insert (email, zip, source) on public.waitlist to anon, authenticated;

drop policy if exists waitlist_insert_anyone on public.waitlist;
create policy waitlist_insert_anyone on public.waitlist
  for insert to anon, authenticated
  with check (char_length(email::text) between 3 and 320);

comment on table public.waitlist is 'Landing-page waitlist signups (anon insert-only; unique email gives 409 on dupes).';
