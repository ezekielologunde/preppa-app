alter table public.addresses
  add column if not exists country text not null default 'US';

alter table public.addresses
  drop constraint if exists addresses_country_iso2;

alter table public.addresses
  add constraint addresses_country_iso2 check (country ~ '^[A-Z]{2}$');
