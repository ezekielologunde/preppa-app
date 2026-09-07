-- E3b: finalize an experience cancellation AFTER Stripe has refunded (or determined no refund).
-- On refund → append a ledger 'refund' entry clawing back the cook's net credit for this booking
-- (zeroes their balance for it — ledger stays APPEND-ONLY, we never mutate the original sale/fee),
-- release the seats, status='refunded'. On no-refund (strict/late) → status='cancelled', seat stays
-- consumed (customer forfeits, cook keeps payment). Idempotent.
create or replace function finalize_experience_cancel(p_booking uuid, p_refunded_cents int)
returns void language plpgsql security definer set search_path to 'public' as $$
declare b bookings; v_credited int;
begin
  select * into b from bookings where id = p_booking and booking_kind = 'experience';
  if b.id is null then raise exception 'booking not found'; end if;
  if b.status in ('cancelled','refunded') then return; end if;   -- idempotent

  if p_refunded_cents > 0 then
    select coalesce(sum(amount_cents),0) into v_credited from ledger_entries where booking_id = p_booking and kind in ('sale','fee','tip');
    if v_credited <> 0 then
      insert into ledger_entries(kitchen_id, booking_id, kind, amount_cents, memo)
        values (b.kitchen_id, p_booking, 'refund', -v_credited, 'Experience refund '||left(p_booking::text,8));
    end if;
    update experience_seat_reservations set released_at = now() where booking_id = p_booking and released_at is null;
    update bookings set status = 'refunded', cancelled_at = now() where id = p_booking;
  else
    update bookings set status = 'cancelled', cancelled_at = now() where id = p_booking;
  end if;
end $$;

revoke all on function finalize_experience_cancel(uuid, int) from public, anon, authenticated;
grant execute on function finalize_experience_cancel(uuid, int) to service_role;
