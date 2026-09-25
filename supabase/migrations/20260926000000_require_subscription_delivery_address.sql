-- Delivery subscriptions must retain an immutable address snapshot for every future order.
alter table public.subscriptions
  add column if not exists delivery_address_id uuid references public.addresses(id) on delete set null,
  add column if not exists delivery_address_text text;

-- Preserve current subscriptions when the customer already has a complete saved address.
with chosen_address as (
  select distinct on (owner_id) owner_id, id, line1, line2, city, region, postal_code, country
  from public.addresses
  where kind = 'customer_delivery'
    and btrim(line1) <> '' and btrim(city) <> '' and btrim(region) <> ''
    and btrim(postal_code) <> '' and country ~ '^[A-Z]{2}$'
  order by owner_id, is_default desc, created_at
)
update public.subscriptions s
set delivery_address_id = a.id,
    delivery_address_text = concat_ws(', ', a.line1, nullif(a.line2, ''),
      concat_ws(' ', concat_ws(', ', a.city, a.region), a.postal_code), a.country)
from chosen_address a
where a.owner_id = s.customer_id
  and s.fulfillment = 'delivery' and s.delivery_address_text is null;

-- Do not create another billable cycle for an addressless legacy subscription.
update public.subscriptions
set lifecycle = 'paused', status = 'paused', updated_at = now()
where fulfillment = 'delivery'
  and lifecycle = 'active'
  and nullif(btrim(delivery_address_text), '') is null;

create or replace function public.snapshot_subscription_order_address()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $body$
declare
  v_cycle uuid;
  v_address text;
begin
  if new.fulfillment <> 'delivery' or new.delivery_address_text is not null then
    return new;
  end if;

  begin
    v_cycle := substring(new.idempotency_key from '^cyc_([0-9a-fA-F-]{36})')::uuid;
  exception when others then
    v_cycle := null;
  end;
  if v_cycle is null then return new; end if;

  select s.delivery_address_text into v_address
  from public.subscription_cycles c
  join public.subscriptions s on s.id = c.subscription_id
  where c.id = v_cycle;

  if nullif(btrim(v_address), '') is null then
    raise exception 'delivery subscription has no address snapshot';
  end if;
  new.delivery_address_text := v_address;
  return new;
end;
$body$;

drop trigger if exists orders_snapshot_subscription_address on public.orders;
create trigger orders_snapshot_subscription_address
before insert on public.orders
for each row execute function public.snapshot_subscription_order_address();

revoke all on function public.snapshot_subscription_order_address() from public, anon, authenticated;
