-- Second half of the cook-notification gap: the cook now hears about each new order
-- (high_add_cook_new_order_notification), but nothing ever reminds them that money is
-- sitting in their ledger balance waiting to be cashed out (cash-out is manual, cook-
-- initiated via connect-payout -- there is no automatic payout schedule). Adds a
-- threshold + cooldown reminder, fired from the same reconcile_paid_pi settlement path.
--
-- Deliberately does NOT call kitchen_balance_cents() -- that function row-filters on
-- is_kitchen_owner(kid) OR the DEPRECATED current_setting('request.jwt.claim.role',...)
-- service-role check (the same broken pattern fixed in check_rate_limit). A raw trigger
-- firing off an INSERT into stripe.payment_intents has no PostgREST request context at
-- all (no JWT, deprecated or otherwise), so auth.uid() is null and that check silently
-- returns balance=0 -- it works fine for kitchen_balance_cents' one real caller (the
-- cook's own authenticated session in src/lib/connect.ts) but would silently break a
-- trigger-invoked caller. Summing ledger_entries directly here avoids that entirely; this
-- helper is SECURITY DEFINER and never exposed to anon/authenticated, so no RLS bypass risk.
create table if not exists public._notify_payout_reminder_state (
  kitchen_id uuid primary key references public.kitchens(id) on delete cascade,
  last_reminder_at timestamptz not null
);
alter table public._notify_payout_reminder_state enable row level security;
-- default-deny: only notify_payout_available() (SECURITY DEFINER) touches this table.

create or replace function public.notify_payout_available(p_kitchen_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner uuid;
  v_balance int;
  v_last timestamptz;
  v_threshold constant int := 2000;         -- $20 minimum before nagging
  v_cooldown constant interval := interval '48 hours';
begin
  select owner_id into v_owner from public.kitchens where id = p_kitchen_id;
  if v_owner is null then return; end if;

  select coalesce(sum(amount_cents), 0) into v_balance
  from public.ledger_entries where kitchen_id = p_kitchen_id;
  if v_balance < v_threshold then return; end if;

  select last_reminder_at into v_last from public._notify_payout_reminder_state where kitchen_id = p_kitchen_id;
  if v_last is not null and v_last > now() - v_cooldown then return; end if;

  perform public.notify(
    v_owner, 'payout', 'Money ready to cash out',
    '$'||to_char(v_balance / 100.0, 'FM999999990.00')||' is available in your balance — tap to cash out in My Hub.'
  );

  insert into public._notify_payout_reminder_state (kitchen_id, last_reminder_at)
  values (p_kitchen_id, now())
  on conflict (kitchen_id) do update set last_reminder_at = excluded.last_reminder_at;
exception when others then null; -- a reminder must never break payment reconciliation
end;
$function$;

revoke all on function public.notify_payout_available(uuid) from public, anon, authenticated;
