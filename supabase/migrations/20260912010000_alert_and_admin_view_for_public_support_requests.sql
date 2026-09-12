-- Real gap found while working Launch-Plan item 14's last open sub-item ("safety report"
-- confirmation notifications not traced to a call site"). Traced it fully this time: there is no
-- separate "safety report" flow -- it's `public_support_requests` (20260714193000), the
-- anon-writable intake table for support/safety/abuse reports from the marketing site
-- (report_type in 'support'/'safety'/'abuse', immediate_risk boolean). It has zero rows today
-- and, more importantly, zero alerting -- unlike every other event in this app (role changes,
-- kitchen suspensions, payout needs_review all call notify_admins()). A safety/abuse report
-- marked immediate_risk landing in a table nobody is notified about is a real gap. There is also
-- no admin screen for it at all -- an admin would have to query the table directly.
--
-- Fixes both using existing, already-decided infrastructure (notify_admins()'s in-app+push+email
-- channel) -- no new product decision needed here, unlike the broader "build real transactional
-- email for order-lifecycle events" question this item separately flagged as still open:
-- 1. AFTER INSERT trigger -> notify_admins(), escalated wording for immediate_risk/safety/abuse.
-- 2. admin_list_support_requests()/admin_set_support_request_status() RPCs, same is_admin()-gated
--    + audit_log pattern as the existing ticket RPCs, so a real admin screen can be built on them
--    (see app/admin/support-requests.tsx).
create or replace function public.notify_admins_on_public_support_request()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_title text;
begin
  v_title := case
    when new.immediate_risk then '🚨 Urgent ' || new.report_type || ' report ' || coalesce(new.ref, '')
    when new.report_type = 'safety' then 'New safety report ' || coalesce(new.ref, '')
    when new.report_type = 'abuse' then 'New abuse report ' || coalesce(new.ref, '')
    else 'New support request ' || coalesce(new.ref, '')
  end;
  perform public.notify_admins(
    'support_request',
    v_title,
    coalesce(nullif(left(new.subject, 100), ''), left(new.description, 140))
  );
  return new;
exception when others then
  return new; -- never block the insert on an alert-delivery hiccup (same contract as notify())
end;
$$;

drop trigger if exists trg_notify_admins_on_public_support_request on public.public_support_requests;
create trigger trg_notify_admins_on_public_support_request
  after insert on public.public_support_requests
  for each row execute function public.notify_admins_on_public_support_request();

create or replace function public.admin_list_support_requests()
returns table (
  id uuid, ref text, report_type text, name text, email text, role text, category text,
  subject text, description text, related_ref text, immediate_risk boolean, status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select r.id, r.ref, r.report_type, r.name, r.email, r.role, r.category, r.subject,
         r.description, r.related_ref, r.immediate_risk, r.status, r.created_at
  from public_support_requests r
  where public.is_admin()
  order by r.immediate_risk desc, (r.status in ('resolved','closed')), r.created_at desc;
$$;

create or replace function public.admin_set_support_request_status(p_request uuid, p_status text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if p_status not in ('submitted','acknowledged','investigating','resolved','closed') then
    raise exception 'invalid status';
  end if;

  update public_support_requests set status = p_status where id = p_request;
  if not found then raise exception 'request not found'; end if;

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (auth.uid(), 'support_request_status_changed', 'public_support_request', p_request, jsonb_build_object('status', p_status));
end;
$$;

revoke all on function public.admin_list_support_requests() from public, anon;
grant execute on function public.admin_list_support_requests() to authenticated, service_role;
revoke all on function public.admin_set_support_request_status(uuid, text) from public, anon;
grant execute on function public.admin_set_support_request_status(uuid, text) to authenticated, service_role;

-- Same item 14 pass, the other half: the authenticated order-linked `tickets` flow
-- (create_ticket(), 20260708063306) never confirmed to the reporter that their report was
-- received -- it wrote the row and an audit_log entry, then returned silently. Adds the one line
-- this was missing, using the same notify() in-app+push channel every other order/kitchen event
-- already uses -- not a new decision, just a call that was never added.
create or replace function public.create_ticket(
  p_order uuid, p_category ticket_category, p_subject text, p_body text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid(); v_kitchen uuid; v_id uuid;
begin
  if v_uid is null then raise exception 'must be signed in'; end if;
  if length(coalesce(btrim(p_subject), '')) < 3 then raise exception 'add a short subject'; end if;
  if length(coalesce(btrim(p_body), '')) < 3 then raise exception 'please describe the issue'; end if;

  select o.kitchen_id into v_kitchen from orders o where o.id = p_order;
  if v_kitchen is null then raise exception 'order not found'; end if;

  if not exists (
    select 1 from orders o
    where o.id = p_order and (o.customer_id = v_uid or public.is_kitchen_owner(o.kitchen_id))
  ) then
    raise exception 'you are not a party to this order';
  end if;

  if exists (
    select 1 from tickets t
    where t.order_id = p_order and t.reporter_id = v_uid and t.status in ('open', 'in_progress')
  ) then
    raise exception 'you already have an open ticket for this order';
  end if;

  insert into tickets (reporter_id, order_id, kitchen_id, category, subject, body)
  values (v_uid, p_order, v_kitchen, p_category, btrim(p_subject), btrim(p_body))
  returning id into v_id;

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (v_uid, 'ticket_created', 'ticket', v_id, jsonb_build_object('order', p_order, 'category', p_category));

  perform public.notify(v_uid, 'ticket', 'We got your report', 'We''ll follow up on "' || btrim(p_subject) || '" soon.');

  return v_id;
end $function$;
