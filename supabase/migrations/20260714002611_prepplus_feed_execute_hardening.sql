-- Harden EXECUTE on the new SECURITY DEFINER functions (matches the app's anon-EXECUTE
-- governance). New functions default to PUBLIC execute; lock them down to who actually needs it.

-- Entitlement predicate: only edge fns (service_role) call it via RPC; advance_cycles calls it
-- as its own SECURITY DEFINER (owner) context. No anon/authenticated client path.
revoke execute on function public.is_prepplus_member(uuid) from public, anon, authenticated;
grant execute on function public.is_prepplus_member(uuid) to service_role;

-- Trigger function: only ever runs as a trigger (owner context); never a client RPC.
revoke execute on function public.sync_prepplus_membership() from public, anon, authenticated;

-- Post write RPCs: require a signed-in user (auth.uid()); no anon path.
revoke execute on function public.create_post(text, text, text, uuid) from public, anon;
grant execute on function public.create_post(text, text, text, uuid) to authenticated, service_role;
revoke execute on function public.toggle_post_like(uuid) from public, anon;
grant execute on function public.toggle_post_like(uuid) to authenticated, service_role;
