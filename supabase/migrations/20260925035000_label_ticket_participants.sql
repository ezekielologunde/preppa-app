-- Give admins unambiguous participant labels in shared order-support threads.
-- The value is derived inside the admin-only SECURITY DEFINER detail RPC.
create or replace function public.admin_ticket_detail(p_ticket uuid)
returns table (
  ticket_id uuid, subject text, body text, category ticket_category,
  status ticket_status, reporter_name text, order_id uuid, kitchen_name text,
  cook_visible boolean, created_at timestamptz, messages jsonb
)
language sql stable security definer set search_path to 'public'
as $$
  select t.id, t.subject, t.body, t.category, t.status, p.display_name, t.order_id, k.name,
         t.cook_visible, t.created_at,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id', m.id,
                    'body', m.body,
                    'is_internal', m.is_internal,
                    'from_admin', (mp.role = 'admin'),
                    'author_kind', case
                      when mp.role = 'admin' then 'admin'
                      when m.author_id = t.reporter_id then 'reporter'
                      else 'cook'
                    end,
                    'created_at', m.created_at
                  ) order by m.created_at)
           from ticket_messages m
           join profiles mp on mp.id = m.author_id
           where m.ticket_id = t.id
         ), '[]'::jsonb)
  from tickets t
  join profiles p on p.id = t.reporter_id
  left join kitchens k on k.id = t.kitchen_id
  where public.is_admin() and t.id = p_ticket;
$$;

revoke execute on function public.admin_ticket_detail(uuid) from public, anon;
grant execute on function public.admin_ticket_detail(uuid) to authenticated, service_role;
