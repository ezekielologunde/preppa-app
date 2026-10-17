-- Run only against a disposable local test database. All synthetic rows and grants roll back.
-- Also executed by tests/waitlist-sql.test.ts in in-memory PostgreSQL (no Supabase service).
begin;

do $$
declare
  v_role text;
  v_email text;
  v_id uuid;
  v_count integer;
  v_before bigint;
  v_after bigint;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.waitlist'::regclass) then
    raise exception 'waitlist RLS is disabled';
  end if;
  select count(*) into v_before from public.waitlist;
  foreach v_role in array array['anon', 'authenticated'] loop
    v_email := v_role || '-' || gen_random_uuid()::text || '@example.invalid';
    execute format('set local role %I', v_role);
    if current_user <> v_role then raise exception 'Test did not assume the client role'; end if;
    insert into public.waitlist(email, zip, source) values (v_email, '00000', 'app');
    get diagnostics v_count = row_count;
    if v_count <> 1 then raise exception 'Signup was not inserted for %', v_role; end if;

    begin
      insert into public.waitlist(email, zip, source) values (upper(v_email), '99999', 'app');
      raise exception 'Case-insensitive duplicate accepted for %', v_role;
    exception when unique_violation then null;
    end;
    begin
      perform email from public.waitlist;
      raise exception 'Read access granted to %', v_role;
    exception when insufficient_privilege then null;
    end;
    begin
      insert into public.waitlist(email, source) values ('return-' || v_email, 'app') returning id into v_id;
      raise exception 'Insert with read-back granted to %', v_role;
    exception when insufficient_privilege then null;
    end;
    begin
      update public.waitlist set zip = '99999';
      raise exception 'Update access granted to %', v_role;
    exception when insufficient_privilege then null;
    end;
    begin
      delete from public.waitlist;
      raise exception 'Delete access granted to %', v_role;
    exception when insufficient_privilege then null;
    end;
    begin
      insert into public.waitlist(id, email, source) values (gen_random_uuid(), 'id-' || v_email, 'app');
      raise exception 'Caller-chosen ID accepted for %', v_role;
    exception when insufficient_privilege then null;
    end;
    begin
      insert into public.waitlist(email, created_at, source) values ('date-' || v_email, now(), 'app');
      raise exception 'Caller-chosen creation time accepted for %', v_role;
    exception when insufficient_privilege then null;
    end;
    begin
      insert into public.waitlist(email, source) values ('ab', 'app');
      raise exception 'Too-short email accepted by RLS for %', v_role;
    exception when insufficient_privilege then null;
    end;
    begin
      insert into public.waitlist(email, source) values (repeat('a', 321), 'app');
      raise exception 'Oversized email accepted by RLS for %', v_role;
    exception when insufficient_privilege then null;
    end;
    reset role;
    select count(*) into v_count from public.waitlist where email = v_email and zip = '00000' and source = 'app';
    if v_count <> 1 then raise exception 'Signup lost or duplicate changed the saved ZIP for %', v_role; end if;
  end loop;
  select count(*) into v_after from public.waitlist;
  if v_after <> v_before + 2 then raise exception 'Rejected operations changed the table'; end if;

  -- Check RLS independently of table grants. These temporary grants also roll back.
  grant select on public.waitlist to anon, authenticated;
  foreach v_role in array array['anon', 'authenticated'] loop
    execute format('set local role %I', v_role);
    select count(*) into v_count from public.waitlist;
    if v_count <> 0 then raise exception 'RLS exposed rows to %', v_role; end if;
    reset role;
  end loop;
end $$;

rollback;
select 'waitlist insert, duplicate, column grants, and RLS checks passed' as result;
