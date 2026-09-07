-- Phase A m6: ownership helpers + the cutoff guard.

create or replace function owns_subscription(sub_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from subscriptions s where s.id = sub_id and s.customer_id = auth.uid());
$$;

create or replace function cook_owns_subscription(sub_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from subscriptions s join kitchens k on k.id = s.kitchen_id
    where s.id = sub_id and k.owner_id = auth.uid());
$$;

-- Hard guard: customer meal edits allowed ONLY while the cycle is selection_open and
-- before the deadline. System paths (cron/edge, service_role) bypass so they can
-- pre-fill fixed plans at materialization and snapshot at closeout.
create or replace function enforce_selection_window()
returns trigger language plpgsql set search_path to 'public' as $$
declare c subscription_cycles;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return coalesce(NEW, OLD);
  end if;
  select * into c from subscription_cycles where id = coalesce(NEW.cycle_id, OLD.cycle_id);
  if c.status is null then
    raise exception 'cycle not found';
  end if;
  if c.status <> 'selection_open' then
    raise exception 'cycle % is not open for selection (status=%)', c.id, c.status;
  end if;
  if now() >= c.selection_deadline then
    raise exception 'selection deadline has passed for cycle %', c.id;
  end if;
  return coalesce(NEW, OLD);
end $$;

drop trigger if exists cycle_items_window on subscription_cycle_items;
create trigger cycle_items_window
  before insert or update or delete on subscription_cycle_items
  for each row execute function enforce_selection_window();
