-- Messaging M1: 1:1 customer↔cook threads keyed on the (customer,kitchen) relationship.
-- Context (order/subscription/request/box) is a reference, not identity. Mirrors the
-- ticket_messages RLS pattern; messages are append-only; admin-readable for disputes.

create table if not exists message_threads (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references profiles(id) on delete cascade,
  kitchen_id  uuid not null references kitchens(id) on delete cascade,
  context_type text,            -- 'order'|'subscription'|'service_request'|'booking'|'box'
  context_id   uuid,
  last_message_at timestamptz,
  last_message_preview text,
  last_sender_role text,
  customer_last_read_at timestamptz not null default 'epoch',
  kitchen_last_read_at  timestamptz not null default 'epoch',
  customer_archived boolean not null default false,
  kitchen_archived  boolean not null default false,
  created_at timestamptz not null default now(),
  unique (customer_id, kitchen_id)
);
create index if not exists message_threads_customer_idx on message_threads(customer_id, last_message_at desc nulls last);
create index if not exists message_threads_kitchen_idx  on message_threads(kitchen_id,  last_message_at desc nulls last);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references message_threads(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  sender_role text not null check (sender_role in ('customer','kitchen','system')),
  kind text not null default 'text' check (kind in ('text','image','system','broadcast')),
  body text not null check (char_length(body) between 1 and 4000),
  broadcast_id uuid,            -- FK added in M2 when message_broadcasts exists
  created_at timestamptz not null default now()
);
create index if not exists messages_thread_idx on messages(thread_id, created_at desc);

create table if not exists message_blocks (
  thread_id uuid not null references message_threads(id) on delete cascade,
  blocked_by uuid not null references profiles(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (thread_id, blocked_by)
);

alter table message_threads enable row level security;
alter table messages        enable row level security;
alter table message_blocks  enable row level security;

drop policy if exists threads_select on message_threads;
create policy threads_select on message_threads for select to authenticated
  using (customer_id = auth.uid() or is_kitchen_owner(kitchen_id) or is_admin());

drop policy if exists messages_select on messages;
create policy messages_select on messages for select to authenticated
  using (exists (select 1 from message_threads t where t.id = messages.thread_id
                 and (t.customer_id = auth.uid() or is_kitchen_owner(t.kitchen_id) or is_admin())));

drop policy if exists messages_insert on messages;
create policy messages_insert on messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (select 1 from message_threads t where t.id = messages.thread_id
                and (t.customer_id = auth.uid() or is_kitchen_owner(t.kitchen_id))
                and not exists (select 1 from message_blocks b where b.thread_id = t.id and b.active)));

drop policy if exists blocks_select on message_blocks;
create policy blocks_select on message_blocks for select to authenticated
  using (exists (select 1 from message_threads t where t.id = message_blocks.thread_id
                 and (t.customer_id = auth.uid() or is_kitchen_owner(t.kitchen_id) or is_admin())));

-- sender_role is derived server-side (can't be spoofed); service_role inserts trusted (M2 broadcast)
create or replace function set_message_sender_role() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare t message_threads;
begin
  if coalesce(auth.role(),'') = 'service_role' then return new; end if;
  select * into t from message_threads where id = new.thread_id;
  if t.id is null then raise exception 'thread not found'; end if;
  if new.sender_id <> auth.uid() then raise exception 'cannot send as another user'; end if;
  if t.customer_id = auth.uid() then new.sender_role := 'customer';
  elsif is_kitchen_owner(t.kitchen_id) then new.sender_role := 'kitchen';
  else raise exception 'not a participant'; end if;
  return new;
end $$;
drop trigger if exists message_sender_role on messages;
create trigger message_sender_role before insert on messages for each row execute function set_message_sender_role();

-- denormalize last message + notify recipient (only on a read->unread transition, to dedupe)
create or replace function on_message_insert() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare t message_threads; v_recipient uuid; v_prev_unread boolean;
begin
  select * into t from message_threads where id = new.thread_id;
  if new.sender_role = 'customer' then v_recipient := (select owner_id from kitchens where id = t.kitchen_id);
  else v_recipient := t.customer_id; end if;
  v_prev_unread := t.last_message_at is not null and (
    (new.sender_role = 'customer'  and t.kitchen_last_read_at  < t.last_message_at) or
    (new.sender_role <> 'customer' and t.customer_last_read_at < t.last_message_at));
  update message_threads set last_message_at = new.created_at, last_message_preview = left(new.body,140),
    last_sender_role = new.sender_role where id = new.thread_id;
  if v_recipient is not null and v_recipient <> new.sender_id and not v_prev_unread then
    perform notify(v_recipient, 'message', 'New message', left(new.body,120));
  end if;
  return new;
end $$;
drop trigger if exists message_after_insert on messages;
create trigger message_after_insert after insert on messages for each row execute function on_message_insert();

-- append-only guard (mirror ledger governance)
drop trigger if exists messages_no_update on messages;
drop trigger if exists messages_no_delete on messages;
create trigger messages_no_update before update on messages for each row execute function block_mutation();
create trigger messages_no_delete before delete on messages for each row execute function block_mutation();

-- RPCs
create or replace function open_thread(p_kitchen uuid, p_ctx_type text default null, p_ctx_id uuid default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare tid uuid;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if is_kitchen_owner(p_kitchen) then raise exception 'cannot message your own kitchen'; end if;
  insert into message_threads(customer_id, kitchen_id, context_type, context_id)
    values(auth.uid(), p_kitchen, p_ctx_type, p_ctx_id)
    on conflict (customer_id, kitchen_id) do update
      set context_type = coalesce(message_threads.context_type, excluded.context_type),
          context_id   = coalesce(message_threads.context_id,   excluded.context_id)
    returning id into tid;
  return tid;
end $$;

create or replace function mark_thread_read(p_thread uuid) returns void language plpgsql security definer set search_path to 'public' as $$
begin
  update message_threads set
    customer_last_read_at = case when customer_id = auth.uid() then now() else customer_last_read_at end,
    kitchen_last_read_at  = case when is_kitchen_owner(kitchen_id) then now() else kitchen_last_read_at end
  where id = p_thread and (customer_id = auth.uid() or is_kitchen_owner(kitchen_id));
end $$;

create or replace function report_message(p_message uuid, p_reason text default null) returns void language plpgsql security definer set search_path to 'public' as $$
declare m messages; t message_threads;
begin
  select * into m from messages where id = p_message;
  if m.id is null then raise exception 'message not found'; end if;
  select * into t from message_threads where id = m.thread_id;
  if not (t.customer_id = auth.uid() or is_kitchen_owner(t.kitchen_id)) then raise exception 'not a participant'; end if;
  insert into audit_log(actor_id, action, entity, entity_id, meta)
    values(auth.uid(), 'report_message', 'message', p_message, jsonb_build_object('reason', p_reason, 'thread_id', m.thread_id));
end $$;

create or replace function set_thread_block(p_thread uuid, p_blocked boolean) returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not exists (select 1 from message_threads t where t.id = p_thread and (t.customer_id = auth.uid() or is_kitchen_owner(t.kitchen_id)))
    then raise exception 'not a participant'; end if;
  if p_blocked then
    insert into message_blocks(thread_id, blocked_by, active) values(p_thread, auth.uid(), true)
      on conflict (thread_id, blocked_by) do update set active = true;
  else
    update message_blocks set active = false where thread_id = p_thread and blocked_by = auth.uid();
  end if;
end $$;

revoke all on function open_thread(uuid,text,uuid), mark_thread_read(uuid), report_message(uuid,text), set_thread_block(uuid,boolean) from public, anon;
grant execute on function open_thread(uuid,text,uuid)   to authenticated, service_role;
grant execute on function mark_thread_read(uuid)         to authenticated, service_role;
grant execute on function report_message(uuid,text)      to authenticated, service_role;
grant execute on function set_thread_block(uuid,boolean) to authenticated, service_role;

-- Realtime: per-thread messages channel + notifications channel for the list/badge
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notifications;
