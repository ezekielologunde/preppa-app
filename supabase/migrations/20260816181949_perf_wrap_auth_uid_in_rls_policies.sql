-- Baseline-readiness pass, performance follow-up: Supabase's advisor flags 39
-- RLS policies (auth_rls_initplan, WARN) where auth.uid()/auth.jwt()/auth.role()
-- is called directly in USING/WITH CHECK. Postgres's planner cannot treat a
-- bare function call as a stable constant across rows, so it re-evaluates it
-- once per row scanned instead of once per query. Supabase's documented fix
-- is wrapping each call in a scalar subquery -- (select auth.uid()) instead of
-- auth.uid() -- which the planner CAN evaluate once and reuse (InitPlan),
-- with identical semantics (a scalar subquery returning the same single value
-- as the bare call). No policy's actual authorization logic changes.
--
-- Applied dynamically rather than hand-transcribing 39 ALTER POLICY statements
-- (several have deeply nested EXISTS/NOT EXISTS subqueries where a manual
-- transcription error would be easy to make and hard to spot in review) --
-- dry-run tested against the most complex case (messages_insert's nested
-- EXISTS/NOT EXISTS with_check) before running this for real. Every policy's
-- roles/command stay untouched; only the USING/WITH CHECK expression text is
-- rewritten. Idempotent: re-running finds nothing left to do, since the same
-- detection predicate excludes already-wrapped expressions.
do $$
declare
  r record;
  new_qual text;
  new_check text;
  stmt text;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        (qual is not null and qual ~ 'auth\.(uid|jwt|role)\(\)' and qual !~ '\(\s*select\s+auth\.(uid|jwt|role)\(\)\s*\)')
        or
        (with_check is not null and with_check ~ 'auth\.(uid|jwt|role)\(\)' and with_check !~ '\(\s*select\s+auth\.(uid|jwt|role)\(\)\s*\)')
      )
  loop
    new_qual := case when r.qual is not null
      then regexp_replace(r.qual, 'auth\.(uid|jwt|role)\(\)', '(select auth.\1())', 'g')
      else null end;
    new_check := case when r.with_check is not null
      then regexp_replace(r.with_check, 'auth\.(uid|jwt|role)\(\)', '(select auth.\1())', 'g')
      else null end;

    stmt := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if new_qual is not null then
      stmt := stmt || format(' using (%s)', new_qual);
    end if;
    if new_check is not null then
      stmt := stmt || format(' with check (%s)', new_check);
    end if;
    execute stmt;
    raise notice 'Optimized policy % on %.%', r.policyname, r.schemaname, r.tablename;
  end loop;
end $$;
