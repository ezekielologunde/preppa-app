-- Phase A m3: extend subscriptions with the app-controlled lifecycle.
-- `lifecycle` is the new source of truth; legacy text `status` kept during v1 migration.
alter table subscriptions
  add column if not exists lifecycle subscription_status not null default 'draft',
  add column if not exists kind      subscription_kind   not null default 'weekly',
  add column if not exists cadence_weeks int not null default 1,
  add column if not exists fulfillment fulfillment,
  add column if not exists billing_anchor date,
  add column if not exists next_cycle_date date,
  add column if not exists pause_until date,
  add column if not exists paused_cycles_remaining int,
  add column if not exists cancellation_scheduled_at timestamptz,
  add column if not exists cancel_at_cycle_end boolean not null default false,
  add column if not exists stripe_payment_method_id text,
  add column if not exists failed_charge_count int not null default 0,
  add column if not exists trial_cycles_remaining int not null default 0;

alter table subscriptions
  add constraint subs_cadence_weeks_chk check (cadence_weeks in (1,2)) not valid,
  add constraint subs_failed_charge_chk check (failed_charge_count >= 0) not valid;
alter table subscriptions validate constraint subs_cadence_weeks_chk;
alter table subscriptions validate constraint subs_failed_charge_chk;

-- cron scan key: only active subs are ever materialized
create index if not exists subscriptions_next_cycle_active_idx
  on subscriptions(next_cycle_date) where lifecycle = 'active';
