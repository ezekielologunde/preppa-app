-- Phase 3: Food-Services marketplace (request → quote → book → deposit).
create type service_category   as enum ('cook_at_home','private_dinner','catering','consultation','class');
create type service_req_status as enum ('open','quoted','accepted','expired','cancelled');
create type quote_status       as enum ('pending','accepted','declined','withdrawn','expired');
create type booking_status     as enum ('pending_deposit','confirmed','in_progress','completed','cancelled','no_show','refunded');

-- Which service categories a prepper offers (opt-in). Null/empty = none.
alter table public.kitchens add column if not exists service_categories service_category[] not null default '{}';

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  category service_category not null,
  event_date date not null,
  event_time time,
  address_text text,                 -- PII: customer-only until a booking is confirmed
  lat double precision, lng double precision,
  approx_area text,                  -- coarse label shown to preppers pre-accept
  guests int check (guests > 0),
  budget_cents int check (budget_cents >= 0),
  details text,
  status service_req_status not null default 'open',
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);
create index service_requests_customer_idx on public.service_requests(customer_id);

create table public.service_request_targets (
  request_id uuid not null references public.service_requests(id) on delete cascade,
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, kitchen_id)
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  amount_cents int not null check (amount_cents > 0),
  deposit_cents int not null check (deposit_cents >= 0),
  note text,
  available boolean not null default true,
  status quote_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique (request_id, kitchen_id)
);
create index quotes_request_idx on public.quotes(request_id);
-- At most one accepted quote per request.
create unique index one_accepted_quote_per_request on public.quotes(request_id) where status = 'accepted';

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete restrict,
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  amount_cents int not null,
  deposit_cents int not null,
  balance_cents int generated always as (amount_cents - deposit_cents) stored,
  service_fee_cents int not null,
  status booking_status not null default 'pending_deposit',
  deposit_pi_id text,
  idempotency_key text unique,
  event_date date not null,
  address_text text,                 -- snapshot from the request; visible to the winning prepper
  lat double precision, lng double precision,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz
);
create index bookings_customer_idx on public.bookings(customer_id);
create index bookings_kitchen_idx on public.bookings(kitchen_id);
create unique index bookings_deposit_pi_idx on public.bookings(deposit_pi_id) where deposit_pi_id is not null;

-- RLS
alter table public.service_requests enable row level security;
alter table public.service_request_targets enable row level security;
alter table public.quotes enable row level security;
alter table public.bookings enable row level security;

-- service_requests: customer-only on the base table (protects address PII from preppers).
create policy service_requests_customer_all on public.service_requests for all
  using (customer_id = auth.uid()) with check (customer_id = auth.uid());

-- quotes: customer sees all quotes on their own request; a prepper sees only their own.
create policy quotes_read on public.quotes for select using (
  request_id in (select id from public.service_requests where customer_id = auth.uid())
  or kitchen_id in (select id from public.kitchens where owner_id = auth.uid())
);

-- bookings: readable by the customer or the kitchen owner. Writes are service-role only.
create policy bookings_read on public.bookings for select using (
  customer_id = auth.uid() or kitchen_id in (select id from public.kitchens where owner_id = auth.uid())
);

grant select on public.service_requests to authenticated;
grant select on public.quotes to authenticated;
grant select on public.bookings to authenticated;

-- A prepper's incoming requests (coarse — no exact address), for kitchens they own that were
-- targeted and haven't declined. SECURITY DEFINER so it can read across the customer-owned rows
-- while returning only non-PII columns.
create or replace function public.prepper_incoming_requests()
returns table (
  request_id uuid, kitchen_id uuid, category service_category, event_date date, event_time time,
  approx_area text, guests int, budget_cents int, details text, status service_req_status,
  my_quote_id uuid, my_quote_status quote_status, my_amount_cents int, created_at timestamptz
)
language sql stable security definer set search_path to 'public' as $$
  select sr.id, t.kitchen_id, sr.category, sr.event_date, sr.event_time,
         sr.approx_area, sr.guests, sr.budget_cents, sr.details, sr.status,
         q.id, q.status, q.amount_cents, sr.created_at
  from public.service_request_targets t
  join public.kitchens k on k.id = t.kitchen_id and k.owner_id = auth.uid()
  join public.service_requests sr on sr.id = t.request_id
  left join public.quotes q on q.request_id = sr.id and q.kitchen_id = t.kitchen_id
  where sr.status in ('open','quoted')
  order by sr.created_at desc;
$$;
revoke all on function public.prepper_incoming_requests() from public;
grant execute on function public.prepper_incoming_requests() to authenticated;
