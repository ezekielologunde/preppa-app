DROP FUNCTION thread_header(uuid);
CREATE FUNCTION public.thread_header(p_thread uuid)
 RETURNS TABLE(thread_id uuid, kitchen_id uuid, counterpart_name text, counterpart_avatar text, context_type text, context_id uuid, i_am_cook boolean, blocked_by_me boolean, blocked boolean, counterpart_last_read_at timestamptz)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select t.id, t.kitchen_id,
    case when t.customer_id = auth.uid() then k.name else coalesce(cp.display_name, 'Customer') end,
    case when t.customer_id = auth.uid() then op.avatar_url else cp.avatar_url end,
    t.context_type, t.context_id,
    (t.customer_id <> auth.uid()),
    exists(select 1 from message_blocks b where b.thread_id = t.id and b.blocked_by = auth.uid() and b.active),
    exists(select 1 from message_blocks b where b.thread_id = t.id and b.active),
    case when t.customer_id = auth.uid() then t.kitchen_last_read_at else t.customer_last_read_at end
  from message_threads t
  join kitchens k on k.id = t.kitchen_id
  left join profiles op on op.id = k.owner_id
  left join profiles cp on cp.id = t.customer_id
  where t.id = p_thread and (t.customer_id = auth.uid() or is_kitchen_owner(t.kitchen_id) or is_admin());
$function$;
revoke execute on function public.thread_header(uuid) from public, anon;
grant execute on function public.thread_header(uuid) to authenticated;
