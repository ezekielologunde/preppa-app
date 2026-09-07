-- Phase A m7: RLS. Reads for the owning customer + the kitchen owner; all writes are
-- service-role/RPC only (SECURITY DEFINER functions bypass RLS; the window trigger still fires).
alter table subscription_cycles       enable row level security;
alter table subscription_cycle_items  enable row level security;
alter table subscription_preferences  enable row level security;
alter table subscription_events       enable row level security;
alter table kitchen_capacity          enable row level security;
alter table capacity_reservations     enable row level security;

-- cycles: owning customer or kitchen owner may read
drop policy if exists cycles_read on subscription_cycles;
create policy cycles_read on subscription_cycles for select to authenticated
  using (owns_subscription(subscription_id) or is_kitchen_owner(kitchen_id));

-- cycle items: same read scope, resolved through the parent cycle
drop policy if exists cycle_items_read on subscription_cycle_items;
create policy cycle_items_read on subscription_cycle_items for select to authenticated
  using (cycle_id in (
    select c.id from subscription_cycles c
    where owns_subscription(c.subscription_id) or is_kitchen_owner(c.kitchen_id)));

-- preferences: owning customer + the cook serving them (allergens/notes for prep)
drop policy if exists prefs_read on subscription_preferences;
create policy prefs_read on subscription_preferences for select to authenticated
  using (owns_subscription(subscription_id) or cook_owns_subscription(subscription_id));

-- events: owning customer + the cook
drop policy if exists events_read on subscription_events;
create policy events_read on subscription_events for select to authenticated
  using (owns_subscription(subscription_id) or cook_owns_subscription(subscription_id));

-- kitchen_capacity: publicly readable (subscribe flow checks enrollment_open); owner writes
drop policy if exists capacity_read on kitchen_capacity;
create policy capacity_read on kitchen_capacity for select to anon, authenticated using (true);
drop policy if exists capacity_owner_write on kitchen_capacity;
create policy capacity_owner_write on kitchen_capacity for all to authenticated
  using (is_kitchen_owner(kitchen_id)) with check (is_kitchen_owner(kitchen_id));

-- reservations: kitchen owner may read; writes are service-role/RPC only
drop policy if exists reservations_read on capacity_reservations;
create policy reservations_read on capacity_reservations for select to authenticated
  using (is_kitchen_owner(kitchen_id));
