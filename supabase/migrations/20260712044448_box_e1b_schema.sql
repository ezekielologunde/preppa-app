-- Cross-kitchen build-your-own box (Model B). ADDITIVE only: new tables, nullable columns,
-- CHECKs, a partial unique index. No existing row is rewritten; the append-only ledger
-- triggers are untouched. Single-kitchen path is byte-for-byte unaffected (is_box=false).

-- 1) subscriptions: allow a plan-less box + discount/fee knobs + solvency invariants
alter table subscriptions
  alter column plan_id drop not null,
  add column if not exists discount_bps    int not null default 0,
  add column if not exists service_fee_bps int;
alter table subscriptions
  add constraint sub_plan_xor_box check (
    (kind = 'box'  and plan_id is null) or (kind <> 'box' and plan_id is not null)) not valid,
  add constraint sub_box_solvent check (
    kind <> 'box' or service_fee_bps is null or service_fee_bps >= discount_bps) not valid;
alter table subscriptions validate constraint sub_plan_xor_box;
alter table subscriptions validate constraint sub_box_solvent;

-- 2) the customer's standing box selection (seeds each cycle); kitchen_id frozen from the meal
create table if not exists subscription_box_items (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  meal_id uuid not null references meals(id),
  kitchen_id uuid not null references kitchens(id),
  qty int not null check (qty > 0),
  unit_price_cents int not null check (unit_price_cents >= 0),
  created_at timestamptz not null default now(),
  unique (subscription_id, meal_id)
);
create or replace function set_box_item_snapshot()
returns trigger language plpgsql set search_path to 'public' as $$
declare m record;
begin
  select kitchen_id, price_cents into m from meals where id = new.meal_id;
  if not found then raise exception 'meal % not found', new.meal_id; end if;
  new.kitchen_id := m.kitchen_id;                       -- freeze: can't smuggle another cook's meal
  if new.unit_price_cents is null then new.unit_price_cents := m.price_cents; end if;
  return new;
end $$;
drop trigger if exists box_item_snapshot on subscription_box_items;
create trigger box_item_snapshot before insert or update on subscription_box_items
  for each row execute function set_box_item_snapshot();

-- 3) snapshot per-kitchen grouping + frozen unit price onto cycle items (null for legacy rows)
alter table subscription_cycle_items
  add column if not exists kitchen_id uuid references kitchens(id),
  add column if not exists unit_price_cents int;

-- 4) cycle carries box economics (reuses existing subtotal/service_fee/tax/total_cents)
alter table subscription_cycles
  add column if not exists is_box boolean not null default false,
  add column if not exists discount_cents int not null default 0,
  add column if not exists box_order_id uuid;
alter table subscription_cycles
  add constraint cyc_box_solvent check (not is_box or total_cents >= subtotal_cents) not valid;
alter table subscription_cycles validate constraint cyc_box_solvent;

-- 5) customer-facing box grouping — NOT an orders row (no kitchen_id NOT NULL clash, no cook queue)
create table if not exists box_orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references profiles(id),
  subscription_id uuid not null references subscriptions(id),
  cycle_id uuid not null references subscription_cycles(id),
  delivery_date date not null,
  subtotal_cents int not null,
  discount_cents int not null,
  service_fee_cents int not null,
  total_cents int not null,
  stripe_payment_intent_id text,
  idempotency_key text not null unique,     -- 'box_cyc_<cycleId>'
  created_at timestamptz not null default now()
);
alter table subscription_cycles
  add constraint cyc_box_order_fk foreign key (box_order_id) references box_orders(id) not valid;

-- 6) per-kitchen child orders reuse the EXISTING orders table (kitchen_id NOT NULL intact)
alter table orders add column if not exists box_order_id uuid references box_orders(id);

-- 7) ledger idempotency: additive nullable key + partial unique index (metadata-only in PG17;
--    block_mutation row triggers untouched; dedupe via ON CONFLICT DO NOTHING = zero-row insert)
alter table ledger_entries
  add column if not exists cycle_id uuid,
  add column if not exists dedupe_key text;
create unique index if not exists ux_ledger_dedupe on ledger_entries(dedupe_key) where dedupe_key is not null;

-- RLS on the new customer tables
alter table subscription_box_items enable row level security;
alter table box_orders            enable row level security;
drop policy if exists box_items_read on subscription_box_items;
create policy box_items_read on subscription_box_items for select to authenticated
  using (owns_subscription(subscription_id) or cook_owns_subscription(subscription_id));
drop policy if exists box_orders_read on box_orders;
create policy box_orders_read on box_orders for select to authenticated
  using (customer_id = auth.uid());
