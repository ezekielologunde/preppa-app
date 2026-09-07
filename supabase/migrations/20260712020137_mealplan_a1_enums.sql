-- Meal-plan/subscription engine — Phase A, migration 1: lifecycle & cycle enums.
do $$ begin
  if not exists (select 1 from pg_type where typname='subscription_status') then
    create type subscription_status as enum
      ('draft','pending_confirmation','active','paused','payment_failed',
       'cancellation_scheduled','cancelled','completed','suspended');
  end if;
  if not exists (select 1 from pg_type where typname='subscription_kind') then
    create type subscription_kind as enum ('weekly','biweekly','trial');
  end if;
  if not exists (select 1 from pg_type where typname='cycle_status') then
    create type cycle_status as enum
      ('scheduled','selection_open','selection_closed','charged',
       'order_created','fulfilled','skipped','failed','refunded');
  end if;
  if not exists (select 1 from pg_type where typname='cycle_payment_status') then
    create type cycle_payment_status as enum
      ('pending','action_required','paid','failed','refunded','skipped');
  end if;
  if not exists (select 1 from pg_type where typname='selection_model') then
    create type selection_model as enum ('fixed','customer_choice');
  end if;
end $$;
