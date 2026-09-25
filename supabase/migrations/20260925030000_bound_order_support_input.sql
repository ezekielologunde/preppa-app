-- Give cancellation requests a first-class queue category and bound all user-authored
-- order-support text at the database boundary. NOT VALID keeps deployment safe if legacy
-- rows exceed the new limits while still enforcing them for every new or updated row.
alter type public.ticket_category add value if not exists 'cancellation' before 'missing_item';

alter table public.tickets
  add constraint tickets_subject_length check (char_length(subject) between 3 and 120) not valid,
  add constraint tickets_body_length check (char_length(body) between 3 and 2000) not valid;

alter table public.ticket_messages
  add constraint ticket_messages_body_length check (char_length(body) between 1 and 2000) not valid;

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
  if length(btrim(p_subject)) > 120 then raise exception 'keep the subject under 120 characters'; end if;
  if length(coalesce(btrim(p_body), '')) < 3 then raise exception 'please describe the issue'; end if;
  if length(btrim(p_body)) > 2000 then raise exception 'keep the description under 2,000 characters'; end if;

  select o.kitchen_id into v_kitchen from orders o where o.id = p_order;
  if v_kitchen is null then raise exception 'order not found'; end if;
  if not exists (
    select 1 from orders o
    where o.id = p_order and (o.customer_id = v_uid or public.is_kitchen_owner(o.kitchen_id))
  ) then raise exception 'you are not a party to this order'; end if;
  if exists (
    select 1 from tickets t
    where t.order_id = p_order and t.reporter_id = v_uid and t.status in ('open', 'in_progress')
  ) then raise exception 'you already have an open ticket for this order'; end if;

  insert into tickets (reporter_id, order_id, kitchen_id, category, subject, body)
  values (v_uid, p_order, v_kitchen, p_category, btrim(p_subject), btrim(p_body))
  returning id into v_id;
  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (v_uid, 'ticket_created', 'ticket', v_id, jsonb_build_object('order', p_order, 'category', p_category));
  perform public.notify(v_uid, 'ticket', 'We got your report', 'We''ll follow up on "' || btrim(p_subject) || '" soon.');
  return v_id;
end $function$;

create or replace function public.add_ticket_message(p_ticket uuid, p_body text, p_internal boolean default false)
returns uuid
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_reporter uuid;
  v_kitchen uuid;
  v_status ticket_status;
  v_cook_visible boolean;
  v_internal boolean := coalesce(p_internal, false);
  v_is_admin boolean := public.is_admin();
  v_is_cook boolean;
  v_id uuid;
begin
  if v_uid is null then raise exception 'must be signed in'; end if;
  if length(coalesce(btrim(p_body), '')) < 1 then raise exception 'empty message'; end if;
  if length(btrim(p_body)) > 2000 then raise exception 'keep the reply under 2,000 characters'; end if;

  select reporter_id, kitchen_id, status, cook_visible
    into v_reporter, v_kitchen, v_status, v_cook_visible
  from tickets where id = p_ticket;
  if v_reporter is null then raise exception 'ticket not found'; end if;
  v_is_cook := coalesce(v_cook_visible, false) and public.is_kitchen_owner(v_kitchen);
  if not (v_is_admin or v_reporter = v_uid or v_is_cook) then raise exception 'not allowed'; end if;
  if v_internal and not v_is_admin then raise exception 'only admins can post internal notes'; end if;
  if not v_is_admin and v_status = 'closed' then raise exception 'this ticket is closed - please open a new one'; end if;

  insert into ticket_messages (ticket_id, author_id, body, is_internal)
  values (p_ticket, v_uid, btrim(p_body), v_internal)
  returning id into v_id;
  if not v_is_admin and v_status = 'resolved' then
    update tickets set status = 'open', updated_at = now() where id = p_ticket;
  else
    update tickets set updated_at = now() where id = p_ticket;
  end if;
  return v_id;
end $function$;

revoke execute on function public.create_ticket(uuid, ticket_category, text, text) from public, anon;
grant execute on function public.create_ticket(uuid, ticket_category, text, text) to authenticated, service_role;
revoke execute on function public.add_ticket_message(uuid, text, boolean) from public, anon;
grant execute on function public.add_ticket_message(uuid, text, boolean) to authenticated, service_role;
