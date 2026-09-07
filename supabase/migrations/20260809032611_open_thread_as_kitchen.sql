CREATE OR REPLACE FUNCTION public.open_thread_as_kitchen(p_customer uuid, p_ctx_type text DEFAULT NULL::text, p_ctx_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_kitchen uuid; v_eligible boolean; tid uuid;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  select id into v_kitchen from kitchens where owner_id = auth.uid() and verification_status = 'verified' order by created_at limit 1;
  if v_kitchen is null then raise exception 'no verified kitchen for caller'; end if;
  if p_customer = auth.uid() then raise exception 'cannot message yourself'; end if;

  -- A cook can only start a thread with a customer they have an actual relationship with
  -- (has ordered, subscribed, booked, or requested a quote from this kitchen) -- prevents
  -- cold-outreach spam to arbitrary customers.
  select exists(
    select 1 from orders where customer_id = p_customer and kitchen_id = v_kitchen
    union all
    select 1 from subscriptions where customer_id = p_customer and kitchen_id = v_kitchen
    union all
    select 1 from bookings where customer_id = p_customer and kitchen_id = v_kitchen
    union all
    select 1 from service_requests sr join quotes q on q.request_id = sr.id
      where sr.customer_id = p_customer and q.kitchen_id = v_kitchen
  ) into v_eligible;
  if not v_eligible then raise exception 'no relationship with this customer yet'; end if;

  insert into message_threads(customer_id, kitchen_id, context_type, context_id)
    values(p_customer, v_kitchen, p_ctx_type, p_ctx_id)
    on conflict (customer_id, kitchen_id) do update
      set context_type = coalesce(message_threads.context_type, excluded.context_type),
          context_id   = coalesce(message_threads.context_id,   excluded.context_id)
    returning id into tid;
  return tid;
end $function$;

revoke execute on function public.open_thread_as_kitchen(uuid, text, uuid) from public;
grant execute on function public.open_thread_as_kitchen(uuid, text, uuid) to authenticated;
