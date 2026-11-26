// DESIGN 1.12: a pg_cron job every 5 minutes runs public.sweep_stuck_payments(), which alerts admins once per
// succeeded stripe.payment_intents row whose metadata order, cycle or booking is still not marked paid.
//
// No Postgres runs under npm test, so these are static checks over the migration text. The metadata keys, the
// paid markers and the admin-recipient predicate are not hard-coded: they are read from reconcile_paid_pi() in
// 20260808030007 and from the latest notify_admins() definition, so the sweep must look for the same keys, in the
// same precedence, check the columns that function actually writes, and count the admins notify_admins reaches.
// The function itself is executed by supabase/tests/stuck_payment_sweep_smoke.sql, which CI runs after
// `supabase start`; the last tests here pin that script and that CI step.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = join(__dirname, '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const NEW_MIGRATION = '20260927004000_stuck_payment_sweep.sql';
const RECONCILE = '20260808030007_high_wire_cook_pro_fee_discount.sql';
const SMOKE = join(ROOT, 'supabase', 'tests', 'stuck_payment_sweep_smoke.sql');
const CI = join(ROOT, '.github', 'workflows', 'ci.yml');
const FN = 'sweep_stuck_payments';
const JOB = 'stuck-payment-sweep';
const STATE = 'stuck_payment_sweep_state';
const STRICT_UUID = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
// The production ref is read from an applied migration (as tests/vaultBaseUrl.test.ts does) rather than
// repeated here, so this file holds no ref literal.
const PROD_REF = (() => {
  const src = readFileSync(join(MIGRATIONS_DIR, '20260808024849_high_fix_notify_push_pass_kind.sql'), 'utf8');
  const m = /https:\/\/([a-z0-9]{20})\.supabase\.co\/functions\/v1\/send-push/.exec(src);
  assert.ok(m, 'could not read the production ref from 20260808024849');
  return m[1];
})();

const read = (file: string): string => readFileSync(join(MIGRATIONS_DIR, file), 'utf8');

// Lower-case, drop -- comments, collapse whitespace. None of the SQL here has '--' inside a string literal.
const norm = (sql: string): string =>
  sql
    .replace(/--[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();

function newMigration(): string {
  const path = join(MIGRATIONS_DIR, NEW_MIGRATION);
  assert.ok(existsSync(path), `${NEW_MIGRATION} must exist`);
  return readFileSync(path, 'utf8');
}

// Text of the last `create or replace function public.<name>(...)` in sql, from the header through the
// closing dollar-quote tag. Throws when absent.
function functionDef(sql: string, name: string): { header: string; body: string } {
  const re = new RegExp(`create or replace function public\\.${name}\\s*\\(`, 'gi');
  let start = -1;
  for (let m = re.exec(sql); m; m = re.exec(sql)) start = m.index;
  assert.ok(start >= 0, `public.${name} must be defined`);
  const asMatch = /\bas\s+(\$[a-z_]*\$)/i.exec(sql.slice(start));
  assert.ok(asMatch, `public.${name} must have a dollar-quoted body`);
  const bodyStart = start + asMatch.index + asMatch[0].length;
  const bodyEnd = sql.indexOf(asMatch[1], bodyStart);
  assert.ok(bodyEnd > bodyStart, `public.${name} body must be closed by ${asMatch[1]}`);
  return { header: sql.slice(start, start + asMatch.index), body: sql.slice(bodyStart, bodyEnd) };
}

// Body of the latest definition of public.<name> among the applied migrations (excluding the new one).
function latestBody(name: string): string {
  const re = new RegExp(`create or replace function public\\.${name}\\s*\\(`, 'i');
  const definers = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && f !== NEW_MIGRATION && re.test(read(f)))
    .sort();
  assert.ok(definers.length > 0, `some migration defines public.${name}`);
  return norm(functionDef(read(definers[definers.length - 1]), name).body);
}

const sweepBody = (): string => norm(functionDef(newMigration(), FN).body);

// The metadata keys reconcile_paid_pi branches on, in its if / elsif order.
function reconcileKeys(): { key: string; pattern: string }[] {
  const body = norm(functionDef(read(RECONCILE), 'reconcile_paid_pi').body);
  const keys: { key: string; pattern: string }[] = [];
  for (const m of body.matchAll(/(?:if|elsif) \(new\.metadata->>'([a-z_]+)'\) ~ '([^']+)' then/g)) {
    keys.push({ key: m[1], pattern: m[2] });
  }
  return keys;
}

// The `from ... where ...` that picks notify_admins' recipients, schema-qualified as the sweep must write it.
function notifyAdminsRecipients(): string {
  const body = latestBody('notify_admins');
  const m = /for v_admin[a-z_, ]* in select [^]*? (from [^]*?) loop/.exec(body);
  assert.ok(m, 'notify_admins loops over a recipient query');
  assert.match(m[1], /\bp\.role = 'admin'/, 'notify_admins reaches admins');
  return m[1].replace(/\b(from|join) profiles\b/g, '$1 public.profiles');
}

function at(body: string, needle: string): number {
  const i = body.indexOf(needle);
  assert.ok(i >= 0, `the sweep contains: ${needle}`);
  return i;
}

test('the new migration and the smoke script carry no secret, outbound call, production ref or project host literal', () => {
  for (const [name, sql] of [
    [NEW_MIGRATION, newMigration()],
    ['stuck_payment_sweep_smoke.sql', readFileSync(SMOKE, 'utf8')],
  ]) {
    assert.equal(sql.includes(PROD_REF), false, `${name}: no production ref literal`);
    assert.equal(/[a-z0-9]{20}\.supabase\.co/i.test(sql), false, `${name}: no project host literal`);
    const all = norm(sql);
    for (const needle of ['vault.', 'decrypted_secret', 'net.http_post', 'bearer', 'sk_live', 'sk_test', 'whsec_']) {
      assert.equal(all.includes(needle), false, `${name}: no ${needle}`);
    }
  }
  assert.equal(readFileSync(__filename, 'utf8').includes(PROD_REF), false, 'this test file contains no production ref');
});

test('reconcile_paid_pi branches on order_id, then cycle_id, then booking_id', () => {
  assert.deepEqual(
    reconcileKeys().map((k) => k.key),
    ['order_id', 'cycle_id', 'booking_id'],
  );
});

test('the sweep reads the same metadata keys, with the same uuid check and precedence, as reconcile_paid_pi', () => {
  const body = sweepBody();
  for (const { key, pattern } of reconcileKeys()) {
    const when = `when (pi.metadata->>'${key}') ~ '${pattern}' then`;
    assert.equal(body.split(when).length - 1, 2, `target and target_ref both test ${key} exactly as reconcile does`);
  }
  const targetCase = /case when \(pi\.metadata->>'order_id'\)[^]*?end as target,/.exec(body);
  assert.ok(targetCase, 'a case expression names the target');
  const order = reconcileKeys().map((k) => targetCase[0].indexOf(`'${k.key}'`));
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'keys are tested in reconcile_paid_pi order');
  assert.match(
    body,
    /case when \(pi\.metadata->>'order_id'\) ~ '[^']+' then 'order' when \(pi\.metadata->>'cycle_id'\) ~ '[^']+' then 'cycle' when \(pi\.metadata->>'booking_id'\) ~ '[^']+' then 'booking' end as target/,
  );
  assert.match(
    body,
    /case when \(pi\.metadata->>'order_id'\) ~ '[^']+' then pi\.metadata->>'order_id' when \(pi\.metadata->>'cycle_id'\) ~ '[^']+' then pi\.metadata->>'cycle_id' when \(pi\.metadata->>'booking_id'\) ~ '[^']+' then pi\.metadata->>'booking_id' end as target_ref/,
  );
});

test('a metadata id is cast to uuid only when it is a well-formed uuid, so one bad id cannot abort the run', () => {
  const body = sweepBody();
  const casts = body.match(/(?<!null)::uuid\b/g) ?? [];
  assert.equal(casts.length, 1, 'exactly one uuid cast of a value');
  assert.ok(
    body.includes(`case when r.target_ref ~ '${STRICT_UUID.toLowerCase()}' then r.target_ref::uuid end as target_id`),
    'the cast is guarded by the strict uuid regex',
  );
  assert.equal(/metadata->>'[a-z_]+'\)::uuid/.test(body), false, 'no unguarded cast of a metadata value');
  // reconcile's loose check admits ids the strict one rejects; those must not reach the cast
  const loose = new RegExp(reconcileKeys()[0].pattern);
  const strict = new RegExp(STRICT_UUID);
  const malformed = '0123456789abcdef0123456789abcdef0123';
  assert.ok(loose.test(malformed) && !strict.test(malformed), 'a 36 hex digit id passes loose but not strict');
  assert.ok(strict.test('3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b'), 'a real uuid passes strict');
});

test('a succeeded PI older than 5 minutes is a candidate, looking back from the last successful run but never less than 30 days', () => {
  const body = sweepBody();
  assert.match(body, /from stripe\.payment_intents pi where pi\.status = 'succeeded'/);
  assert.match(
    body,
    /pg_catalog\.to_timestamp\(\(pi\._raw_data->>'created'\)::double precision\) < pg_catalog\.now\(\) - interval '5 minutes'/,
  );
  assert.ok(
    body.includes(
      "and (v_since is null or pg_catalog.to_timestamp((pi._raw_data->>'created')::double precision) >= v_since)",
    ),
    'lower bound is v_since, none on the first run',
  );
  assert.ok(
    body.includes(
      `select st.last_success_at into v_last from public.${STATE} st; if v_last is not null then v_since := least(v_last - interval '5 minutes', pg_catalog.now() - interval '30 days'); end if;`,
    ),
    'v_since is the last successful run less the 5 minute gate, capped at 30 days ago, and null before any run',
  );
  assert.equal(/> pg_catalog\.now\(\) - interval '30 days'/.test(body), false, 'no fixed 30 day window');
  assert.ok(body.includes("(pi._raw_data->>'created') ~ '^[0-9]{1,12}$'"), 'created is checked numeric before the cast');
  const guard = body.indexOf(
    "if pg_catalog.to_regclass('stripe.payment_intents') is null then return pg_catalog.jsonb_build_object('status', 'no_stripe_mirror', 'count', 0);",
  );
  assert.ok(guard >= 0, 'returns no_stripe_mirror where the stripe mirror is absent');
  assert.ok(guard < body.indexOf('from stripe.payment_intents'), 'the guard comes before the query');
});

test('the scan state is a one-row table nobody but the service role can reach, advanced only by a successful run', () => {
  const sql = norm(newMigration());
  assert.ok(
    sql.includes(
      `create table if not exists public.${STATE} ( id boolean primary key default true check (id), last_success_at timestamptz not null );`,
    ),
  );
  assert.ok(sql.includes(`alter table public.${STATE} enable row level security;`));
  assert.ok(sql.includes(`revoke all on table public.${STATE} from public, anon, authenticated;`));
  assert.equal(new RegExp(`create policy [^;]* on (public\\.)?${STATE}`).test(sql), false, 'no policy');
  assert.equal(new RegExp(`grant [^;]* on (table )?(public\\.)?${STATE}`).test(sql), false, 'no grant');

  const body = sweepBody();
  const upsert = `insert into public.${STATE} (id, last_success_at) values (true, pg_catalog.now()) on conflict (id) do update set last_success_at = excluded.last_success_at;`;
  const upserts = [...body.matchAll(new RegExp(upsert.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))].map((m) => m.index);
  assert.equal(upserts.length, 2, 'state written on the nothing-stuck path and the alerted path only');
  const nothing = at(body, "return pg_catalog.jsonb_build_object('status', 'nothing_stuck', 'count', 0);");
  assert.ok(upserts[0] < nothing && nothing < at(body, 'into v_recipients'), 'first write is the nothing-stuck path');
  assert.ok(upserts[1] > at(body, 'insert into public.audit_log'), 'second write follows the dedupe rows');
  assert.equal(new RegExp(`(update|delete from) public\\.${STATE}`).test(body), false, 'no other state write');
});

test('each target is checked against the paid marker reconcile_paid_pi writes', () => {
  const reconcile = norm(functionDef(read(RECONCILE), 'reconcile_paid_pi').body);
  // what reconcile_paid_pi writes on success
  assert.ok(reconcile.includes("update public.orders set pay_status='paid'"), 'reconcile marks orders paid');
  assert.ok(reconcile.includes("payment_status='paid'"), 'reconcile marks cycles paid');
  assert.ok(reconcile.includes('confirmed_at=coalesce(confirmed_at,now())'), 'reconcile stamps booking confirmed_at');

  const body = sweepBody();
  assert.match(
    body,
    /when 'order' then exists \( select 1 from public\.orders o where o\.id = c\.target_id and o\.pay_status in \('paid', 'refunded'\)\)/,
  );
  assert.match(
    body,
    /when 'cycle' then exists \( select 1 from public\.subscription_cycles sc where sc\.id = c\.target_id and sc\.payment_status in \('paid', 'refunded'\)\)/,
  );
  assert.match(
    body,
    /else exists \( select 1 from public\.bookings b where b\.id = c\.target_id and case when c\.is_balance then b\.balance_charge_status = 'paid' else b\.confirmed_at is not null end\)/,
  );
  assert.ok(body.includes("coalesce(pi.metadata->>'kind', '') = 'balance' as is_balance"), 'balance charges detected by kind');
  assert.match(body, /from mirrored r where r\.target is not null \)/, 'only PIs with a target');
  assert.match(body, /from candidates c where not \(case c\.target/, 'only unpaid ones');
});

test('the dedupe rows are written only after notify_admins is confirmed to have reached an admin', () => {
  const body = sweepBody();
  const recipients = notifyAdminsRecipients();
  assert.ok(
    body.includes(`select count(*)::integer into v_recipients ${recipients};`),
    `recipients counted with notify_admins' own predicate: ${recipients}`,
  );
  // notify() writes one notifications row per recipient with notify_admins' kind, title and body
  assert.match(
    latestBody('notify'),
    /insert into notifications \(user_id, kind, title, body\) values \(p_user, p_kind, p_title, p_body\)/,
  );
  const match = `from public.notifications n where n.kind = 'admin' and n.title = 'stuck payment' and n.body = v_body and n.created_at = pg_catalog.now() and n.user_id in (select p.id ${recipients});`;
  const noRecipients = at(
    body,
    "if v_recipients = 0 then raise warning 'sweep_stuck_payments: % stuck payment(s) not alerted, no admin recipient', v_count; return pg_catalog.jsonb_build_object('status', 'no_recipients', 'count', v_count); end if;",
  );
  const before = at(body, `select count(*)::integer into v_before ${match}`);
  const call = at(body, "perform public.notify_admins('admin', 'stuck payment', v_body);");
  const after = at(body, `select count(*)::integer into v_after ${match}`);
  const notDelivered = at(
    body,
    "if v_after <= v_before then raise warning 'sweep_stuck_payments: % stuck payment(s) not alerted, notify_admins created no notification', v_count; return pg_catalog.jsonb_build_object('status', 'not_delivered', 'count', v_count); end if;",
  );
  const dedupe = at(body, 'insert into public.audit_log');
  assert.deepEqual(
    [noRecipients, before, call, after, notDelivered, dedupe],
    [noRecipients, before, call, after, notDelivered, dedupe].sort((a, b) => a - b),
    'count recipients, count rows, call, count rows, check delivery, then dedupe',
  );
  assert.equal(body.split('insert into public.audit_log').length - 1, 1, 'one dedupe insert');
  assert.equal((body.match(/perform public\.notify_admins\(/g) ?? []).length, 1, 'one notify_admins call');
  assert.ok(body.endsWith("return pg_catalog.jsonb_build_object('status', 'alerted', 'count', v_count); end;"));
});

test('alerts are deduped per payment intent through audit_log and the run is serialised', () => {
  const body = sweepBody();
  assert.match(
    body,
    /and not exists \( select 1 from public\.audit_log a where a\.action = 'anomaly_alerted' and a\.entity = 'payment_intent' and a\.meta->>'payment_intent_id' = c\.pi_id\)/,
    'skips a PI already alerted',
  );
  assert.ok(
    body.includes(
      "insert into public.audit_log (actor_id, action, entity, entity_id, meta) select null::uuid, 'anomaly_alerted', 'payment_intent', s.entity_id, pg_catalog.jsonb_build_object('kind', 'stuck_payment', 'payment_intent_id', s.payment_intent_id, 'target', s.target, 'target_id', s.target_id) from pg_catalog.jsonb_to_recordset(v_stuck) as s(payment_intent_id text, target text, target_id text, entity_id uuid);",
    ),
    'records one audit row per newly alerted PI',
  );
  assert.ok(body.includes("perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('sweep_stuck_payments'));"));
  const sql = norm(newMigration());
  assert.ok(
    sql.includes(
      "create index if not exists audit_log_stuck_payment_pi_idx on public.audit_log ((meta->>'payment_intent_id')) where action = 'anomaly_alerted' and entity = 'payment_intent';",
    ),
    'the dedupe lookup is indexed',
  );
});

test('one run sends one digest: at most 20 ids, then a count of the rest', () => {
  const body = sweepBody();
  assert.ok(body.includes("select string_agg(l.line, '; ' order by l.rn) filter (where l.rn <= 20) into v_list"));
  assert.ok(body.includes('from pg_catalog.jsonb_array_elements(v_stuck) with ordinality as e(item, rn)'));
  assert.ok(body.includes('order by s.pi_id) into v_stuck from stuck s;'), 'ids listed in a stable order');
  assert.ok(
    body.includes(
      "v_body := v_count || ' succeeded payment(s) not marked paid after 5 minutes: ' || v_list || case when v_count > 20 then ' and ' || (v_count - 20) || ' more (all in audit_log, kind stuck_payment)' else '' end;",
    ),
  );
});

test('the alert and the audit row carry ids only, no payment details', () => {
  const body = sweepBody();
  for (const word of ['amount', 'customer', 'email', 'payment_method', 'charges', 'receipt', 'card', 'billing', 'description']) {
    assert.equal(new RegExp(`\\b${word}`).test(body), false, `the sweep never reads ${word}`);
  }
  const objects = [...body.matchAll(/jsonb_build_object\(('[a-z_]+', [^)]*)\)/g)].map((m) =>
    m[1].split(', ').filter((_, i) => i % 2 === 0),
  );
  assert.deepEqual(
    objects.find((keys) => keys[0] === "'payment_intent_id'"),
    ["'payment_intent_id'", "'target'", "'target_id'", "'entity_id'"],
  );
  assert.deepEqual(
    objects.find((keys) => keys[0] === "'kind'"),
    ["'kind'", "'payment_intent_id'", "'target'", "'target_id'"],
  );
  const line = /select (\(e\.item[^]*?) as line,/.exec(body);
  assert.ok(line, 'the alert line is built from the stuck list');
  const fields = [...line[1].matchAll(/e\.item->>'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(fields, ['payment_intent_id', 'target', 'target_id']);
  assert.equal(/_raw_data->(?!>'created')/.test(body), false, 'only created is read from _raw_data');
});

test('the sweep is security definer with an empty search_path and is executable by service_role only', () => {
  const sql = newMigration();
  const header = norm(functionDef(sql, FN).header);
  assert.match(header, /\breturns jsonb\b/);
  assert.match(header, /\bsecurity definer\b/);
  assert.match(header, /\bset search_path to ''/);
  const all = norm(sql);
  assert.ok(all.includes(`revoke all on function public.${FN}() from public, anon, authenticated;`));
  const grants = all.match(new RegExp(`grant [^;]* on function public\\.${FN}\\(\\) to [^;]*;`, 'g')) ?? [];
  assert.deepEqual(grants, [`grant execute on function public.${FN}() to service_role;`], 'no other grant');
  // with an empty search_path every relation and non-catalog function must be schema-qualified
  const body = sweepBody();
  for (const m of body.matchAll(/\b(?:from|join|into|exists \( select 1 from) ([a-z_]+)(?=[\s(])/g)) {
    assert.ok(
      m[1].startsWith('v_') || ['mirrored', 'candidates', 'stuck'].includes(m[1]),
      `unqualified relation: ${m[1]}`,
    );
  }
  assert.ok(body.includes('perform public.notify_admins('), 'notify_admins is schema-qualified');
});

test('the cron job is guarded, unscheduled then scheduled by name every 5 minutes, and idempotent', () => {
  const all = norm(newMigration());
  const unschedule = `perform cron.unschedule('${JOB}') where exists (select 1 from cron.job where jobname = '${JOB}');`;
  const schedule = `perform cron.schedule('${JOB}', '*/5 * * * *', 'select public.${FN}()');`;
  assert.ok(
    all.includes(`do $$ begin if to_regnamespace('cron') is not null then ${unschedule} ${schedule} end if; end $$;`),
    'pg_cron guard wraps unschedule then schedule',
  );
  assert.equal(all.split('cron.schedule(').length - 1, 1, 'one schedule call');
  assert.equal(all.split('cron.unschedule(').length - 1, 1, 'one unschedule call');
  const creates = all.match(/create (or replace )?function [^(]+/g) ?? [];
  assert.deepEqual(creates, [`create or replace function public.${FN}`], 'notify_admins and the rest are not redefined');
  const drop = all.indexOf(`drop function if exists public.${FN}();`);
  assert.ok(drop >= 0 && drop < all.indexOf(`create or replace function public.${FN}`), 'the old integer version is dropped first');
  assert.equal(/create index (?!if not exists)/.test(all), false, 'index creation is re-runnable');
  assert.equal(/create table (?!if not exists)/.test(all), false, 'table creation is re-runnable');
});

test('the smoke script runs the sweep for every required case inside a transaction that rolls back', () => {
  assert.ok(existsSync(SMOKE), 'supabase/tests/stuck_payment_sweep_smoke.sql must exist');
  const smoke = norm(readFileSync(SMOKE, 'utf8'));
  assert.ok(smoke.startsWith('begin;'), 'first statement opens the transaction');
  assert.ok(smoke.endsWith('rollback;'), 'last statement rolls it back');
  assert.equal(/(?:^|; )commit;/.test(smoke), false, 'never commits');
  assert.ok((smoke.match(/public\.sweep_stuck_payments\(\)/g) ?? []).length >= 7, 'the sweep is executed');
  for (const name of [
    'no admin: result no_recipients, no dedupe row',
    'one admin and one stuck payment: one alert, one dedupe row',
    'same run again: no second alert',
    'malformed metadata id: sweep completes and reports it',
    'scan window:',
    'backlog of 25: one digest alert',
  ]) {
    assert.ok(smoke.includes(`perform pg_temp.smoke_record( '${name}`), `case recorded: ${name}`);
  }
  assert.ok(smoke.includes("r->>'status' = 'no_recipients'"), 'no admin expects no_recipients');
  assert.ok(smoke.includes("update public.profiles set role = 'customer' where role = 'admin';"), 'no admin while case 1 runs');
  assert.ok(smoke.includes(`'{"order_id": "0123456789abcdef0123456789abcdef0123"}'`), 'the malformed id fixture');
  assert.ok(
    smoke.includes("if pg_catalog.to_regclass('stripe.payment_intents') is null then create schema if not exists stripe;"),
    'a stub mirror only where the real one is absent',
  );
  assert.ok(smoke.includes("raise notice '% %: %', case when r.ok then 'pass' else 'fail' end"), 'PASS or FAIL per case');
  assert.match(smoke, /if v_failed > 0 or \(select count\(\*\) from pg_temp\.smoke_result\) <> 6 then raise exception/);
  assert.ok(
    newMigration().includes('psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/stuck_payment_sweep_smoke.sql'),
    'the migration header says how to run it',
  );
});

test('CI runs the smoke script after supabase start, failing the build on any failed case', () => {
  const ci = readFileSync(CI, 'utf8');
  const start = ci.indexOf('- run: supabase start');
  const regressions = ci.indexOf('-f supabase/tests/regressions.sql');
  const smoke = ci.indexOf(
    '- run: psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/stuck_payment_sweep_smoke.sql',
  );
  assert.ok(start >= 0 && regressions > start, 'the DB suite runs after supabase start');
  assert.ok(smoke > regressions, 'the smoke script runs in the same job, after regressions.sql');
});
