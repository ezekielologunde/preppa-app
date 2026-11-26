-- Web launch task 1.3 (docs/web-launch/DESIGN.md): the media URL allowlist reads the project
-- storage host from Vault instead of a hardcoded production host.
--
-- 20260714065911_critical_fix_post_media_url_allowlist.sql hardcoded the production project host
-- in the three Supabase Storage prefixes, so a test or local project accepted only production
-- storage URLs (and the L1 exit gate's pg_proc.prosrc check would find the production ref).
-- This replaces public.is_allowed_media_url(text) with the same signature and the same result
-- for every URL, except that the three storage prefixes are built at call time from the Vault
-- secret `project_base_url` (value `https://<project-ref>.supabase.co`, no trailing slash):
--   project_base_url || '/storage/v1/object/public/<bucket>/'   for meal-photos, post-videos, avatars
-- The two Mux prefixes are unchanged.
--
-- A missing or empty secret (or one ending in '/') raises instead of silently allowing or
-- denying every upload. The check runs on every call, so set the secret on a project before
-- this migration is deployed to it (DESIGN 4.2 step 1); until then create_post, set_meal_photo
-- and the plans/experiences media CHECK constraints raise this error. The migration itself does
-- not read Vault, so a fresh `supabase start` (CI db-regression-tests) still applies it.
--
-- Changes from the 20260808003504 definition, both needed to read Vault:
--   * plpgsql (the RAISE) and STABLE rather than IMMUTABLE (the result depends on a Vault row).
--   * SECURITY DEFINER, so every caller (anon, authenticated, service_role, the CHECK
--     constraints) can resolve the secret without direct access to vault.decrypted_secrets.
--     It returns only a boolean; the base URL it reads is the public project URL.
-- search_path stays pinned to 'public' (20260808003504); the Vault view is schema-qualified.
-- starts_with() replaces LIKE for the Vault-built prefixes so '_' or '%' in a base URL (for
-- example a local host name) is matched literally, as the original literal prefixes were.
-- CREATE OR REPLACE keeps the existing grants and the callers (create_post, set_meal_photo,
-- is_allowed_media_url_array) unchanged. Re-runnable.

create or replace function public.is_allowed_media_url(p_url text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_base text;
begin
  select ds.decrypted_secret into v_base
  from vault.decrypted_secrets ds
  where ds.name = 'project_base_url';

  if v_base is null or length(btrim(v_base)) = 0 then
    raise exception 'is_allowed_media_url: Vault secret project_base_url is missing or empty'
      using hint = 'Set vault secret project_base_url to https://<project-ref>.supabase.co (no trailing slash).';
  end if;
  if right(v_base, 1) = '/' then
    raise exception 'is_allowed_media_url: Vault secret project_base_url must not end with a slash'
      using hint = 'Set vault secret project_base_url to https://<project-ref>.supabase.co (no trailing slash).';
  end if;

  return p_url is not null and (
    starts_with(p_url, v_base || '/storage/v1/object/public/meal-photos/')
    or starts_with(p_url, v_base || '/storage/v1/object/public/post-videos/')
    or starts_with(p_url, v_base || '/storage/v1/object/public/avatars/')
    or p_url like 'https://image.mux.com/%'
    or p_url like 'https://stream.mux.com/%'
  );
end;
$function$;
