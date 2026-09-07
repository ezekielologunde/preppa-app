
-- Store a kitchen's approximate coordinates (owner-only). Rounds to ~3 decimals
-- (~110 m) so the stored point is neighborhood-approximate, not an exact address.
create or replace function public.set_kitchen_geo(p_kitchen uuid, p_lat double precision, p_lng double precision)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then raise exception 'must be signed in'; end if;
  if p_lat is null or p_lng is null then return; end if;
  perform set_config('app.privileged', 'on', true);
  update kitchens
     set approx_lat = round(p_lat::numeric, 3),
         approx_lng = round(p_lng::numeric, 3)
   where id = p_kitchen and owner_id = auth.uid();
end $$;
revoke execute on function public.set_kitchen_geo(uuid,double precision,double precision) from public, anon;
grant execute on function public.set_kitchen_geo(uuid,double precision,double precision) to authenticated;
