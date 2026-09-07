-- Phase A m4: the core cycle tables. Fulfillment happens off the cycle, never the sub.

create table if not exists subscription_cycles (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  kitchen_id uuid not null references kitchens(id),
  cycle_start date not null,
  cycle_end   date not null,
  delivery_date date not null,          -- capacity key
  billing_date  date not null,
  selection_deadline timestamptz not null,
  status         cycle_status         not null default 'scheduled',
  payment_status cycle_payment_status not null default 'pending',
  skipped boolean not null default false,
  subtotal_cents    int not null default 0 check (subtotal_cents >= 0),
  service_fee_cents int not null default 0 check (service_fee_cents >= 0),
  tax_cents         int not null default 0 check (tax_cents >= 0),
  total_cents       int not null default 0 check (total_cents >= 0),
  order_id uuid references orders(id),
  stripe_payment_intent_id text,
  last_payment_error text,
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id, cycle_start)  -- one cycle per period (idempotency)
);
create index if not exists subscription_cycles_billing_idx
  on subscription_cycles(billing_date) where status = 'selection_closed';
create index if not exists subscription_cycles_kitchen_delivery_idx
  on subscription_cycles(kitchen_id, delivery_date);
create index if not exists subscription_cycles_sub_idx
  on subscription_cycles(subscription_id);

-- source of order_items at reconcile (the whole reason we leave Stripe recurring)
create table if not exists subscription_cycle_items (
  cycle_id uuid not null references subscription_cycles(id) on delete cascade,
  meal_id  uuid not null references meals(id),
  qty int not null default 1 check (qty > 0),
  primary key (cycle_id, meal_id)
);

-- customer-provided (NOT medical) preferences, captured before the first cycle
create table if not exists subscription_preferences (
  subscription_id uuid primary key references subscriptions(id) on delete cascade,
  dietary_tags text[] not null default '{}',
  allergies    text[] not null default '{}',
  dislikes     text[] not null default '{}',
  serving_size int,
  spice_level  int,
  preferred_day text,
  household_size int,
  notes text,
  updated_at timestamptz not null default now()
);

-- append-only audit trail (mirrors the ledger_entries philosophy)
create table if not exists subscription_events (
  id bigint generated always as identity primary key,
  subscription_id uuid not null references subscriptions(id),
  cycle_id uuid references subscription_cycles(id),
  event text not null,
  from_status text,
  to_status text,
  actor text not null default 'system',   -- customer | cook | system | cron
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
drop trigger if exists subscription_events_no_update on subscription_events;
drop trigger if exists subscription_events_no_delete on subscription_events;
create trigger subscription_events_no_update before update on subscription_events
  for each row execute function block_mutation();
create trigger subscription_events_no_delete before delete on subscription_events
  for each row execute function block_mutation();
