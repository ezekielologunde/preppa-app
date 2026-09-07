-- Read-side RPCs: resolve the counterpart's display identity server-side (bypasses
-- cross-profile RLS + avoids an N+1 on the client), and compute per-caller unread.

create or replace function list_threads()
returns table(thread_id uuid, kitchen_id uuid, counterpart_name text, counterpart_avatar text,
  context_type text, context_id uuid, last_preview text, last_at timestamptz, last_sender_role text,
  unread boolean, i_am_cook boolean)
language sql security definer set search_path to 'public' as $$
  select t.id, t.kitchen_id,
    case when t.customer_id = auth.uid() then k.name else coalesce(cp.display_name, 'Customer') end,
    case when t.customer_id = auth.uid() then op.avatar_url else cp.avatar_url end,
    t.context_type, t.context_id, t.last_message_preview, t.last_message_at, t.last_sender_role,
    case when t.customer_id = auth.uid()
      then (t.last_message_at > t.customer_last_read_at and coalesce(t.last_sender_role,'') <> 'customer')
      else (t.last_message_at > t.kitchen_last_read_at  and coalesce(t.last_sender_role,'') <> 'kitchen') end,
    (t.customer_id <> auth.uid())
  from message_threads t
  join kitchens k on k.id = t.kitchen_id
  left join profiles op on op.id = k.owner_id
  left join profiles cp on cp.id = t.customer_id
  where (t.customer_id = auth.uid() or is_kitchen_owner(t.kitchen_id))
    and t.last_message_at is not null
  order by t.last_message_at desc;
$$;

create or replace function thread_header(p_thread uuid)
returns table(thread_id uuid, kitchen_id uuid, counterpart_name text, counterpart_avatar text,
  context_type text, context_id uuid, i_am_cook boolean, blocked_by_me boolean, blocked boolean)
language sql security definer set search_path to 'public' as $$
  select t.id, t.kitchen_id,
    case when t.customer_id = auth.uid() then k.name else coalesce(cp.display_name, 'Customer') end,
    case when t.customer_id = auth.uid() then op.avatar_url else cp.avatar_url end,
    t.context_type, t.context_id,
    (t.customer_id <> auth.uid()),
    exists(select 1 from message_blocks b where b.thread_id = t.id and b.blocked_by = auth.uid() and b.active),
    exists(select 1 from message_blocks b where b.thread_id = t.id and b.active)
  from message_threads t
  join kitchens k on k.id = t.kitchen_id
  left join profiles op on op.id = k.owner_id
  left join profiles cp on cp.id = t.customer_id
  where t.id = p_thread and (t.customer_id = auth.uid() or is_kitchen_owner(t.kitchen_id) or is_admin());
$$;

create or replace function my_thread_unread_count()
returns int language sql security definer set search_path to 'public' as $$
  select count(*)::int from message_threads t
  where t.last_message_at is not null and (
    (t.customer_id = auth.uid()    and t.last_message_at > t.customer_last_read_at and coalesce(t.last_sender_role,'') <> 'customer') or
    (is_kitchen_owner(t.kitchen_id) and t.last_message_at > t.kitchen_last_read_at  and coalesce(t.last_sender_role,'') <> 'kitchen'));
$$;

revoke all on function list_threads(), thread_header(uuid), my_thread_unread_count() from public, anon;
grant execute on function list_threads()             to authenticated, service_role;
grant execute on function thread_header(uuid)         to authenticated, service_role;
grant execute on function my_thread_unread_count()    to authenticated, service_role;
