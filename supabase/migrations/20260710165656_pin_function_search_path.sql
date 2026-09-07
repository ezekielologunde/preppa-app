-- Hardening: pin search_path on app-owned trigger/guard functions so it can't be
-- influenced by the caller's role (closes advisor `function_search_path_mutable`).
-- All reference only public + pg_catalog objects, so `public` is sufficient. Reversible.
alter function public.set_updated_at() set search_path = public;
alter function public.block_mutation() set search_path = public;
alter function public.enforce_single_kitchen() set search_path = public;
alter function public.guard_profile_privileged_columns() set search_path = public;
alter function public.guard_kitchen_privileged_columns() set search_path = public;
