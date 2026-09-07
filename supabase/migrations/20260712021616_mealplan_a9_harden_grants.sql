-- Phase A m9: Supabase default privileges auto-grant EXECUTE to anon+authenticated on
-- every new function, so revoke-from-public was not enough. Lock down explicitly.

-- capacity funcs: service-role only (called by cron/edge, never a client)
revoke execute on function reserve_capacity(uuid,date,int,text,uuid) from anon, authenticated;
revoke execute on function release_capacity(text,uuid)              from anon, authenticated;

-- customer RPCs: authenticated only (each self-authorizes via owns_subscription); no anon
revoke execute on function select_meals(uuid,jsonb)          from anon;
revoke execute on function swap_meal(uuid,uuid,uuid)         from anon;
revoke execute on function skip_cycle(uuid)                  from anon;
revoke execute on function pause_subscription(uuid,int,date) from anon;
revoke execute on function resume_subscription(uuid)         from anon;
revoke execute on function cancel_subscription(uuid,boolean) from anon;
revoke execute on function update_preferences(uuid,text[],text[],text[],int,int,text,int,text) from anon;

-- ownership helpers are only ever evaluated inside `to authenticated` RLS policies
revoke execute on function owns_subscription(uuid)      from anon;
revoke execute on function cook_owns_subscription(uuid) from anon;
