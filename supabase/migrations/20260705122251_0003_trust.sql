create type verification_kind as enum ('id', 'kyc', 'kitchen');
create table verifications (
  id           uuid primary key default gen_random_uuid(),
  subject_id   uuid not null references profiles (id) on delete cascade,
  kind         verification_kind not null,
  status       verification_status not null default 'pending',
  provider_ref text,
  reviewed_by  uuid references profiles (id),
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index verifications_subject_idx on verifications (subject_id);

create type address_kind as enum ('customer_delivery', 'kitchen_pickup');
create table addresses (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references profiles (id) on delete cascade,
  kind         address_kind not null,
  label        text,
  line1        text not null,
  line2        text,
  city         text not null,
  region       text,
  postal_code  text,
  lat          numeric(9,6),
  lng          numeric(9,6),
  is_default   boolean not null default false,
  created_at   timestamptz not null default now()
);
create index addresses_owner_idx on addresses (owner_id);

create type cod_status as enum ('issued', 'confirmed', 'expired', 'cancelled');
create table cod_handoffs (
  id                     uuid primary key default gen_random_uuid(),
  order_id               uuid not null unique references orders (id) on delete cascade,
  amount_cents           integer not null check (amount_cents >= 0),
  code_hash              text not null,
  status                 cod_status not null default 'issued',
  expires_at             timestamptz not null,
  confirmed_by_cook_at   timestamptz,
  confirmed_by_customer_at timestamptz,
  created_at             timestamptz not null default now()
);

create table reviews (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null unique references orders (id) on delete cascade,
  kitchen_id  uuid not null references kitchens (id) on delete cascade,
  author_id   uuid not null references profiles (id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  body        text,
  created_at  timestamptz not null default now()
);
create index reviews_kitchen_idx on reviews (kitchen_id);

create table stripe_accounts (
  id                 uuid primary key default gen_random_uuid(),
  kitchen_id         uuid not null unique references kitchens (id) on delete cascade,
  stripe_account_id  text not null unique,
  charges_enabled    boolean not null default false,
  payouts_enabled    boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger stripe_accounts_updated_at before update on stripe_accounts
  for each row execute function set_updated_at();

create table payment_intents (
  id                       uuid primary key default gen_random_uuid(),
  order_id                 uuid not null references orders (id) on delete cascade,
  stripe_payment_intent_id text not null unique,
  amount_cents             integer not null check (amount_cents >= 0),
  status                   text not null,
  created_at               timestamptz not null default now()
);
create index payment_intents_order_idx on payment_intents (order_id);

create type ledger_kind as enum ('sale', 'tip', 'fee', 'refund', 'payout', 'cod_liability', 'adjustment');
create table ledger_entries (
  id          uuid primary key default gen_random_uuid(),
  kitchen_id  uuid not null references kitchens (id) on delete restrict,
  order_id    uuid references orders (id) on delete set null,
  kind        ledger_kind not null,
  amount_cents integer not null,
  memo        text,
  created_at  timestamptz not null default now()
);
create index ledger_kitchen_idx on ledger_entries (kitchen_id, created_at desc);

create or replace function block_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'table % is append-only', tg_table_name;
end $$;
create trigger ledger_entries_no_update before update on ledger_entries
  for each row execute function block_mutation();
create trigger ledger_entries_no_delete before delete on ledger_entries
  for each row execute function block_mutation();

create or replace function kitchen_balance_cents(kid uuid)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount_cents), 0)::integer from ledger_entries where kitchen_id = kid;
$$;

create type payout_status as enum ('pending', 'paid', 'failed');
create table payouts (
  id                 uuid primary key default gen_random_uuid(),
  kitchen_id         uuid not null references kitchens (id) on delete restrict,
  amount_cents       integer not null check (amount_cents > 0),
  stripe_transfer_id text unique,
  status             payout_status not null default 'pending',
  created_at         timestamptz not null default now()
);
create index payouts_kitchen_idx on payouts (kitchen_id, created_at desc);

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles (id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);

create table audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references profiles (id),
  action     text not null,
  entity     text not null,
  entity_id  uuid,
  meta       jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create trigger audit_log_no_update before update on audit_log
  for each row execute function block_mutation();
create trigger audit_log_no_delete before delete on audit_log
  for each row execute function block_mutation();

insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', true)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
values ('kyc-docs', 'kyc-docs', false)
on conflict (id) do nothing;
