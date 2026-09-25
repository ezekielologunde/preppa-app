-- Stripe Tax is stored separately on orders and included in the PaymentIntent total.
-- Keep the database invariant aligned so taxable orders are not rejected at insert time.
alter table public.orders
  drop constraint if exists orders_total_matches;

alter table public.orders
  add constraint orders_total_matches
  check (total_cents = subtotal_cents + service_fee_cents + tax_cents + tip_cents);
