-- Phase A m5: minimal capacity. delivery_day='' is the all-days cap; a specific
-- lowercased day name (e.g. 'tuesday') overrides it. Reservations count across
-- subscriptions + one-off orders + bookings so no channel oversells the kitchen.
create table if not exists kitchen_capacity (
  kitchen_id uuid not null references kitchens(id) on delete cascade,
  delivery_day text not null default '',
  max_portions_per_day int not null check (max_portions_per_day >= 0),
  enrollment_open boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (kitchen_id, delivery_day)
);

create table if not exists capacity_reservations (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null references kitchens(id) on delete cascade,
  delivery_date date not null,
  source text not null check (source in ('cycle','order','booking')),
  source_id uuid not null,
  portions int not null check (portions > 0),
  released boolean not null default false,
  created_at timestamptz not null default now(),
  unique (source, source_id)             -- idempotent reservation
);
create index if not exists capacity_reservations_kd_idx
  on capacity_reservations(kitchen_id, delivery_date) where not released;
