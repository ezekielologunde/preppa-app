-- Include the authoritative Stripe Tax snapshot in admin order reconciliation.
-- The order total already includes this value, so omitting it made the visible
-- breakdown appear not to add up during support and payment review.
drop function if exists public.admin_order_detail(uuid);

create function public.admin_order_detail(p_order uuid)
returns table(
  order_id uuid, kitchen_name text, buyer_name text,
  status text, pay_status text, method text, fulfillment text,
  subtotal_cents int, service_fee_cents int, tax_cents int, tip_cents int, total_cents int,
  created_at timestamptz, pi_status text, pi_stripe_id text, handoff_status text, items jsonb
)
language sql stable security definer set search_path to 'public'
as $$
  select o.id, k.name, p.display_name,
         o.status::text, o.pay_status::text, o.method::text, o.fulfillment::text,
         o.subtotal_cents, o.service_fee_cents, o.tax_cents, o.tip_cents, o.total_cents, o.created_at,
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

revoke execute on function public.admin_order_detail(uuid) from public, anon;
grant execute on function public.admin_order_detail(uuid) to authenticated;
