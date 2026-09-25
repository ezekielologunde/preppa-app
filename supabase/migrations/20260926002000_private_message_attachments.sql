-- Private message attachment storage. Objects are written only by upload-media after it
-- verifies the caller and inserts the message. Participants can create short-lived signed
-- read URLs; no public or direct client write policy exists.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-attachments',
  'message-attachments',
  false,
  8388608,
  array['image/png', 'image/jpeg', 'image/webp', 'image/heic']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists message_attachments_read_participant on storage.objects;
create policy message_attachments_read_participant on storage.objects
for select to authenticated
using (
  bucket_id = 'message-attachments'
  and exists (
    select 1
    from public.message_threads t
    where t.id::text = (storage.foldername(name))[1]
      and (
        t.customer_id = auth.uid()
        or public.is_kitchen_owner(t.kitchen_id)
        or public.is_admin()
      )
  )
);

-- Image messages can only be created by this RPC after upload-media has validated and stored
-- the bytes. This also prevents a direct client insert from making recipients load an
-- arbitrary third-party tracking URL.
create or replace function public.send_message_attachment(p_thread uuid, p_path text)
returns public.messages
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_message public.messages;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if p_path !~ ('^' || p_thread::text || '/message-[0-9]+-[a-z0-9]{6}\.(png|jpg|webp|heic)$') then
    raise exception 'invalid attachment path';
  end if;
  if not exists (
    select 1 from message_threads t
    where t.id = p_thread
      and (t.customer_id = auth.uid() or is_kitchen_owner(t.kitchen_id))
      and not exists (select 1 from message_blocks b where b.thread_id = t.id and b.active)
  ) then
    raise exception 'not an active conversation participant';
  end if;
  perform set_config('app.trusted_msg_kind', 'image', true);
  insert into messages(thread_id, sender_id, kind, body)
  values (p_thread, auth.uid(), 'image', p_path)
  returning * into v_message;
  return v_message;
end
$function$;

revoke all on function public.send_message_attachment(uuid, text) from public, anon;
grant execute on function public.send_message_attachment(uuid, text) to authenticated;

create or replace function public.enforce_message_kind()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.kind in ('image', 'broadcast', 'system')
     and coalesce(current_setting('app.trusted_msg_kind', true), '') <> new.kind then
    raise exception 'kind % may not be set directly', new.kind;
  end if;
  return new;
end
$function$;

-- Attachment paths are private implementation data. Conversation lists and device
-- notifications show a useful label without leaking the object path.
create or replace function public.on_message_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t message_threads;
  v_recipient uuid;
  v_prev_unread boolean;
  v_title text;
  v_preview text := case when new.kind = 'image' then 'Photo' else new.body end;
begin
  select * into t from message_threads where id = new.thread_id;
  if new.sender_role = 'customer' then
    v_recipient := (select owner_id from kitchens where id = t.kitchen_id);
  else
    v_recipient := t.customer_id;
  end if;
  v_prev_unread := t.last_message_at is not null and (
    (new.sender_role = 'customer' and t.kitchen_last_read_at < t.last_message_at)
    or (new.sender_role <> 'customer' and t.customer_last_read_at < t.last_message_at)
  );
  update message_threads set
    last_message_at = new.created_at,
    last_message_preview = left(v_preview, 140),
    last_sender_role = new.sender_role,
    customer_last_read_at = case when new.sender_role = 'customer' then new.created_at else customer_last_read_at end,
    kitchen_last_read_at = case when new.sender_role = 'kitchen' then new.created_at else kitchen_last_read_at end
  where id = new.thread_id;
  if v_recipient is not null and v_recipient <> new.sender_id and not v_prev_unread then
    if new.sender_role = 'customer' then
      select display_name into v_title from profiles where id = new.sender_id;
      v_title := coalesce(v_title, 'A customer');
    else
      select name into v_title from kitchens where id = t.kitchen_id;
      v_title := coalesce(v_title, 'New message');
    end if;
    perform notify(v_recipient, 'message', v_title, left(v_preview, 120));
  end if;
  return new;
end
$function$;
