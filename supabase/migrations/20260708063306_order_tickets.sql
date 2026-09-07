-- Order-linked support tickets. RLS policies ship in THIS migration because the
-- rls_auto_enable event trigger force-enables RLS on new tables (locking them
-- until policies exist).

create type ticket_status   as enum ('open', 'in_progress', 'resolved', 'closed');
create type ticket_category as enum ('missing_item', 'wrong_item', 'not_received', 'food_quality', 'payment', 'other');

create table public.tickets (
  id             uuid primary key default gen_random_uuid(),
  reporter_id    uuid not null references profiles(id) on delete cascade,
  order_id       uuid not null references orders(id)   on delete cascade,
  kitchen_id     uuid references kitchens(id)          on delete set null,
  category       ticket_category not null default 'other',
  status         ticket_status   not null default 'open',
  subject        text not null,
  body           text not null,
  assigned_admin uuid references profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  resolved_at    timestamptz
);
create index tickets_status_idx   on public.tickets (status);
create index tickets_reporter_idx on public.tickets (reporter_id);
create index tickets_order_idx    on public.tickets (order_id);

create table public.ticket_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references tickets(id) on delete cascade,
  author_id   uuid not null references profiles(id),
  body        text not null,
  is_internal boolean not null default false,   -- admin-only note, hidden from the reporter
  created_at  timestamptz not null default now()
);
create index ticket_messages_ticket_idx on public.ticket_messages (ticket_id);

create trigger tickets_updated_at before update on public.tickets
  for each row execute function set_updated_at();

alter table public.tickets         enable row level security;
alter table public.ticket_messages enable row level security;

-- Reporters read only their own tickets. Admin reads go through DEFINER RPCs
-- (no broad admin table-read). No INSERT/UPDATE policies: all writes flow through
-- the SECURITY DEFINER RPCs below, so privileged paths are the only mutation path.
create policy tickets_select_own on public.tickets
  for select to authenticated using (reporter_id = auth.uid());

create policy tmsg_select_own on public.ticket_messages
  for select to authenticated using (
    not is_internal
    and exists (select 1 from tickets t where t.id = ticket_id and t.reporter_id = auth.uid())
  );

-- Create a ticket about an order the caller is a party to (customer or kitchen
-- owner). Throttled: one open ticket per order per reporter. auth.uid() only.
create or replace function public.create_ticket(
  p_order uuid, p_category ticket_category, p_subject text, p_body text
) returns uuid
language plpgsql security definer set search_path to 'public'
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

  return v_id;
end $function$;
revoke execute on function public.create_ticket(uuid, ticket_category, text, text) from public, anon;
grant execute on function public.create_ticket(uuid, ticket_category, text, text) to authenticated, service_role;

-- Post a reply. Reporter or admin; internal notes are admin-only.
create or replace function public.add_ticket_message(p_ticket uuid, p_body text, p_internal boolean default false)
returns uuid
language plpgsql security definer set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid(); v_reporter uuid; v_internal boolean := coalesce(p_internal, false); v_id uuid;
begin
  if v_uid is null then raise exception 'must be signed in'; end if;
  if length(coalesce(btrim(p_body), '')) < 1 then raise exception 'empty message'; end if;

  select reporter_id into v_reporter from tickets where id = p_ticket;
  if v_reporter is null then raise exception 'ticket not found'; end if;
  if not (public.is_admin() or v_reporter = v_uid) then raise exception 'not allowed'; end if;
  if v_internal and not public.is_admin() then raise exception 'only admins can post internal notes'; end if;

  insert into ticket_messages (ticket_id, author_id, body, is_internal)
  values (p_ticket, v_uid, btrim(p_body), v_internal)
  returning id into v_id;
  update tickets set updated_at = now() where id = p_ticket;
  return v_id;
end $function$;
revoke execute on function public.add_ticket_message(uuid, text, boolean) from public, anon;
grant execute on function public.add_ticket_message(uuid, text, boolean) to authenticated, service_role;

-- Admin: change status (audited).
create or replace function public.set_ticket_status(p_ticket uuid, p_status ticket_status)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  update tickets
     set status = p_status,
         resolved_at = case when p_status in ('resolved', 'closed') then now() else null end,
         assigned_admin = coalesce(assigned_admin, auth.uid()),
         updated_at = now()
   where id = p_ticket;
  if not found then raise exception 'ticket not found'; end if;

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (auth.uid(), 'ticket_status_changed', 'ticket', p_ticket, jsonb_build_object('status', p_status));
end $function$;
revoke execute on function public.set_ticket_status(uuid, ticket_status) from public, anon;
grant execute on function public.set_ticket_status(uuid, ticket_status) to authenticated, service_role;

-- Admin column-scoped reads (open first).
create or replace function public.admin_list_tickets()
returns table (
  ticket_id     uuid,
  subject       text,
  category      ticket_category,
  status        ticket_status,
  reporter_name text,
  order_id      uuid,
  kitchen_name  text,
  created_at    timestamptz,
  updated_at    timestamptz
)
language sql stable security definer set search_path to 'public'
as $$
  select t.id, t.subject, t.category, t.status, p.display_name, t.order_id, k.name, t.created_at, t.updated_at
  from tickets t
  join profiles p on p.id = t.reporter_id
  left join kitchens k on k.id = t.kitchen_id
  where public.is_admin()
  order by (t.status in ('resolved', 'closed')), t.created_at desc;
$$;
revoke execute on function public.admin_list_tickets() from public, anon;
grant execute on function public.admin_list_tickets() to authenticated, service_role;

create or replace function public.admin_ticket_detail(p_ticket uuid)
returns table (
  ticket_id     uuid,
  subject       text,
  body          text,
  category      ticket_category,
  status        ticket_status,
  reporter_name text,
  order_id      uuid,
  kitchen_name  text,
  created_at    timestamptz,
  messages      jsonb
)
language sql stable security definer set search_path to 'public'
as $$
  select t.id, t.subject, t.body, t.category, t.status, p.display_name, t.order_id, k.name, t.created_at,
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
