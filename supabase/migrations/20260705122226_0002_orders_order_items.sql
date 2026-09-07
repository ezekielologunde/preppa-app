create type order_status   as enum ('pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled');
create type payment_method as enum ('card', 'cod');
create type payment_status as enum ('unpaid', 'authorized', 'paid', 'refunded', 'failed');
create type fulfillment    as enum ('pickup', 'delivery');

create table orders (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references profiles (id) on delete restrict,
  kitchen_id       uuid not null references kitchens (id) on delete restrict,
  status           order_status   not null default 'pending',
  method           payment_method not null,
  pay_status       payment_status not null default 'unpaid',
  fulfillment      fulfillment    not null default 'pickup',
  subtotal_cents   integer not null check (subtotal_cents >= 0),
  service_fee_cents integer not null default 0 check (service_fee_cents >= 0),
  tip_cents        integer not null default 0 check (tip_cents >= 0),
  total_cents      integer not null check (total_cents >= 0),
  idempotency_key  text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint orders_total_matches
    check (total_cents = subtotal_cents + service_fee_cents + tip_cents),
  constraint orders_idempotency_unique unique (customer_id, idempotency_key)
);
create index orders_customer_idx on orders (customer_id, created_at desc);
create index orders_kitchen_idx  on orders (kitchen_id, created_at desc);
create trigger orders_updated_at before update on orders
  for each row execute function set_updated_at();

create table order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references orders (id) on delete cascade,
  meal_id        uuid not null references meals (id) on delete restrict,
  kitchen_id     uuid not null references kitchens (id) on delete restrict,
  name_snapshot  text not null,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  qty            smallint not null check (qty >= 1),
  created_at     timestamptz not null default now()
);
create index order_items_order_idx on order_items (order_id);

create or replace function enforce_single_kitchen()
returns trigger language plpgsql as $$
declare
  order_kitchen uuid;
begin
  select kitchen_id into order_kitchen from orders where id = new.order_id;
  if new.kitchen_id is distinct from order_kitchen then
    raise exception 'order_items.kitchen_id (%) must match its order''s kitchen_id (%)',
      new.kitchen_id, order_kitchen;
  end if;
  return new;
end $$;
create trigger order_items_single_kitchen before insert or update on order_items
  for each row execute function enforce_single_kitchen();

create or replace function advance_order_status(p_order uuid, p_to order_status)
returns orders language plpgsql security definer set search_path = public as $$
declare
  cur orders;
  legal boolean;
begin
  select * into cur from orders where id = p_order for update;
  if not found then raise exception 'order not found'; end if;

  if not is_kitchen_owner(cur.kitchen_id)
     and current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'only the owning kitchen may advance this order';
  end if;

  legal := case cur.status
    when 'confirmed' then p_to in ('preparing', 'cancelled')
    when 'preparing' then p_to in ('ready', 'cancelled')
    when 'ready'     then p_to in ('completed', 'cancelled')
    else false
  end;
  if not legal then
    raise exception 'illegal order transition % -> %', cur.status, p_to;
  end if;

  update orders set status = p_to where id = p_order returning * into cur;
  return cur;
end $$;
