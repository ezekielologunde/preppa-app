-- PrepPlus P3: keep memberships in sync from the stripe.subscriptions mirror (the stripe-worker
-- cron refreshes that mirror ~every minute). This is the eventual-consistency backstop; the
-- subscribe-prepplus edge fn writes the row synchronously for instant entitlement on purchase.
create or replace function public.sync_prepplus_membership()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid;
  v_interval text;
  v_price text;
begin
  if coalesce(new.metadata->>'kind','') <> 'prepplus' then
    return new;
  end if;
  v_uid := nullif(new.metadata->>'customer_uid','')::uuid;
  if v_uid is null then return new; end if;

  -- best-effort price/interval from the first item (top-level status columns are authoritative)
  v_price    := new.items->'data'->0->'price'->>'id';
  v_interval := new.items->'data'->0->'price'->'recurring'->>'interval';

  insert into public.memberships as m (
    customer_id, stripe_subscription_id, stripe_price_id, plan_interval, status,
    current_period_end, cancel_at_period_end, updated_at
  ) values (
    v_uid, new.id, v_price, v_interval, new.status,
    case when new.current_period_end is not null then to_timestamp(new.current_period_end) else null end,
    coalesce(new.cancel_at_period_end, false), now()
  )
  on conflict (customer_id) do update set
    stripe_subscription_id = excluded.stripe_subscription_id,
    stripe_price_id        = coalesce(excluded.stripe_price_id, m.stripe_price_id),
    plan_interval          = coalesce(excluded.plan_interval, m.plan_interval),
    status                 = excluded.status,
    current_period_end     = excluded.current_period_end,
    cancel_at_period_end   = excluded.cancel_at_period_end,
    updated_at             = now()
  -- only track the customer's CURRENT subscription; ignore stale mirrors of an older (re-subscribed
  -- away) subscription. trial_consumed is intentionally never touched here (edge-fn owns it).
  where m.stripe_subscription_id = excluded.stripe_subscription_id;

  return new;
exception when others then
  return new; -- never break Stripe sync (mirrors reconcile_paid_pi discipline)
end $$;

-- stripe.subscriptions is provided by the hosted project's Stripe Sync Engine
-- wrapper (a Supabase add-on enabled via the dashboard), which does not exist on
-- a fresh local/self-hosted stack -- guard so this migration replays cleanly there.
do $$
begin
  if to_regclass('stripe.subscriptions') is not null then
    drop trigger if exists sync_prepplus_membership_trg on stripe.subscriptions;
    create trigger sync_prepplus_membership_trg
      after insert or update on stripe.subscriptions
      for each row execute function public.sync_prepplus_membership();
  end if;
end $$;
