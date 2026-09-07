-- kitchen_public and kitchen_rating are simple, single-table views (auto-updatable by
-- Postgres default rules) that had inherited full INSERT/UPDATE/DELETE/TRUNCATE grants for
-- anon/authenticated -- not just the SELECT they're meant for. The underlying kitchens table's
-- own RLS (kitchens_update_own + guard_kitchen_privileged_columns, both verified earlier this
-- session) still gates any actual write attempted through the view, so this wasn't a live
-- bypass -- but a read-only discovery view should not carry write grants at all; it's
-- unnecessary attack surface and a defense-in-depth gap (a future RLS misconfiguration on
-- kitchens would be immediately exploitable through this "obviously read-only" view with
-- nobody expecting it). Revoking down to SELECT-only, the only privilege either view needs.
revoke insert, update, delete, truncate on public.kitchen_public from anon, authenticated;
revoke insert, update, delete, truncate on public.kitchen_rating from anon, authenticated;
