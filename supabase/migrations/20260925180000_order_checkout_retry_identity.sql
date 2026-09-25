-- Preserve the selected delivery-address identity alongside the immutable text snapshot.
-- This lets create-order reject an idempotency-key retry whose customer-visible checkout
-- terms changed, without relying on mutable address text or weakening historical receipts.
alter table public.orders
  add column if not exists delivery_address_id uuid;

comment on column public.orders.delivery_address_id is
  'Customer delivery address selected when the order was created; used to validate idempotent retries. The fulfillment snapshot remains delivery_address_text.';
