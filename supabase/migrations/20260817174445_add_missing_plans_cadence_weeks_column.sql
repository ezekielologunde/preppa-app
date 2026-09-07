
-- Found live: every "Browse meal plans" request 400'd because src/lib/subscriptions.ts
-- (rowToPlan / PLAN_SELECT) selects plans.cadence_weeks, a column the client code has
-- treated as existing since it was written (comment: "NEW: default to weekly", with a
-- `p.cadence_weeks ?? 1` fallback) but which no migration ever actually created. Purely
-- additive: 1 = weekly matches the exact default the client already falls back to.
alter table public.plans
  add column if not exists cadence_weeks integer not null default 1;
comment on column public.plans.cadence_weeks is 'Billing/delivery cadence in weeks: 1=weekly, 2=biweekly.';
