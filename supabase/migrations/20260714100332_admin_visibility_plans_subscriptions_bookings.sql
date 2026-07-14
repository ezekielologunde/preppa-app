-- Admin read-only visibility: meal plans/subscriptions and service-requests/quotes/bookings.
-- Mirrors the admin_list_orders/admin_order_detail pattern exactly (SECURITY DEFINER,
-- `where public.is_admin()` row filter, no direct RLS bypass grant needed).

create or replace function public.admin_list_plans()
returns table(
  plan_id uuid, kitchen_id uuid, kitchen_name text, name text, status text,
  price_cents integer, selection_model text, fulfillment text,
  subscriber_count bigint, created_at timestamptz
)
language sql stable security definer set search_path to 'public'
as $$
  select pl.id, pl.kitchen_id, k.name, pl.name, pl.status,
         pl.price_cents, pl.selection_model::text, pl.fulfillment::text,
         (select count(*) from subscriptions s where s.plan_id = pl.id),
         pl.created_at
  from plans pl
  left join kitchens k on k.id = pl.kitchen_id
  where public.is_admin()
  order by pl.created_at desc;
$$;

create or replace function public.admin_plan_detail(p_plan uuid)
returns table(
  plan_id uuid, kitchen_name text, name text, description text, status text,
  price_cents integer, fulfillment text, selection_model text,
  per_meal_cents integer, per_delivery_cents integer, meals_per_delivery integer,
  servings integer, min_commitment integer, trial_price_cents integer, trial_cycles integer,
  created_at timestamptz, items jsonb, subscribers jsonb
)
language sql stable security definer set search_path to 'public'
as $$
  select pl.id, k.name, pl.name, pl.description, pl.status,
         pl.price_cents, pl.fulfillment::text, pl.selection_model::text,
         pl.per_meal_cents, pl.per_delivery_cents, pl.meals_per_delivery,
         pl.servings, pl.min_commitment, pl.trial_price_cents, pl.trial_cycles,
         pl.created_at,
         coalesce((
           select jsonb_agg(jsonb_build_object('meal_name', m.name, 'qty', pi.qty, 'price_cents', m.price_cents))
           from plan_items pi join meals m on m.id = pi.meal_id
           where pi.plan_id = pl.id
         ), '[]'::jsonb),
         coalesce((
           select jsonb_agg(jsonb_build_object(
             'subscription_id', s.id, 'customer_name', p.display_name,
             'lifecycle', s.lifecycle::text, 'created_at', s.created_at
           ) order by s.created_at desc)
           from subscriptions s left join profiles p on p.id = s.customer_id
           where s.plan_id = pl.id
         ), '[]'::jsonb)
  from plans pl
  left join kitchens k on k.id = pl.kitchen_id
  where public.is_admin() and pl.id = p_plan;
$$;

create or replace function public.admin_list_subscriptions()
returns table(
  subscription_id uuid, kitchen_name text, customer_name text, plan_name text,
  kind text, lifecycle text, fulfillment text, preferred_day text,
  next_cycle_date date, created_at timestamptz
)
language sql stable security definer set search_path to 'public'
as $$
  select s.id, k.name, p.display_name, pl.name,
         s.kind::text, s.lifecycle::text, s.fulfillment::text, s.preferred_day,
         s.next_cycle_date, s.created_at
  from subscriptions s
  left join kitchens k on k.id = s.kitchen_id
  left join profiles p on p.id = s.customer_id
  left join plans pl on pl.id = s.plan_id
  where public.is_admin()
  order by s.created_at desc;
$$;

create or replace function public.admin_subscription_detail(p_subscription uuid)
returns table(
  subscription_id uuid, kitchen_name text, customer_name text, plan_name text,
  kind text, lifecycle text, fulfillment text, preferred_day text,
  billing_anchor date, next_cycle_date date, pause_until date,
  cancel_at_cycle_end boolean, failed_charge_count integer, trial_cycles_remaining integer,
  created_at timestamptz, cycles jsonb
)
language sql stable security definer set search_path to 'public'
as $$
  select s.id, k.name, p.display_name, pl.name,
         s.kind::text, s.lifecycle::text, s.fulfillment::text, s.preferred_day,
         s.billing_anchor, s.next_cycle_date, s.pause_until,
         s.cancel_at_cycle_end, s.failed_charge_count, s.trial_cycles_remaining,
         s.created_at,
         coalesce((
           select jsonb_agg(jsonb_build_object(
             'cycle_id', sc.id, 'status', sc.status::text, 'payment_status', sc.payment_status::text,
             'cycle_start', sc.cycle_start, 'cycle_end', sc.cycle_end, 'delivery_date', sc.delivery_date,
             'billing_date', sc.billing_date, 'total_cents', sc.total_cents, 'skipped', sc.skipped
           ) order by sc.cycle_start desc)
           from (select * from subscription_cycles where subscription_id = s.id order by cycle_start desc limit 12) sc
         ), '[]'::jsonb)
  from subscriptions s
  left join kitchens k on k.id = s.kitchen_id
  left join profiles p on p.id = s.customer_id
  left join plans pl on pl.id = s.plan_id
  where public.is_admin() and s.id = p_subscription;
$$;

create or replace function public.admin_list_service_requests()
returns table(
  request_id uuid, customer_name text, category text, status text,
  event_date date, budget_cents integer, quote_count bigint, created_at timestamptz
)
language sql stable security definer set search_path to 'public'
as $$
  select r.id, p.display_name, r.category::text, r.status::text,
         r.event_date, r.budget_cents,
         (select count(*) from quotes q where q.request_id = r.id),
         r.created_at
  from service_requests r
  left join profiles p on p.id = r.customer_id
  where public.is_admin()
  order by r.created_at desc;
$$;

create or replace function public.admin_service_request_detail(p_request uuid)
returns table(
  request_id uuid, customer_name text, category text, status text,
  event_date date, event_time time, approx_area text, address_text text,
  guests integer, budget_cents integer, details text, answers jsonb,
  created_at timestamptz, quotes jsonb, booking jsonb
)
language sql stable security definer set search_path to 'public'
as $$
  select r.id, p.display_name, r.category::text, r.status::text,
         r.event_date, r.event_time, r.approx_area, r.address_text,
         r.guests, r.budget_cents, r.details, r.answers,
         r.created_at,
         coalesce((
           select jsonb_agg(jsonb_build_object(
             'quote_id', q.id, 'kitchen_name', k.name, 'amount_cents', q.amount_cents,
             'deposit_cents', q.deposit_cents, 'status', q.status::text, 'note', q.note,
             'created_at', q.created_at
           ) order by q.created_at desc)
           from quotes q left join kitchens k on k.id = q.kitchen_id
           where q.request_id = r.id
         ), '[]'::jsonb),
         (
           select jsonb_build_object(
             'booking_id', b.id, 'status', b.status::text, 'amount_cents', b.amount_cents,
             'deposit_cents', b.deposit_cents, 'balance_cents', b.balance_cents,
             'created_at', b.created_at
           )
           from bookings b where b.request_id = r.id
           order by b.created_at desc limit 1
         )
  from service_requests r
  left join profiles p on p.id = r.customer_id
  where public.is_admin() and r.id = p_request;
$$;

create or replace function public.admin_list_bookings()
returns table(
  booking_id uuid, booking_kind text, kitchen_name text, customer_name text,
  status text, amount_cents integer, deposit_cents integer, balance_cents integer,
  event_date date, created_at timestamptz
)
language sql stable security definer set search_path to 'public'
as $$
  select b.id, b.booking_kind, k.name, p.display_name,
         b.status::text, b.amount_cents, b.deposit_cents, b.balance_cents,
         b.event_date, b.created_at
  from bookings b
  left join kitchens k on k.id = b.kitchen_id
  left join profiles p on p.id = b.customer_id
  where public.is_admin()
  order by b.created_at desc;
$$;

create or replace function public.admin_booking_detail(p_booking uuid)
returns table(
  booking_id uuid, booking_kind text, kitchen_name text, customer_name text,
  status text, amount_cents integer, deposit_cents integer, service_fee_cents integer,
  balance_cents integer, event_date date, address_text text, guests integer,
  created_at timestamptz, confirmed_at timestamptz, completed_at timestamptz, cancelled_at timestamptz,
  request jsonb, quote jsonb
)
language sql stable security definer set search_path to 'public'
as $$
  select b.id, b.booking_kind, k.name, p.display_name,
         b.status::text, b.amount_cents, b.deposit_cents, b.service_fee_cents,
         b.balance_cents, b.event_date, b.address_text, b.guests,
         b.created_at, b.confirmed_at, b.completed_at, b.cancelled_at,
         (
           select jsonb_build_object(
             'request_id', r.id, 'category', r.category::text, 'details', r.details,
             'answers', r.answers
           ) from service_requests r where r.id = b.request_id
         ),
         (
           select jsonb_build_object(
             'quote_id', q.id, 'amount_cents', q.amount_cents, 'deposit_cents', q.deposit_cents,
             'note', q.note
           ) from quotes q where q.id = b.quote_id
         )
  from bookings b
  left join kitchens k on k.id = b.kitchen_id
  left join profiles p on p.id = b.customer_id
  where public.is_admin() and b.id = p_booking;
$$;
