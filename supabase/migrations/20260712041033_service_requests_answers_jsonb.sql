-- Structured "what do you really need" drill-down answers (per-category), alongside the
-- flat columns. RLS unchanged (service_requests_customer_all already covers this column).
alter table service_requests add column if not exists answers jsonb not null default '{}'::jsonb;
