-- Migration: Add plan-level cadence (weekly/biweekly).
-- cadence_weeks=1 (weekly), cadence_weeks=2 (biweekly).
-- Customers are informed at subscribe time but cannot override.

begin;

alter table plans
  add column cadence_weeks integer not null default 1
  check (cadence_weeks in (1, 2));

comment on column plans.cadence_weeks is
  'Cook-chosen subscription cadence: 1=weekly, 2=biweekly. Set at plan creation; customers cannot override.';

commit;
