
-- Revoking FROM anon is a no-op while PUBLIC still grants EXECUTE (anon inherits PUBLIC).
-- Correct pattern: revoke the blanket PUBLIC grant, then re-grant only to authenticated.
do $$
declare r record;
begin
  for r in select oid::regprocedure as sig from pg_proc
           where pronamespace='public'::regnamespace
             and proname in ('admin_application_detail','advance_order_status','decline_order','kitchen_earnings_summary','request_prepper_application')
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;
