create or replace function claim_cycles_for_charge(p_limit int default 50)
returns table(cycle_id uuid, subscription_id uuid, kitchen_id uuid, total_cents int,
              stripe_customer_id text, stripe_payment_method_id text, charge_attempts int)
language plpgsql security definer set search_path to 'public' as $$
declare v_ids uuid[];
begin
  if not pg_try_advisory_xact_lock(hashtext('charge-due-cycles')) then return; end if;
  with due as (
    select c.id from subscription_cycles c
    join subscriptions s on s.id=c.subscription_id
    where c.status='selection_closed' and c.skipped=false and c.total_cents>0
      and c.billing_date <= current_date
      and c.payment_status in ('pending','failed')
      and (c.next_retry_at is null or c.next_retry_at <= now())
      and s.lifecycle in ('active','cancellation_scheduled')
    order by c.billing_date
    for update of c skip locked
    limit p_limit
  )
  select array_agg(id) into v_ids from due;
  if v_ids is null then return; end if;
  update subscription_cycles c set payment_status='charging', charge_attempts = c.charge_attempts + 1, updated_at=now()
   where c.id = any(v_ids);
  return query
    select c.id, c.subscription_id, c.kitchen_id, c.total_cents, p.stripe_customer_id, s.stripe_payment_method_id, c.charge_attempts
    from subscription_cycles c
    join subscriptions s on s.id=c.subscription_id
    join profiles p on p.id=s.customer_id
    where c.id = any(v_ids);
end $$;
revoke all on function claim_cycles_for_charge(int) from public, anon, authenticated;
grant execute on function claim_cycles_for_charge(int) to service_role;
