-- Make the durable booking balance outcome visible to customer and admin recovery surfaces.
drop function if exists public.admin_booking_detail(uuid);
create function public.admin_booking_detail(p_booking uuid)
returns table(
  booking_id uuid, booking_kind text, kitchen_name text, customer_name text,
  status text, amount_cents integer, deposit_cents integer, service_fee_cents integer,
  balance_cents integer, balance_charge_status text, event_date date, address_text text, guests integer,
  created_at timestamptz, confirmed_at timestamptz, completed_at timestamptz, cancelled_at timestamptz,
  request jsonb, quote jsonb
)
language sql stable security definer set search_path to 'public' as $$
  select b.id, b.booking_kind, k.name, p.display_name,
         b.status::text, b.amount_cents, b.deposit_cents, b.service_fee_cents,
         b.balance_cents, b.balance_charge_status, b.event_date, b.address_text, b.guests,
         b.created_at, b.confirmed_at, b.completed_at, b.cancelled_at,
         (
           select jsonb_build_object(
             'request_id', r.id, 'category', r.category::text, 'details', r.details,
             'answers', r.answers
           ) from public.service_requests r where r.id = b.request_id
         ),
         (
           select jsonb_build_object(
             'quote_id', q.id, 'amount_cents', q.amount_cents, 'deposit_cents', q.deposit_cents,
             'note', q.note
           ) from public.quotes q where q.id = b.quote_id
         )
  from public.bookings b
  left join public.kitchens k on k.id = b.kitchen_id
  left join public.profiles p on p.id = b.customer_id
  where public.is_admin() and b.id = p_booking;
$$;
revoke all on function public.admin_booking_detail(uuid) from public, anon;
grant execute on function public.admin_booking_detail(uuid) to authenticated;
