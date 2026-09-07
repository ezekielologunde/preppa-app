-- EXECUTE was held via the `public` pseudo-role; revoke there so it's not a client RPC.
revoke execute on function public.kitchen_balance_cents(uuid) from public;
