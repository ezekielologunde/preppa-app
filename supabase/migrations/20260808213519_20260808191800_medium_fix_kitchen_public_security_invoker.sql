-- MEDIUM (defense-in-depth): kitchen_public had no security_invoker option, so it ran with
-- the view owner's (definer) privileges against `kitchens`, bypassing that table's RLS
-- entirely and relying solely on the view's own WHERE clause to stay safe. Flagged ERROR by
-- Supabase's security advisor (security_definer_view lint). The view's WHERE clause exactly
-- matches the kitchens_select_verified_public RLS policy today, so this is currently harmless,
-- but it's a silent-bypass trap for any future edit. Switch to invoker semantics so RLS is the
-- actual enforcement, not a duplicated condition.

ALTER VIEW public.kitchen_public SET (security_invoker = true);
