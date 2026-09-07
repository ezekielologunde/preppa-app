
-- Defense-in-depth for the advisor's SECURITY DEFINER exposure findings.
-- Trigger functions: never legitimately RPC-callable (triggers run as owner, so
-- revoking EXECUTE cannot break them). Revoke from everyone.
do $$
declare r record;
begin
  for r in select oid::regprocedure as sig from pg_proc
           where pronamespace='public'::regnamespace
             and proname in ('handle_new_user','rls_auto_enable','reconcile_paid_pi')
  loop execute format('revoke execute on function %s from public, anon, authenticated', r.sig); end loop;

  -- Post-auth action / admin RPCs: keep them for authenticated (the app uses them),
  -- but the anonymous role has no business calling them. NB: is_kitchen_orderable /
  -- is_kitchen_owner are intentionally NOT touched — they are used inside RLS policies
  -- that anonymous browsing depends on.
  for r in select oid::regprocedure as sig from pg_proc
           where pronamespace='public'::regnamespace
             and proname in ('admin_application_detail','advance_order_status','decline_order','kitchen_earnings_summary','request_prepper_application')
  loop execute format('revoke execute on function %s from anon', r.sig); end loop;
end $$;
