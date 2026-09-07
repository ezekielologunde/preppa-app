-- Scheduled automatic payouts, in addition to manual cash-out. A cook can still tap "cash
-- out" in My Hub anytime; this adds a weekly sweep so cooks who never remember to don't just
-- accumulate an idle ledger balance. Opt-out per kitchen, minimum threshold, and it never
-- fights a payout that's already in flight (reuses reserve_payout's own lock + pending-sum
-- logic pattern, just entered from a service-role worker instead of a user session).

alter table public.stripe_accounts
  add column if not exists auto_payout_enabled boolean not null default true,
  add column if not exists auto_payout_min_cents integer not null default 2000 check (auto_payout_min_cents >= 2000),
  add column if not exists last_auto_payout_at timestamptz,
  add column if not exists payout_interval text not null default 'weekly' check (payout_interval in ('daily', 'weekly', 'manual'));

-- Owner can tweak their own auto-payout preferences (min $20 floor enforced server-side too,
-- since this is reachable directly as an RPC, not just through a trusted UI control).
create or replace function public.set_payout_preferences(p_kitchen_id uuid, p_auto_enabled boolean, p_min_cents integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from kitchens where id = p_kitchen_id;
  if v_owner is null or v_owner is distinct from auth.uid() then
    raise exception 'not your kitchen' using errcode = '42501';
  end if;
  update stripe_accounts
     set auto_payout_enabled = p_auto_enabled,
         auto_payout_min_cents = greatest(2000, coalesce(p_min_cents, 2000)),
         updated_at = now()
   where kitchen_id = p_kitchen_id;
  if not found then
    raise exception 'Finish payout setup first.' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function public.set_payout_preferences(uuid, boolean, integer) from public, anon;
grant execute on function public.set_payout_preferences(uuid, boolean, integer) to authenticated;

-- claim_auto_payouts: service-role only. Mirrors reserve_payout's lock + pending-sum math
-- (kitchen_balance_cents now has a working service-role branch — see payout_reconciliation
-- migration) but is entered by the cron worker for every eligible kitchen in one pass, not by
-- a single user's own request. reserve_payout itself is left untouched for the manual path.
create or replace function public.claim_auto_payouts(p_limit integer default 50)
returns table(payout_id uuid, kitchen_id uuid, amount_cents integer, stripe_account_id text, owner_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  v_pending integer;
  v_available integer;
  v_payout_id uuid;
begin
  for r in
    select k.id as kitchen_id, k.owner_id, sa.stripe_account_id, sa.auto_payout_min_cents
    from kitchens k
    join stripe_accounts sa on sa.kitchen_id = k.id
    where k.verification_status = 'verified'
      and sa.payouts_enabled
      and sa.auto_payout_enabled
      and (sa.last_auto_payout_at is null or sa.last_auto_payout_at < now() - interval '6 days')
      and not exists (
        select 1 from payouts p where p.kitchen_id = k.id and p.status in ('pending', 'needs_review')
      )
    order by sa.last_auto_payout_at nulls first
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  loop
    perform pg_advisory_xact_lock(hashtext('payout:' || r.kitchen_id::text));

    -- Re-check inside the lock: another payout (manual or auto) may have started since the
    -- outer query ran.
    select coalesce(sum(p.amount_cents), 0) into v_pending
    from payouts p where p.kitchen_id = r.kitchen_id and p.status in ('pending', 'needs_review');
    if v_pending > 0 then
      continue;
    end if;

    v_available := kitchen_balance_cents(r.kitchen_id);
    if v_available < r.auto_payout_min_cents then
      update stripe_accounts set last_auto_payout_at = now() where stripe_accounts.kitchen_id = r.kitchen_id;
      continue;
    end if;

    insert into payouts (kitchen_id, amount_cents, status, source)
    values (r.kitchen_id, v_available, 'pending', 'auto')
    returning id into v_payout_id;

    update stripe_accounts set last_auto_payout_at = now() where stripe_accounts.kitchen_id = r.kitchen_id;

    payout_id := v_payout_id;
    kitchen_id := r.kitchen_id;
    amount_cents := v_available;
    stripe_account_id := r.stripe_account_id;
    owner_id := r.owner_id;
    return next;
  end loop;
end;
$$;
revoke all on function public.claim_auto_payouts(integer) from public, anon, authenticated;
grant execute on function public.claim_auto_payouts(integer) to service_role;

-- Schedule the sweep. Guarded exactly like reconcile-payouts's cron registration.
do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.unschedule('auto-payouts')
      where exists (select 1 from cron.job where jobname = 'auto-payouts');
    perform cron.schedule(
      'auto-payouts',
      '0 14 * * 1', -- Mondays 14:00 UTC
      $job$
        select net.http_post(
          url := 'https://fwidhpzwldneeaphrxgg.supabase.co/functions/v1/auto-payouts',
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'stripe_sync_worker_secret'),
            'Content-Type', 'application/json'),
          body := '{}'::jsonb
        )
        where exists (select 1 from vault.decrypted_secrets where name = 'stripe_sync_worker_secret');
      $job$
    );
  end if;
end $$;
