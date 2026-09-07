-- "Preppa Pro" — cook-side membership, mirroring the existing customer PrepPlus pattern
-- (memberships / is_prepplus_member / sync_prepplus_membership) but keyed on kitchen_id
-- rather than customer_id, since every cook-money construct in this schema (ledger_entries,
-- is_kitchen_owner, stripe_accounts, ...) is already kitchen-scoped, not user-scoped.
-- $9.99/mo or $89/yr, 7-day trial — same price points as PrepPlus, same Stripe pattern.

create table public.cook_memberships (
  kitchen_id uuid primary key references public.kitchens(id) on delete cascade,
  stripe_subscription_id text,
  stripe_price_id text,
  plan_interval text,
  status text not null default 'incomplete',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_consumed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.cook_memberships enable row level security;
create policy cook_memberships_select_own on public.cook_memberships
  for select to authenticated
  using (is_kitchen_owner(kitchen_id));
-- writes: service-role only (edge functions), matching memberships_select_own's convention.

create or replace function public.is_cook_pro_member(kid uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.cook_memberships m
    where m.kitchen_id = kid
      and (
        (m.status in ('active','trialing') and (m.current_period_end is null or m.current_period_end > now()))
        or (m.status = 'past_due' and m.updated_at > now() - interval '3 days')
      )
  );
$function$;

-- Mirror of sync_prepplus_membership, keyed on metadata.kitchen_id + metadata.kind='cook_pro'
-- instead of customer_uid. Reconciles Stripe-side subscription changes (renewals, cancellations,
-- dunning) same as the order-settlement mirror trigger does for payments.
create or replace function public.sync_cook_pro_membership()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_kid uuid;
  v_interval text;
  v_price text;
begin
  if coalesce(new.metadata->>'kind','') <> 'cook_pro' then
    return new;
  end if;
  v_kid := nullif(new.metadata->>'kitchen_id','')::uuid;
  if v_kid is null then return new; end if;

  v_price    := new.items->'data'->0->'price'->>'id';
  v_interval := new.items->'data'->0->'price'->'recurring'->>'interval';

  insert into public.cook_memberships as m (
    kitchen_id, stripe_subscription_id, stripe_price_id, plan_interval, status,
    current_period_end, cancel_at_period_end, updated_at
  ) values (
    v_kid, new.id, v_price, v_interval, new.status,
    case when new.current_period_end is not null then to_timestamp(new.current_period_end) else null end,
    coalesce(new.cancel_at_period_end, false), now()
  )
  on conflict (kitchen_id) do update set
    stripe_subscription_id = excluded.stripe_subscription_id,
    stripe_price_id        = coalesce(excluded.stripe_price_id, m.stripe_price_id),
    plan_interval           = coalesce(excluded.plan_interval, m.plan_interval),
    status                  = excluded.status,
    current_period_end     = excluded.current_period_end,
    cancel_at_period_end   = excluded.cancel_at_period_end,
    updated_at              = now()
  where m.stripe_subscription_id = excluded.stripe_subscription_id;

  update public.kitchens set is_pro = public.is_cook_pro_member(v_kid) where id = v_kid;
  return new;
exception when others then
  return new; -- never break Stripe sync
end $function$;

-- stripe.subscriptions is provided by the hosted project's Stripe Sync Engine
-- wrapper (a Supabase add-on enabled via the dashboard), which does not exist on
-- a fresh local/self-hosted stack -- guard so this migration replays cleanly there.
do $$
begin
  if to_regclass('stripe.subscriptions') is not null then
    create trigger sync_cook_pro_membership_trg
      after insert or update on stripe.subscriptions
      for each row execute function public.sync_cook_pro_membership();
  end if;
end $$;

-- Denormalized flag for cheap discovery-sort/badge reads (client already joins `kitchens(...)`
-- on every meal query — adding one boolean column there is far cheaper than a per-row
-- membership-table join or a SECURITY DEFINER function call per catalog item).
alter table public.kitchens add column if not exists is_pro boolean not null default false;

-- Also keep it in sync when a membership is written synchronously by the edge functions
-- (subscribe/manage) rather than only via the async Stripe mirror above.
create or replace function public.refresh_kitchen_is_pro()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.kitchens set is_pro = public.is_cook_pro_member(coalesce(new.kitchen_id, old.kitchen_id))
  where id = coalesce(new.kitchen_id, old.kitchen_id);
  return coalesce(new, old);
end $function$;

create trigger cook_memberships_refresh_is_pro_trg
  after insert or update or delete on public.cook_memberships
  for each row execute function public.refresh_kitchen_is_pro();

revoke all on function public.is_cook_pro_member(uuid) from public;
grant execute on function public.is_cook_pro_member(uuid) to authenticated, service_role;
