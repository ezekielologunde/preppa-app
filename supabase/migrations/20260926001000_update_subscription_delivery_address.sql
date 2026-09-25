create or replace function public.update_subscription_delivery_address(p_subscription uuid, p_address uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $body$
declare
  v_uid uuid := auth.uid();
  v_address public.addresses%rowtype;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if not exists (
    select 1 from public.subscriptions
    where id = p_subscription and customer_id = v_uid
      and fulfillment = 'delivery' and lifecycle not in ('cancelled', 'completed')
  ) then raise exception 'subscription not found'; end if;

  select * into v_address from public.addresses
  where id = p_address and owner_id = v_uid and kind = 'customer_delivery';
  if not found or nullif(btrim(v_address.line1), '') is null
    or nullif(btrim(v_address.city), '') is null or nullif(btrim(v_address.region), '') is null
    or nullif(btrim(v_address.postal_code), '') is null or v_address.country !~ '^[A-Z]{2}$' then
    raise exception 'choose a complete delivery address';
  end if;

  update public.subscriptions
  set delivery_address_id = v_address.id,
      delivery_address_text = concat_ws(', ', v_address.line1, nullif(v_address.line2, ''),
        concat_ws(' ', concat_ws(', ', v_address.city, v_address.region), v_address.postal_code), v_address.country),
      updated_at = now()
  where id = p_subscription;
end;
$body$;

revoke all on function public.update_subscription_delivery_address(uuid, uuid) from public, anon;
grant execute on function public.update_subscription_delivery_address(uuid, uuid) to authenticated;

create or replace function public.require_active_subscription_delivery_address()
returns trigger
language plpgsql
set search_path to 'public'
as $body$
begin
  if new.fulfillment = 'delivery' and new.lifecycle = 'active'
    and nullif(btrim(new.delivery_address_text), '') is null then
    raise exception 'choose a complete delivery address before activating this subscription';
  end if;
  return new;
end;
$body$;

drop trigger if exists subscriptions_require_delivery_address on public.subscriptions;
create trigger subscriptions_require_delivery_address
before insert or update of fulfillment, lifecycle, delivery_address_text on public.subscriptions
for each row execute function public.require_active_subscription_delivery_address();

revoke all on function public.require_active_subscription_delivery_address() from public, anon, authenticated;
