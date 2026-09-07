-- Phase 3 (isolated): let the append-only ledger credit service bookings too.
-- ledger_entries stays the single money source of truth + append-only (block_mutation).
alter table public.ledger_entries add column if not exists booking_id uuid references public.bookings(id) on delete set null;

-- Every entry must trace to an order, a booking, or be a platform-level payout/adjustment.
alter table public.ledger_entries drop constraint if exists ledger_entries_provenance;
alter table public.ledger_entries add constraint ledger_entries_provenance
  check (order_id is not null or booking_id is not null or kind in ('payout','adjustment'));
