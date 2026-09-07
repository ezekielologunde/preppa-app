
-- Admins can read any kitchen's Connect status (to review applications / payouts).
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='stripe_accounts' and policyname='stripe_accounts_admin_read') then
    create policy stripe_accounts_admin_read on public.stripe_accounts for select to authenticated
      using (public.is_admin());
  end if;
end $$;
