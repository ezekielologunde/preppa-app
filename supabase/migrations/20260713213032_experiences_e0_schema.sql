-- E0: prepper-published Experience listings + per-session seat inventory. Ships DORMANT
-- (no edge fns / RPCs yet). Reuses the bookings→reconcile→ledger→Connect payout money path by
-- extending bookings with a typed shape rather than a separate table.

-- 1. Listing (cook-owned, like meals/plans)
create table if not exists experiences (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null references kitchens(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  category service_category not null default 'class',                 -- money/routing category (reused enum)
  experience_type text not null default 'class'
    check (experience_type in ('class','supper_club','tasting','workshop')),  -- display facet
  description text,
  cover_url text,
  photo_urls text[] not null default '{}',
  location_type text not null default 'prepper_place'
    check (location_type in ('prepper_place','customer_place','venue','virtual')),
  address_text text,
  duration_min int not null default 120 check (duration_min between 15 and 1440),
  min_guests int not null default 1 check (min_guests >= 1),
  max_guests int not null default 8 check (max_guests >= min_guests),
  price_model text not null default 'per_person' check (price_model in ('per_person','flat')),
  per_person_cents int check (per_person_cents is null or per_person_cents >= 0),
  price_cents int check (price_cents is null or price_cents >= 0),
  service_fee_bps int not null default 1500,                          -- 15% (services rate)
  whats_included text[] not null default '{}',
  requirements text,
  dietary_tags text[] not null default '{}',
  allergens text[] not null default '{}',
  cancellation_policy text not null default 'strict',
  status text not null default 'draft'
    check (status in ('draft','pending','published','paused','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- a non-draft listing must carry the price for its model
  constraint experiences_pricing check (
    status = 'draft'
    or (price_model = 'per_person' and per_person_cents is not null)
    or (price_model = 'flat' and price_cents is not null)
  )
);
create index if not exists experiences_kitchen_status_idx on experiences(kitchen_id, status);
create index if not exists experiences_published_idx on experiences(status) where status = 'published';

-- 2. Per-session seat inventory (decoupled from kitchen_capacity daily portion cap)
create table if not exists experience_sessions (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references experiences(id) on delete cascade,
  kitchen_id uuid not null references kitchens(id) on delete cascade,   -- denorm for RLS/joins
  starts_at timestamptz not null,
  duration_min int,
  capacity int not null check (capacity >= 1),
  status text not null default 'open' check (status in ('open','closed','cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists experience_sessions_exp_idx on experience_sessions(experience_id, starts_at);
create index if not exists experience_sessions_kitchen_idx on experience_sessions(kitchen_id, starts_at);

-- 3. Seat holds (like capacity_reservations; the FOR UPDATE lock + this table = oversell defense)
create table if not exists experience_seat_reservations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references experience_sessions(id) on delete cascade,
  booking_id uuid not null references bookings(id) on delete cascade,
  guests int not null check (guests >= 1),
  released_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, booking_id)
);
create index if not exists experience_res_active_idx on experience_seat_reservations(session_id) where released_at is null;

-- 4. bookings extension: one table, typed by booking_kind. Reconcile stays UNTOUCHED — the
--    quote/request updates become no-ops when those FKs are null for experience bookings.
alter table bookings
  add column if not exists booking_kind text not null default 'rfq',
  add column if not exists experience_id uuid references experiences(id),
  add column if not exists session_id uuid references experience_sessions(id),
  add column if not exists guests int;
alter table bookings alter column request_id drop not null;
alter table bookings alter column quote_id drop not null;
alter table bookings drop constraint if exists bookings_kind_valid;
alter table bookings add constraint bookings_kind_valid check (booking_kind in ('rfq','experience'));
alter table bookings drop constraint if exists bookings_kind_shape;
alter table bookings add constraint bookings_kind_shape check (
  (booking_kind = 'rfq'
     and request_id is not null and quote_id is not null
     and experience_id is null and session_id is null)
  or
  (booking_kind = 'experience'
     and experience_id is not null and session_id is not null and guests is not null
     and request_id is null and quote_id is null)
);

-- 5. RLS — public browse of published listings from verified kitchens; owner sees own; admin sees all
alter table experiences enable row level security;
alter table experience_sessions enable row level security;
alter table experience_seat_reservations enable row level security;

drop policy if exists experiences_read on experiences;
create policy experiences_read on experiences for select to anon, authenticated
  using (
    (status = 'published' and exists (select 1 from kitchens k where k.id = experiences.kitchen_id and k.verification_status = 'verified'))
    or is_kitchen_owner(kitchen_id) or is_admin()
  );

drop policy if exists experience_sessions_read on experience_sessions;
create policy experience_sessions_read on experience_sessions for select to anon, authenticated
  using (
    is_kitchen_owner(kitchen_id) or is_admin()
    or exists (select 1 from experiences e join kitchens k on k.id = e.kitchen_id
               where e.id = experience_sessions.experience_id and e.status = 'published' and k.verification_status = 'verified')
  );

drop policy if exists experience_res_read on experience_seat_reservations;
create policy experience_res_read on experience_seat_reservations for select to authenticated
  using (exists (select 1 from experience_sessions s where s.id = experience_seat_reservations.session_id and (is_kitchen_owner(s.kitchen_id) or is_admin())));
-- writes to all three tables are service-role/SECURITY-DEFINER only (experience-upsert / reserve RPC) — no client write policies;
