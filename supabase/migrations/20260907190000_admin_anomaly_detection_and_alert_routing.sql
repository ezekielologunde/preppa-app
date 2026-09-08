-- Harden admin controls, closing out Launch-Plan.md item 7. Rate limiting on
-- admin_suspend_kitchen/admin_set_user_role/approve_kitchen/admin_reinstate_kitchen was already
-- done 2026-07-15 (see 20260715220353_high_fix_stripe_and_admin_rate_limiting.sql) -- that part
-- of the checklist was stale. What was still genuinely missing, per AUDIT.md's "two ready-to-run
-- SQL detection queries" note: (1) no alert fires on a role change or kitchen suspension even
-- though the data is already in audit_log, and (2) no detection existed at all for unusual
-- refund/payment-failure volume, and (3) notify_admins() only ever wrote an in-app
-- notification -- nothing left the app, so an admin had to already be looking at the phone/app
-- to see it.

-- ---------------------------------------------------------------------------------------
-- 1. Real-time alerts on the two RPCs the checklist named. Each already writes to audit_log;
-- this adds an immediate notify_admins() fan-out so every admin (not just the one who acted)
-- sees it, same pattern payout reconciliation already uses for 'needs_review'. Bodies otherwise
-- unchanged from the 2026-07-15 version (verbatim except for the added notify_admins call).
create or replace function public.admin_set_user_role(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $body$
declare
  v_caller_role user_role;
  v_current user_role;
  v_admin_count int;
  v_next user_role;
begin
  select role into v_caller_role from profiles where id = auth.uid();
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
     and coalesce(v_caller_role, 'customer') <> 'admin' then
    raise exception 'only an admin may change a user''s role';
  end if;

  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    perform public.check_rate_limit('admin_set_user_role', 10, interval '5 minutes');
  end if;

  v_next := p_role::user_role;
  select role into v_current from profiles where id = p_user;
  if v_current is null then
    raise exception 'user not found';
  end if;
  if v_current = v_next then
    return;
  end if;

  -- Safety net: never demote the last remaining admin (would lock the console).
  if v_current = 'admin' and v_next <> 'admin' then
    select count(*) into v_admin_count from profiles where role = 'admin';
    if v_admin_count <= 1 then
      raise exception 'cannot remove the last remaining admin';
    end if;
  end if;

  perform set_config('app.privileged', 'on', true);
  update profiles set role = v_next where id = p_user;

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (auth.uid(), 'user_role_changed', 'user', p_user, jsonb_build_object('from', v_current, 'to', v_next));

  perform notify_admins(
    'admin',
    'User role changed',
    coalesce((select email from auth.users where id = p_user), p_user::text)
      || ': ' || v_current || ' -> ' || v_next
  );
end;
$body$;

create or replace function public.admin_suspend_kitchen(p_kitchen uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $body$
declare
  v_owner uuid;
  v_caller_role user_role;
  v_kitchen_name text;
begin
  select role into v_caller_role from profiles where id = auth.uid();
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
     and coalesce(v_caller_role, 'customer') <> 'admin' then
    raise exception 'only an admin may suspend a kitchen';
  end if;

  if coalesce(length(btrim(p_reason)), 0) < 3 then
    raise exception 'a suspension reason is required';
  end if;

  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    perform public.check_rate_limit('admin_suspend_kitchen', 10, interval '5 minutes');
  end if;

  perform set_config('app.privileged', 'on', true);

  update kitchens
     set verification_status = 'suspended', rejection_reason = p_reason, availability = 'paused'
   where id = p_kitchen and verification_status = 'verified'
   returning owner_id, name into v_owner, v_kitchen_name;
  if v_owner is null then
    raise exception 'kitchen is not currently verified (already suspended, never approved, or not found)';
  end if;

  update profiles set verification_status = 'suspended' where id = v_owner;

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (auth.uid(), 'kitchen_suspended', 'kitchen', p_kitchen, jsonb_build_object('reason', p_reason));

  perform notify(v_owner, 'kitchen', 'Kitchen suspended', p_reason);
  perform notify_admins('admin', 'Kitchen suspended', coalesce(v_kitchen_name, p_kitchen::text) || ': ' || p_reason);
end $body$;

-- ---------------------------------------------------------------------------------------
-- 2. Route notify_admins() to an external destination (Slack), not just the in-app inbox.
-- Purely additive and always-safe-by-default: looks up an `admin_alert_webhook_url` Vault
-- secret and no-ops (same as the push-token check in notify()) if it isn't set. Nothing sends
-- anywhere until that secret is created -- see docs/obsidian/Launch-Plan.md item 7 for the
-- follow-up (needs a real Slack incoming-webhook URL, which only the user can provide).
create or replace function public.notify_admins(p_kind text, p_title text, p_body text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_admin uuid;
  v_webhook_url text;
begin
  for v_admin in select id from profiles where role = 'admin' loop
    perform notify(v_admin, p_kind, p_title, p_body);
  end loop;

  select decrypted_secret into v_webhook_url from vault.decrypted_secrets where name = 'admin_alert_webhook_url';
  if v_webhook_url is not null then
    perform net.http_post(
      url := v_webhook_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('text', '[Preppa admin] ' || p_title || coalesce(': ' || p_body, ''))
    );
  end if;
exception when others then
  null; -- an alert-delivery hiccup must never break the caller (same contract as notify())
end;
$$;
revoke all on function public.notify_admins(text, text, text) from public, anon, authenticated;
grant execute on function public.notify_admins(text, text, text) to service_role;

-- ---------------------------------------------------------------------------------------
-- 3. Anomaly detection. The underlying data already exists (audit_log for role/suspension
-- churn, the Stripe-sync `stripe.charges`/`stripe.refunds` mirror tables for money-movement
-- anomalies) -- this just queries it on a schedule and alerts once per anomaly per window,
-- using a row in audit_log itself (action='anomaly_alerted') as the dedupe marker so a
-- 15-minute cron tick doesn't re-alert on the same burst every time it runs.
create or replace function public.detect_admin_anomalies()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid;
  v_count int;
  v_kitchen uuid;
  v_kitchen_name text;
  v_customer text;
  v_amount bigint;
begin
  -- Role-escalation bursts: same admin changing >=3 roles in 30 minutes.
  for v_actor, v_count in
    select actor_id, count(*) from audit_log
    where action = 'user_role_changed' and created_at > now() - interval '30 minutes'
    group by actor_id having count(*) >= 3
  loop
    if not exists (
      select 1 from audit_log
      where action = 'anomaly_alerted' and entity = 'user' and entity_id = v_actor
        and meta->>'kind' = 'role_escalation_burst' and created_at > now() - interval '30 minutes'
    ) then
      perform notify_admins('admin', 'Unusual admin activity',
        v_count || ' role changes by the same admin in the last 30 minutes.');
      insert into audit_log (actor_id, action, entity, entity_id, meta)
      values (null, 'anomaly_alerted', 'user', v_actor, jsonb_build_object('kind', 'role_escalation_burst', 'count', v_count));
    end if;
  end loop;

  -- Kitchen suspend/reinstate churn: same kitchen toggled >=3 times in 24 hours.
  for v_kitchen, v_count in
    select entity_id, count(*) from audit_log
    where action in ('kitchen_suspended', 'kitchen_reinstated') and created_at > now() - interval '24 hours'
    group by entity_id having count(*) >= 3
  loop
    if not exists (
      select 1 from audit_log
      where action = 'anomaly_alerted' and entity = 'kitchen' and entity_id = v_kitchen
        and meta->>'kind' = 'suspend_churn' and created_at > now() - interval '24 hours'
    ) then
      select name into v_kitchen_name from kitchens where id = v_kitchen;
      perform notify_admins('admin', 'Kitchen suspend/reinstate churn',
        coalesce(v_kitchen_name, v_kitchen::text) || ' toggled suspended/reinstated ' || v_count || ' times in 24 hours.');
      insert into audit_log (actor_id, action, entity, entity_id, meta)
      values (null, 'anomaly_alerted', 'kitchen', v_kitchen, jsonb_build_object('kind', 'suspend_churn', 'count', v_count));
    end if;
  end loop;

  -- Unusual refund volume: only meaningful once the Stripe sync mirror tables exist (hosted only).
  if to_regclass('stripe.refunds') is not null then
    select count(*), coalesce(sum(amount), 0) into v_count, v_amount
    from stripe.refunds
    where to_timestamp(created) > now() - interval '1 hour';

    if v_count >= 5 and not exists (
      select 1 from audit_log
      where action = 'anomaly_alerted' and entity = 'platform' and meta->>'kind' = 'refund_volume'
        and created_at > now() - interval '1 hour'
    ) then
      perform notify_admins('admin', 'Unusual refund volume',
        v_count || ' refunds totaling $' || to_char(v_amount / 100.0, 'FM999999990.00') || ' in the last hour.');
      insert into audit_log (actor_id, action, entity, entity_id, meta)
      values (null, 'anomaly_alerted', 'platform', null, jsonb_build_object('kind', 'refund_volume', 'count', v_count));
    end if;
  end if;

  -- Repeated payment failures: same customer with >=3 failed charges in 1 hour.
  if to_regclass('stripe.charges') is not null then
    for v_customer, v_count in
      select customer, count(*) from stripe.charges
      where status = 'failed' and customer is not null and to_timestamp(created) > now() - interval '1 hour'
      group by customer having count(*) >= 3
    loop
      if not exists (
        select 1 from audit_log
        where action = 'anomaly_alerted' and entity = 'stripe_customer' and meta->>'stripe_customer_id' = v_customer
          and meta->>'kind' = 'repeated_payment_failure' and created_at > now() - interval '1 hour'
      ) then
        perform notify_admins('admin', 'Repeated payment failures',
          v_count || ' failed charges for the same customer (' || v_customer || ') in the last hour.');
        insert into audit_log (actor_id, action, entity, entity_id, meta)
        values (null, 'anomaly_alerted', 'stripe_customer', null,
                jsonb_build_object('kind', 'repeated_payment_failure', 'count', v_count, 'stripe_customer_id', v_customer));
      end if;
    end loop;
  end if;
end;
$$;
revoke all on function public.detect_admin_anomalies() from public, anon, authenticated;
grant execute on function public.detect_admin_anomalies() to service_role;

-- Schedule it. pg_cron only exists on the hosted project, so this is a guarded no-op locally/CI,
-- matching every other cron.schedule call in this codebase.
do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.unschedule('detect-admin-anomalies')
      where exists (select 1 from cron.job where jobname = 'detect-admin-anomalies');
    perform cron.schedule(
      'detect-admin-anomalies',
      '*/15 * * * *',
      $job$ select public.detect_admin_anomalies(); $job$
    );
  end if;
end $$;
