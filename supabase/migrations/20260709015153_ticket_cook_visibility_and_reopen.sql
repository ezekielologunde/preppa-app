-- Admin-gated cook visibility: a ticket is private to reporter+admins until an admin
-- shares it; then the kitchen owner sees the non-internal thread and can reply.
alter table public.tickets add column if not exists cook_visible boolean not null default false;

-- Additive (permissive) RLS so the kitchen owner can read a shared ticket + its
-- non-internal messages. Reporter-only and admin-RPC paths are unchanged.
create policy tickets_select_cook on public.tickets
  for select to authenticated
  using (cook_visible and public.is_kitchen_owner(kitchen_id));

create policy tmsg_select_cook on public.ticket_messages
  for select to authenticated
  using (
    not is_internal and exists (
      select 1 from tickets t
      where t.id = ticket_id and t.cook_visible and public.is_kitchen_owner(t.kitchen_id)
    )
  );

-- Admin action: share a ticket with the cook (audited, idempotent).
create or replace function public.share_ticket_with_cook(p_ticket uuid)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  update tickets set cook_visible = true, updated_at = now() where id = p_ticket;
  if not found then raise exception 'ticket not found'; end if;
  insert into audit_log (actor_id, action, entity, entity_id)
  values (auth.uid(), 'ticket_shared_with_cook', 'ticket', p_ticket);
end $function$;
revoke execute on function public.share_ticket_with_cook(uuid) from public, anon;
grant execute on function public.share_ticket_with_cook(uuid) to authenticated, service_role;

-- Reply: reporter, admin, or (when shared) the kitchen owner. Non-admins post only
-- non-internal messages; on a 'resolved' ticket a non-admin reply reopens it into the
-- queue; a 'closed' ticket is terminal for non-admins.
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

  select reporter_id, kitchen_id, status, cook_visible
    into v_reporter, v_kitchen, v_status, v_cook_visible
  from tickets where id = p_ticket;
  if v_reporter is null then raise exception 'ticket not found'; end if;

  v_is_cook := coalesce(v_cook_visible, false) and public.is_kitchen_owner(v_kitchen);

  if not (v_is_admin or v_reporter = v_uid or v_is_cook) then
    raise exception 'not allowed';
  end if;
  if v_internal and not v_is_admin then
    raise exception 'only admins can post internal notes';
  end if;
  if not v_is_admin and v_status = 'closed' then
    raise exception 'this ticket is closed — please open a new one';
  end if;

  insert into ticket_messages (ticket_id, author_id, body, is_internal)
  values (p_ticket, v_uid, btrim(p_body), v_internal)
  returning id into v_id;

  if not v_is_admin and v_status = 'resolved' then
    update tickets set status = 'open', updated_at = now() where id = p_ticket;  -- reopen
  else
    update tickets set updated_at = now() where id = p_ticket;
  end if;

  return v_id;
end $function$;
revoke execute on function public.add_ticket_message(uuid, text, boolean) from public, anon;
grant execute on function public.add_ticket_message(uuid, text, boolean) to authenticated, service_role;

-- Admin read RPCs: expose cook_visible (return-type change => drop + recreate + regrant).
drop function if exists public.admin_list_tickets();
create function public.admin_list_tickets()
returns table (
  ticket_id     uuid,
  subject       text,
  category      ticket_category,
  status        ticket_status,
  reporter_name text,
  order_id      uuid,
  kitchen_name  text,
  cook_visible  boolean,
  created_at    timestamptz,
  updated_at    timestamptz
)
language sql stable security definer set search_path to 'public'
as $$
  select t.id, t.subject, t.category, t.status, p.display_name, t.order_id, k.name,
         t.cook_visible, t.created_at, t.updated_at
  from tickets t
  join profiles p on p.id = t.reporter_id
  left join kitchens k on k.id = t.kitchen_id
  where public.is_admin()
  order by (t.status in ('resolved', 'closed')), t.created_at desc;
$$;
revoke execute on function public.admin_list_tickets() from public, anon;
grant execute on function public.admin_list_tickets() to authenticated, service_role;

drop function if exists public.admin_ticket_detail(uuid);
create function public.admin_ticket_detail(p_ticket uuid)
returns table (
  ticket_id     uuid,
  subject       text,
  body          text,
  category      ticket_category,
  status        ticket_status,
  reporter_name text,
  order_id      uuid,
  kitchen_name  text,
  cook_visible  boolean,
  created_at    timestamptz,
  messages      jsonb
)
language sql stable security definer set search_path to 'public'
as $$
  select t.id, t.subject, t.body, t.category, t.status, p.display_name, t.order_id, k.name,
         t.cook_visible, t.created_at,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id', m.id, 'body', m.body, 'is_internal', m.is_internal,
                    'from_admin', (mp.role = 'admin'), 'created_at', m.created_at
                  ) order by m.created_at)
           from ticket_messages m join profiles mp on mp.id = m.author_id
           where m.ticket_id = t.id
         ), '[]'::jsonb)
  from tickets t
  join profiles p on p.id = t.reporter_id
  left join kitchens k on k.id = t.kitchen_id
  where public.is_admin() and t.id = p_ticket;
$$;
revoke execute on function public.admin_ticket_detail(uuid) from public, anon;
grant execute on function public.admin_ticket_detail(uuid) to authenticated, service_role;
