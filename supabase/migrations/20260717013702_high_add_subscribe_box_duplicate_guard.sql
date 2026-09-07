-- Fixes an audit-flagged Medium finding: subscribe-box had no check for an existing box
-- subscription before inserting a new one, so a double-submit (double-tap, or a client retry
-- racing a slow first response) creates TWO independently-billed box subscriptions for the same
-- customer. A partial unique index (not just an application-level pre-check, which has its own
-- TOCTOU race under a genuine double-tap) closes this at the database level: at most one
-- non-terminal ('cancelled'/'completed' are the only terminal lifecycles) box subscription per
-- customer, enforced atomically by Postgres regardless of request timing.
create unique index if not exists subscriptions_one_active_box_per_customer
  on public.subscriptions (customer_id)
  where kind = 'box' and lifecycle not in ('cancelled', 'completed');
