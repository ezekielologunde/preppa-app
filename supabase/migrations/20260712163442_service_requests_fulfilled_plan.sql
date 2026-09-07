-- When a cook answers a meal_plan brief by publishing a plan, link it here so the
-- customer's request-detail can surface "your plan is ready → subscribe".
alter table service_requests add column if not exists fulfilled_plan_id uuid references plans(id);
