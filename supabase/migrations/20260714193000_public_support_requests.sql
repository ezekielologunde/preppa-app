-- Public (unauthenticated) support / safety / abuse intake from the marketing site.
-- Distinct from the authenticated in-app `tickets` table (which requires reporter_id + order_id).
-- Mirrors the `waitlist` anon-insert pattern: anon may INSERT with validation, only admins may SELECT.

create sequence if not exists public.public_support_ref_seq start 10000;

create table if not exists public.public_support_requests (
  id uuid primary key default gen_random_uuid(),
  ref text unique,
  report_type text not null default 'support' check (report_type in ('support','safety','abuse')),
  name text,
  email text not null,
  role text,
  category text,
  subject text,
  description text not null,
  related_ref text,
  immediate_risk boolean not null default false,
  status text not null default 'submitted' check (status in ('submitted','acknowledged','investigating','resolved','closed')),
  created_at timestamptz not null default now()
);

create index if not exists public_support_requests_created_idx on public.public_support_requests (created_at desc);
create index if not exists public_support_requests_type_idx on public.public_support_requests (report_type, status);

-- Server-side fallback ref (prefix by type) if the client didn't supply one.
create or replace function public.set_public_support_ref() returns trigger
language plpgsql as $$
declare p text;
begin
  if new.ref is null then
    p := case new.report_type when 'safety' then 'S' when 'abuse' then 'A' else 'P' end;
    new.ref := p || '-' || nextval('public.public_support_ref_seq')::text;
  end if;
  return new;
end $$;

drop trigger if exists trg_public_support_ref on public.public_support_requests;
create trigger trg_public_support_ref before insert on public.public_support_requests
  for each row execute function public.set_public_support_ref();

alter table public.public_support_requests enable row level security;

drop policy if exists public_support_insert_anyone on public.public_support_requests;
create policy public_support_insert_anyone on public.public_support_requests
  for insert to anon, authenticated
  with check (
    char_length(email) between 3 and 320
    and char_length(description) between 10 and 8000
    and (subject is null or char_length(subject) <= 300)
    and (name is null or char_length(name) <= 200)
    and report_type in ('support','safety','abuse')
  );

drop policy if exists public_support_admin_read on public.public_support_requests;
create policy public_support_admin_read on public.public_support_requests
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
