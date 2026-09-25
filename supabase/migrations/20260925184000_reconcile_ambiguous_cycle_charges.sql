-- Automated resolution for subscription charges whose Stripe response was ambiguous.
alter table public.subscription_cycles
  add column if not exists charge_ambiguous_at timestamptz,
  add column if not exists charge_reconcile_checked_at timestamptz,
  add column if not exists charge_reconcile_attempts integer not null default 0;

create index if not exists subscription_cycles_ambiguous_charge_idx
  on public.subscription_cycles (charge_ambiguous_at)
  where payment_status = 'charging' and last_payment_error = 'ambiguous_stripe_outcome';

create or replace function public.mark_cycle_charge_ambiguous(p_cycle uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  update public.subscription_cycles
     set last_payment_error = 'ambiguous_stripe_outcome',
         charge_ambiguous_at = coalesce(charge_ambiguous_at, now()),
         updated_at = now()
   where id = p_cycle and payment_status = 'charging' and stripe_payment_intent_id is null;
end $$;

create or replace function public.claim_ambiguous_cycle_charges(
  p_min_age interval default interval '10 minutes', p_limit integer default 50
)
returns table(cycle_id uuid, subscription_id uuid, total_cents integer,
              stripe_customer_id text, ambiguous_at timestamptz, reconcile_attempts integer)
language plpgsql security definer set search_path to 'public' as $$
begin
  return query
  with claimed as (
    select c.id
    from public.subscription_cycles c
    where c.payment_status = 'charging'
      and c.stripe_payment_intent_id is null
      and c.last_payment_error = 'ambiguous_stripe_outcome'
      and c.charge_ambiguous_at < now() - p_min_age
      and (c.charge_reconcile_checked_at is null or c.charge_reconcile_checked_at < now() - p_min_age)
    order by c.charge_ambiguous_at
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    for update skip locked
  ), bumped as (
    update public.subscription_cycles c
       set charge_reconcile_checked_at = now(),
           charge_reconcile_attempts = c.charge_reconcile_attempts + 1
      from claimed x where c.id = x.id
    returning c.id, c.subscription_id, c.total_cents, c.charge_ambiguous_at, c.charge_reconcile_attempts
  )
  select b.id, b.subscription_id, b.total_cents, p.stripe_customer_id,
         b.charge_ambiguous_at, b.charge_reconcile_attempts
  from bumped b join public.subscriptions s on s.id = b.subscription_id
  join public.profiles p on p.id = s.customer_id;
end $$;

create or replace function public.flag_ambiguous_cycle_charge(p_cycle uuid, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_sub uuid;
begin
  update public.subscription_cycles
     set last_payment_error = p_reason, updated_at = now()
   where id = p_cycle and payment_status = 'charging'
   returning subscription_id into v_sub;
  if v_sub is null then return; end if;
  perform public.notify_admins('admin', 'Subscription charge needs review',
    'Cycle ' || p_cycle::text || ' has a Stripe PaymentIntent that does not match its saved amount. Review it before changing the cycle.');
end $$;

revoke all on function public.mark_cycle_charge_ambiguous(uuid) from public, anon, authenticated;
revoke all on function public.claim_ambiguous_cycle_charges(interval,integer) from public, anon, authenticated;
revoke all on function public.flag_ambiguous_cycle_charge(uuid,text) from public, anon, authenticated;
grant execute on function public.mark_cycle_charge_ambiguous(uuid) to service_role;
grant execute on function public.claim_ambiguous_cycle_charges(interval,integer) to service_role;
grant execute on function public.flag_ambiguous_cycle_charge(uuid,text) to service_role;

do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.unschedule('reconcile-cycle-charges')
      where exists (select 1 from cron.job where jobname = 'reconcile-cycle-charges');
    perform cron.schedule(
      'reconcile-cycle-charges',
      '4,9,14,19,24,29,34,39,44,49,54,59 * * * *',
      $job$
        select net.http_post(
          url := 'https://fwidhpzwldneeaphrxgg.supabase.co/functions/v1/reconcile-cycle-charges',
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'stripe_sync_worker_secret'),
            'Content-Type', 'application/json'),
          body := '{}'::jsonb,
          timeout_milliseconds := 15000
        ) where exists (select 1 from vault.decrypted_secrets where name = 'stripe_sync_worker_secret');
      $job$
    );
  end if;
end $$;
