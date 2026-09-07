-- Weekly meal-plan offerings + real recurring subscriptions.
-- Plans are backed by real meals so each weekly invoice can generate a real order.

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  name text not null,
  description text,
  price_cents integer not null check (price_cents >= 0),  -- cook's weekly price (before 10% service fee)
  interval text not null default 'week',
  fulfillment public.fulfillment not null default 'delivery',
  goal text,
  stripe_price_id text,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists plans_kitchen_idx on public.plans (kitchen_id);

create table if not exists public.plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  meal_id uuid not null references public.meals(id) on delete restrict,
  qty smallint not null default 1 check (qty >= 1)
);
create index if not exists plan_items_plan_idx on public.plan_items (plan_id);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete restrict,
  stripe_subscription_id text unique,
  stripe_price_id text,
  status text not null default 'incomplete' check (status in ('active','paused','canceled','past_due','incomplete')),
  preferred_day text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_customer_idx on public.subscriptions (customer_id);
create index if not exists subscriptions_kitchen_idx on public.subscriptions (kitchen_id);

create trigger plans_updated_at before update on public.plans for each row execute function public.set_updated_at();
create trigger subscriptions_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();

-- RLS
alter table public.plans enable row level security;
alter table public.plan_items enable row level security;
alter table public.subscriptions enable row level security;

-- plans: anyone reads active plans; kitchen owner reads/manages theirs
create policy plans_read_active on public.plans for select
  using (status = 'active' or kitchen_id in (select id from public.kitchens where owner_id = auth.uid()));
create policy plans_owner_write on public.plans for all
  using (kitchen_id in (select id from public.kitchens where owner_id = auth.uid()))
  with check (kitchen_id in (select id from public.kitchens where owner_id = auth.uid()));

create policy plan_items_read on public.plan_items for select using (
  plan_id in (select id from public.plans where status = 'active'
              or kitchen_id in (select id from public.kitchens where owner_id = auth.uid())));
create policy plan_items_owner_write on public.plan_items for all
  using (plan_id in (select p.id from public.plans p join public.kitchens k on k.id = p.kitchen_id where k.owner_id = auth.uid()))
  with check (plan_id in (select p.id from public.plans p join public.kitchens k on k.id = p.kitchen_id where k.owner_id = auth.uid()));

-- subscriptions: customer sees own; cook sees their kitchen's. No write policies →
-- only service-role edge fns mutate (status is server-authoritative from Stripe).
create policy subs_customer_read on public.subscriptions for select using (customer_id = auth.uid());
create policy subs_cook_read on public.subscriptions for select using (kitchen_id in (select id from public.kitchens where owner_id = auth.uid()));

-- Explicit grants (new tables don't inherit them). Reads only for client roles.
grant select on public.plans to anon, authenticated;
grant select on public.plan_items to anon, authenticated;
grant select on public.subscriptions to authenticated;
