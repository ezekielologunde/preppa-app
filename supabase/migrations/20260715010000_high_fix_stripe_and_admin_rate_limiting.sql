-- Fixes a High finding from the checklist security audit (2026-07-14): no rate limiting
-- existed on any Stripe/Mux-calling Edge Function -- payment-methods' setup-intent action
-- is a textbook card-testing-fraud mechanism, and every other user-invoked Stripe/Mux call
-- (PaymentIntents, Transfers, refunds, subscription mutation, live-stream start) was equally
-- unthrottled -- nor on any state-mutating admin RPC, where a compromised admin JWT could
-- script a tight loop to mass-suspend kitchens or mass-change roles with nothing slowing it
-- down. No generic rate-limit primitive existed to build on: messages_rate_limit (see
-- 20260714080300) counts rows in its own domain table (messages), which doesn't generalize
-- to Edge-Function-invoked or RPC-invoked actions with no natural per-action table. This adds
-- one shared table + check function, reusing that trigger's counting idiom and its
-- `raise exception 'rate_limit: ...'` convention so callers can pattern-match consistently.

create table if not exists public.rate_limits (
  id bigint generated always as identity primary key,
  subject_id uuid not null,
  action text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limits_subject_action_time_idx
  on public.rate_limits (subject_id, action, created_at);

-- Direct client access is never legitimate -- only check_rate_limit (security definer) should
-- touch this table. RLS enabled with zero policies = default-deny for anon and authenticated.
alter table public.rate_limits enable row level security;

-- Call at the top of a sensitive path (an admin RPC directly, or an Edge Function via
-- db.rpc()). Atomically checks the caller's recent attempt count for p_action and records
-- this attempt in the same statement, so a burst gets capped at p_max_count (+ whatever ran
-- concurrently in the same instant) rather than growing unbounded -- exact-to-the-request
-- precision isn't the bar here, "orders of magnitude slower than an unthrottled loop" is,
-- matching the precision of this project's existing rate limits (messages_rate_limit,
-- send_kitchen_broadcast's 3/day check).
--
-- p_subject is optional and exists ONLY for Edge Functions: they already validate the caller's
-- JWT themselves (db.auth.getUser(jwt)) and then talk to Postgres through the service-role
-- admin client, which carries no user JWT context -- auth.uid() would be null there, not the
-- caller's id. Every admin RPC in this file instead calls this with p_subject omitted, since
-- those run inside the calling admin's own JWT/request context, where auth.uid() already
-- resolves correctly (consistent with how they do their own role checks). Restricting
-- p_subject to service_role callers stops a regular authenticated user from passing someone
-- else's id to fabricate rate-limit noise against another account.
create or replace function public.check_rate_limit(p_action text, p_max_count int, p_window interval, p_subject uuid default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $body$
declare
  v_is_service boolean := current_setting('request.jwt.claim.role', true) = 'service_role';
  v_subject uuid;
  v_recent int;
begin
  if p_subject is not null then
    if not v_is_service then
      raise exception 'rate_limit: explicit subject is only allowed for service_role callers';
    end if;
    v_subject := p_subject;
  else
    v_subject := auth.uid();
  end if;

  if v_subject is null then
    raise exception 'rate_limit: unauthenticated';
  end if;

  select count(*) into v_recent
  from rate_limits
  where subject_id = v_subject and action = p_action and created_at > now() - p_window;

  if v_recent >= p_max_count then
    raise exception 'rate_limit: too many attempts, please slow down and try again shortly';
  end if;

  insert into rate_limits (subject_id, action) values (v_subject, p_action);
end;
$body$;

revoke all on function public.check_rate_limit(text, int, interval, uuid) from public, anon;
grant execute on function public.check_rate_limit(text, int, interval, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------
-- Wire into the 4 state-mutating admin RPCs the audit named/implied ("admin_suspend_kitchen,
-- admin_set_user_role, etc." -- approve_kitchen is the same class of admin-gated mutation
-- and was found alongside them). 10 actions / 5 minutes per admin per action-type: enough
-- for a real moderation session (reviewing a backlog of suspensions or applications), far
-- below what a scripted mass-suspend/mass-demote loop would need. Skipped for service_role
-- callers -- these RPCs are also invoked by trusted internal/worker contexts (per their
-- existing role check's service_role bypass), and auth.uid() is null there, so an
-- unconditional check would incorrectly reject legitimate service-role calls.
-- ---------------------------------------------------------------------------------------

-- NOTE: admin_suspend_kitchen/admin_reinstate_kitchen bodies below are copied VERBATIM from
-- pg_get_functiondef() against the live project (2026-07-15), not from this repo's vendored
-- copy -- the two had drifted (live uses rejection_reason not suspension_reason, also syncs
-- kitchens.availability and profiles.verification_status, different notify() text). Applying
-- the vendored version instead would have silently regressed live behavior and broken kitchen
-- suspension outright (wrong column name). Only the rate-limit check is new here.

create or replace function public.admin_suspend_kitchen(p_kitchen uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $body$
declare
  v_owner uuid;
  v_caller_role user_role;
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
   returning owner_id into v_owner;
  if v_owner is null then
    raise exception 'kitchen is not currently verified (already suspended, never approved, or not found)';
  end if;

  update profiles set verification_status = 'suspended' where id = v_owner;

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (auth.uid(), 'kitchen_suspended', 'kitchen', p_kitchen, jsonb_build_object('reason', p_reason));

  perform notify(v_owner, 'kitchen', 'Kitchen suspended', p_reason);
end $body$;

create or replace function public.admin_reinstate_kitchen(p_kitchen uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $body$
declare
  v_owner uuid;
  v_caller_role user_role;
begin
  select role into v_caller_role from profiles where id = auth.uid();
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
     and coalesce(v_caller_role, 'customer') <> 'admin' then
    raise exception 'only an admin may reinstate a kitchen';
  end if;

  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    perform public.check_rate_limit('admin_reinstate_kitchen', 10, interval '5 minutes');
  end if;

  perform set_config('app.privileged', 'on', true);

  update kitchens
     set verification_status = 'verified', rejection_reason = null, availability = 'open'
   where id = p_kitchen and verification_status = 'suspended'
   returning owner_id into v_owner;
  if v_owner is null then
    raise exception 'kitchen is not currently suspended';
  end if;

  update profiles set verification_status = 'verified' where id = v_owner;

  insert into audit_log (actor_id, action, entity, entity_id)
  values (auth.uid(), 'kitchen_reinstated', 'kitchen', p_kitchen);

  perform notify(v_owner, 'kitchen', 'Kitchen reinstated', 'Your kitchen has been reinstated and can accept orders again.');
end $body$;

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
end;
$body$;

create or replace function public.approve_kitchen(p_kitchen uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $body2$
declare
  v_owner uuid;
  v_caller_role user_role;
begin
  select role into v_caller_role from profiles where id = auth.uid();
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
     and coalesce(v_caller_role, 'customer') <> 'admin' then
    raise exception 'only an admin may approve a kitchen';
  end if;

  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    perform public.check_rate_limit('approve_kitchen', 10, interval '5 minutes');
  end if;

  perform set_config('app.privileged', 'on', true);

  update kitchens
     set verification_status = 'verified', approved_at = now(), availability = 'open'
   where id = p_kitchen and verification_status = 'pending'
   returning owner_id into v_owner;
  if v_owner is null then
    raise exception 'kitchen is not pending review (already decided or not found)';
  end if;

  update profiles set role = 'prepper', verification_status = 'verified' where id = v_owner;

  update verifications
     set status = 'verified', reviewed_by = auth.uid(), reviewed_at = now()
   where subject_id = v_owner and kind = 'kitchen' and status = 'pending';

  insert into audit_log (actor_id, action, entity, entity_id)
  values (auth.uid(), 'kitchen_approved', 'kitchen', p_kitchen);

  perform notify(v_owner, 'kitchen', 'Kitchen approved 🎉',
                 'Your kitchen is verified — you can start listing meals in My Hub.');
end $body2$;
