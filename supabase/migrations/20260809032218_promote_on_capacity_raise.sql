CREATE OR REPLACE FUNCTION public.set_kitchen_capacity(p_max integer, p_day text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_kitchen uuid; v_date date;
begin
  select id into v_kitchen from kitchens where owner_id = auth.uid() and verification_status = 'verified' order by created_at limit 1;
  if v_kitchen is null then raise exception 'no kitchen for caller'; end if;
  if p_max is null then
    delete from kitchen_capacity where kitchen_id = v_kitchen and delivery_day = coalesce(p_day,'');
  else
    if p_max < 0 then raise exception 'capacity must be >= 0'; end if;
    insert into kitchen_capacity(kitchen_id, delivery_day, max_portions_per_day)
      values(v_kitchen, coalesce(p_day,''), p_max)
      on conflict (kitchen_id, delivery_day) do update set max_portions_per_day = excluded.max_portions_per_day, updated_at = now();
  end if;
  -- Capacity just went up (or the cap was removed) -- anyone waitlisted (skipped) for this
  -- kitchen's near-future delivery dates may now fit. Scan the next 14 days only (cheap,
  -- bounded) rather than all history.
  for v_date in select generate_series(current_date, current_date + 13, interval '1 day')::date loop
    perform promote_waitlisted_cycles(v_kitchen, v_date);
  end loop;
end $function$;
