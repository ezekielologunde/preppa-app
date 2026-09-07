alter table profiles        enable row level security;
alter table kitchens        enable row level security;
alter table meals           enable row level security;
alter table orders          enable row level security;
alter table order_items     enable row level security;
alter table addresses       enable row level security;
alter table cod_handoffs    enable row level security;
alter table reviews         enable row level security;
alter table stripe_accounts enable row level security;
alter table payment_intents enable row level security;
alter table ledger_entries  enable row level security;
alter table payouts         enable row level security;
alter table notifications   enable row level security;
alter table verifications   enable row level security;
alter table audit_log       enable row level security;

create policy profiles_select_self_or_public_cook on profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from kitchens k
      where k.owner_id = profiles.id and k.verification_status = 'verified'
    )
  );
create policy profiles_update_self on profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy kitchens_select_verified_public on kitchens
  for select to anon, authenticated
  using (verification_status = 'verified');
create policy kitchens_select_own on kitchens
  for select to authenticated
  using (owner_id = auth.uid());
create policy kitchens_insert_own on kitchens
  for insert to authenticated
  with check (owner_id = auth.uid());
create policy kitchens_update_own on kitchens
  for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy kitchens_delete_own on kitchens
  for delete to authenticated
  using (owner_id = auth.uid());

create policy meals_select_live_public on meals
  for select to anon, authenticated
  using (status = 'live' and is_kitchen_orderable(kitchen_id));
create policy meals_select_own on meals
  for select to authenticated
  using (is_kitchen_owner(kitchen_id));
create policy meals_write_own on meals
  for all to authenticated
  using (is_kitchen_owner(kitchen_id)) with check (is_kitchen_owner(kitchen_id));

create policy orders_select_party on orders
  for select to authenticated
  using (customer_id = auth.uid() or is_kitchen_owner(kitchen_id));

create policy order_items_select_via_order on order_items
  for select to authenticated
  using (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and (o.customer_id = auth.uid() or is_kitchen_owner(o.kitchen_id))
    )
  );

create policy addresses_all_own on addresses
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy cod_select_party on cod_handoffs
  for select to authenticated
  using (
    exists (
      select 1 from orders o
      where o.id = cod_handoffs.order_id
        and (o.customer_id = auth.uid() or is_kitchen_owner(o.kitchen_id))
    )
  );

create policy reviews_select_public on reviews
  for select to anon, authenticated using (true);
create policy reviews_insert_own_completed_order on reviews
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from orders o
      where o.id = reviews.order_id
        and o.customer_id = auth.uid()
        and o.kitchen_id = reviews.kitchen_id
        and o.status = 'completed'
    )
  );

create policy stripe_accounts_select_own on stripe_accounts
  for select to authenticated using (is_kitchen_owner(kitchen_id));
create policy payment_intents_select_party on payment_intents
  for select to authenticated
  using (
    exists (
      select 1 from orders o
      where o.id = payment_intents.order_id
        and (o.customer_id = auth.uid() or is_kitchen_owner(o.kitchen_id))
    )
  );
create policy ledger_select_own on ledger_entries
  for select to authenticated using (is_kitchen_owner(kitchen_id));
create policy payouts_select_own on payouts
  for select to authenticated using (is_kitchen_owner(kitchen_id));

create policy notifications_select_own on notifications
  for select to authenticated using (user_id = auth.uid());
create policy notifications_update_own on notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy verifications_select_own on verifications
  for select to authenticated using (subject_id = auth.uid());

create policy meal_photos_read_public on storage.objects
  for select to anon, authenticated using (bucket_id = 'meal-photos');
create policy meal_photos_write_owner on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'meal-photos'
    and is_kitchen_owner(((storage.foldername(name))[1])::uuid)
  );
create policy meal_photos_update_owner on storage.objects
  for update to authenticated
  using (
    bucket_id = 'meal-photos'
    and is_kitchen_owner(((storage.foldername(name))[1])::uuid)
  );
create policy meal_photos_delete_owner on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'meal-photos'
    and is_kitchen_owner(((storage.foldername(name))[1])::uuid)
  );
