-- PrepPlus P1: per-user membership + server-authoritative entitlement predicate.
-- Membership lives in its OWN table (not on profiles) so a user can never self-grant it
-- (profiles_update_self lets users write their own profile row; memberships is default-deny).

create table if not exists public.memberships (
  customer_id            uuid primary key references public.profiles(id) on delete cascade,
  stripe_subscription_id text unique,
  stripe_price_id        text,
  plan_interval          text check (plan_interval in ('month','year')),
  status                 text not null default 'incomplete'
                           check (status in ('active','trialing','past_due','canceled','unpaid','incomplete','paused')),
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  trial_consumed         boolean not null default false,  -- sticky: row persists on reactivate, never reset
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

alter table public.memberships enable row level security;

-- Read your own membership row only. NO insert/update/delete policy => default-deny for
-- anon/authenticated; only service-role (edge fns) and the SECURITY DEFINER mirror trigger write.
drop policy if exists memberships_select_own on public.memberships;
create policy memberships_select_own on public.memberships
  for select to authenticated
  using (customer_id = auth.uid());

grant select on public.memberships to authenticated;

-- Entitlement predicate. Server-authoritative: computed from memberships (service-writable only),
-- so a forged client flag can never waive a fee. Trialing counts as a member; a bounded 3-day
-- grace on past_due keeps perks alive through Stripe's off-session retry/dunning window.
create or replace function public.is_prepplus_member(uid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.memberships m
    where m.customer_id = uid
      and (
        (m.status in ('active','trialing') and (m.current_period_end is null or m.current_period_end > now()))
        or (m.status = 'past_due' and m.updated_at > now() - interval '3 days')
      )
  );
$$;

grant execute on function public.is_prepplus_member(uuid) to anon, authenticated, service_role;

comment on table public.memberships is 'PrepPlus paid membership (Stripe-native recurring). One row per customer; service-role/mirror-trigger writes only.';
comment on function public.is_prepplus_member(uuid) is 'Server-authoritative PrepPlus entitlement: active/trialing (unexpired) or past_due within a 3-day grace.';
