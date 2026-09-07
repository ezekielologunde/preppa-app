-- Phase A m2: extend plans with config, pricing knobs, media, tags.
-- price_cents stays the canonical cook weekly price for fixed plans;
-- customer_choice plans price from per_meal_cents x selected qty.
alter table plans
  add column if not exists meals_per_delivery int,
  add column if not exists servings           int,
  add column if not exists meals_per_week      int,
  add column if not exists delivery_days       text[]  not null default '{}',
  add column if not exists min_commitment      int     not null default 1,
  add column if not exists lead_time_hours     int     not null default 48,
  add column if not exists cutoff_hours        int     not null default 48,
  add column if not exists selection_model     selection_model not null default 'fixed',
  add column if not exists rotating            boolean not null default false,
  add column if not exists per_meal_cents      int,
  add column if not exists per_delivery_cents  int     not null default 0,
  add column if not exists service_fee_bps     int     not null default 1000,
  add column if not exists tax_bps             int     not null default 0,
  add column if not exists trial_price_cents   int,
  add column if not exists trial_cycles        int     not null default 0,
  add column if not exists cover_url           text,
  add column if not exists photo_urls          text[]  not null default '{}',
  add column if not exists dietary_tags        text[]  not null default '{}',
  add column if not exists allergens           text[]  not null default '{}',
  add column if not exists service_area        text[]  not null default '{}';

alter table plans
  add constraint plans_meals_per_delivery_chk check (meals_per_delivery is null or meals_per_delivery >= 1) not valid,
  add constraint plans_servings_chk          check (servings is null or servings >= 1) not valid,
  add constraint plans_min_commitment_chk    check (min_commitment >= 1) not valid,
  add constraint plans_per_meal_chk          check (per_meal_cents is null or per_meal_cents >= 0) not valid,
  add constraint plans_per_delivery_chk      check (per_delivery_cents >= 0) not valid,
  add constraint plans_service_fee_bps_chk   check (service_fee_bps between 0 and 10000) not valid,
  add constraint plans_tax_bps_chk           check (tax_bps >= 0) not valid,
  add constraint plans_trial_price_chk       check (trial_price_cents is null or trial_price_cents >= 0) not valid,
  add constraint plans_trial_cycles_chk      check (trial_cycles >= 0) not valid;
alter table plans validate constraint plans_meals_per_delivery_chk;
alter table plans validate constraint plans_servings_chk;
alter table plans validate constraint plans_min_commitment_chk;
alter table plans validate constraint plans_per_meal_chk;
alter table plans validate constraint plans_per_delivery_chk;
alter table plans validate constraint plans_service_fee_bps_chk;
alter table plans validate constraint plans_tax_bps_chk;
alter table plans validate constraint plans_trial_price_chk;
alter table plans validate constraint plans_trial_cycles_chk;
