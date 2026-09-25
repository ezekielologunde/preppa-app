-- Serialize plan signup at the database boundary. The Edge Function pre-check improves copy,
-- while this index closes two concurrent requests that both pass that check.
create unique index if not exists subscriptions_one_active_plan_per_customer
  on public.subscriptions (customer_id, plan_id)
  where plan_id is not null and lifecycle not in ('cancelled', 'completed');
