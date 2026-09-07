-- Admin operational read RPCs for the in-app admin console.
-- All mirror the existing pattern: SECURITY DEFINER, pinned search_path,
-- gated with `where public.is_admin()` so non-admins receive zero rows.
-- Read-only; no PII beyond display_name + role is exposed.

create or replace function public.admin_list_orders()
returns table(
  order_id uuid, kitchen_name text, buyer_name text,
  total_cents int, status text, pay_status text, method text,
  pi_status text, item_count bigint, created_at timestamptz
)
language sql stable security definer set search_path to 'public'
as $$
  select o.id, k.name, p.display_name,
         o.total_cents, o.status::text, o.pay_status::text, o.method::text,
         (select pi.status from payment_intents pi where pi.order_id = o.id order by pi.created_at desc limit 1),
         (select count(*) from order_items oi where oi.order_id = o.id),
         o.created_at
  from orders o
  left join kitchens k on k.id = o.kitchen_id
  left join profiles p on p.id = o.customer_id
  where public.is_admin()
  order by o.created_at desc;
$$;

create or replace function public.admin_order_detail(p_order uuid)
returns table(
  order_id uuid, kitchen_name text, buyer_name text,
  status text, pay_status text, method text, fulfillment text,
  subtotal_cents int, service_fee_cents int, tip_cents int, total_cents int,
  created_at timestamptz, pi_status text, pi_stripe_id text, handoff_status text, items jsonb
)
language sql stable security definer set search_path to 'public'
as $$
  select o.id, k.name, p.display_name,
         o.status::text, o.pay_status::text, o.method::text, o.fulfillment::text,
         o.subtotal_cents, o.service_fee_cents, o.tip_cents, o.total_cents, o.created_at,
         (select pi.status from payment_intents pi where pi.order_id = o.id order by pi.created_at desc limit 1),
         (select pi.stripe_payment_intent_id from payment_intents pi where pi.order_id = o.id order by pi.created_at desc limit 1),
         (select ch.status::text from cod_handoffs ch where ch.order_id = o.id order by ch.created_at desc limit 1),
         coalesce((
           select jsonb_agg(jsonb_build_object(
             'name', oi.name_snapshot, 'qty', oi.qty, 'unit_price_cents', oi.unit_price_cents
           ) order by oi.created_at)
           from order_items oi where oi.order_id = o.id
         ), '[]'::jsonb)
  from orders o
  left join kitchens k on k.id = o.kitchen_id
  left join profiles p on p.id = o.customer_id
  where public.is_admin() and o.id = p_order;
$$;

create or replace function public.admin_list_users()
returns table(
  user_id uuid, display_name text, role text,
  verification_status text, kitchen_name text, created_at timestamptz
)
language sql stable security definer set search_path to 'public'
as $$
  select p.id, p.display_name, p.role::text, p.verification_status::text,
         (select k.name from kitchens k where k.owner_id = p.id order by k.created_at limit 1),
         p.created_at
  from profiles p
  where public.is_admin()
  order by p.created_at desc;
$$;

create or replace function public.admin_list_audit(p_limit int default 100, p_before timestamptz default null)
returns table(
  id uuid, actor_name text, action text, entity text,
  entity_id uuid, meta jsonb, created_at timestamptz
)
language sql stable security definer set search_path to 'public'
as $$
  select a.id, p.display_name, a.action, a.entity, a.entity_id, a.meta, a.created_at
  from audit_log a
  left join profiles p on p.id = a.actor_id
  where public.is_admin()
    and (p_before is null or a.created_at < p_before)
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

-- overview signature changes (adds orders_count + gmv_cents) -> drop then recreate
drop function if exists public.admin_overview();
create function public.admin_overview()
returns table(
  pending_applications bigint, verified_kitchens bigint, total_kitchens bigint,
  preppers bigint, orders_count bigint, gmv_cents bigint
)
language sql stable security definer set search_path to 'public'
as $$
  select
    (select count(*) from kitchens where verification_status = 'pending'),
    (select count(*) from kitchens where verification_status = 'verified'),
    (select count(*) from kitchens),
    (select count(*) from profiles where role = 'prepper'),
    (select count(*) from orders),
    (select coalesce(sum(amount_cents), 0) from payment_intents where status = 'succeeded')
  where public.is_admin();
$$;

grant execute on function public.admin_list_orders() to authenticated;
grant execute on function public.admin_order_detail(uuid) to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_list_audit(int, timestamptz) to authenticated;
grant execute on function public.admin_overview() to authenticated;
