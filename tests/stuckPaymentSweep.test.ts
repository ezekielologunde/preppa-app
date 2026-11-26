// DESIGN 1.12: a pg_cron job every 5 minutes runs public.sweep_stuck_payments(), which alerts admins once per
// succeeded stripe.payment_intents row whose metadata order, cycle or booking is still not marked paid.
//
// No Postgres runs here, so these are static checks over the migration text. The metadata keys and the paid
// markers are not hard-coded: they are read from reconcile_paid_pi() in 20260808030007, so the sweep must look
// for the same keys, in the same precedence, and check the columns that function actually writes.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations');
const NEW_MIGRATION = '20260927004000_stuck_payment_sweep.sql';
const RECONCILE = '20260808030007_high_wire_cook_pro_fee_discount.sql';
const FN = 'sweep_stuck_payments';
const JOB = 'stuck-payment-sweep';
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

test('the new migration exists and carries no secret, outbound call, production ref or project host literal', () => {
  const sql = newMigration();
  assert.equal(sql.includes(PROD_REF), false, 'no production ref literal');
  assert.equal(/[a-z0-9]{20}\.supabase\.co/i.test(sql), false, 'no project host literal');
  const all = norm(sql);
  for (const needle of ['vault.', 'decrypted_secret', 'net.http_post', 'bearer', 'sk_live', 'sk_test', 'whsec_']) {
    assert.equal(all.includes(needle), false, `no ${needle}`);
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
    assert.equal(body.split(when).length - 1, 2, `target and target_id both test ${key} exactly as reconcile does`);
  }
  const targetCase = /case when \(pi\.metadata->>'order_id'\)[^]*?end as target,/.exec(body);
  assert.ok(targetCase, 'a case expression names the target');
  const order = reconcileKeys().map((k) => targetCase[0].indexOf(`'${k.key}'`));
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'keys are tested in reconcile_paid_pi order');
  assert.match(
    body,
    /case when \(pi\.metadata->>'order_id'\) ~ '[^']+' then 'order' when \(pi\.metadata->>'cycle_id'\) ~ '[^']+' then 'cycle' when \(pi\.metadata->>'booking_id'\) ~ '[^']+' then 'booking' end as target/,
  );
});

test('a succeeded PI older than 5 minutes (bounded to 30 days) from the Stripe mirror is a candidate', () => {
  const body = sweepBody();
  assert.match(body, /from stripe\.payment_intents pi where pi\.status = 'succeeded'/);
  assert.match(
    body,
    /pg_catalog\.to_timestamp\(\(pi\._raw_data->>'created'\)::double precision\) < pg_catalog\.now\(\) - interval '5 minutes'/,
  );
  assert.match(
    body,
    /pg_catalog\.to_timestamp\(\(pi\._raw_data->>'created'\)::double precision\) > pg_catalog\.now\(\) - interval '30 days'/,
  );
  assert.ok(body.includes("(pi._raw_data->>'created') ~ '^[0-9]{1,12}$'"), 'created is checked numeric before the cast');
  const guard = body.indexOf("if pg_catalog.to_regclass('stripe.payment_intents') is null then return 0;");
  assert.ok(guard >= 0, 'returns 0 where the stripe mirror is absent');
  assert.ok(guard < body.indexOf('from stripe.payment_intents'), 'the guard comes before the query');
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
  assert.match(body, /where c\.target is not null and not \(case c\.target/, 'only PIs with a target, and only unpaid ones');
});

test('alerts are deduped per payment intent through audit_log and sent once per run', () => {
  const body = sweepBody();
  assert.match(
    body,
    /and not exists \( select 1 from public\.audit_log a where a\.action = 'anomaly_alerted' and a\.entity = 'payment_intent' and a\.meta->>'payment_intent_id' = c\.pi_id\)/,
    'skips a PI already alerted',
  );
  assert.match(
    body,
    /insert into public\.audit_log \(actor_id, action, entity, entity_id, meta\) select null, 'anomaly_alerted', 'payment_intent', s\.target_id, pg_catalog\.jsonb_build_object\('kind', 'stuck_payment', 'payment_intent_id', s\.pi_id, 'target', s\.target, 'target_id', s\.target_id\) from stuck s/,
    'records one audit row per newly alerted PI',
  );
  const alerts = body.match(/perform public\.notify_admins\(/g) ?? [];
  assert.equal(alerts.length, 1, 'one notify_admins call');
  assert.match(body, /if v_count > 0 then perform public\.notify_admins\( 'admin', 'stuck payment',/);
  assert.ok(body.includes("perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('sweep_stuck_payments'));"));
  const sql = norm(newMigration());
  assert.ok(
    sql.includes(
      "create index if not exists audit_log_stuck_payment_pi_idx on public.audit_log ((meta->>'payment_intent_id')) where action = 'anomaly_alerted' and entity = 'payment_intent';",
    ),
    'the dedupe lookup is indexed',
  );
});

test('the alert and the audit row carry ids only, no payment details', () => {
  const body = sweepBody();
  for (const word of ['amount', 'customer', 'email', 'payment_method', 'charges', 'receipt', 'card', 'billing', 'description']) {
    assert.equal(new RegExp(`\\b${word}`).test(body), false, `the sweep never reads ${word}`);
  }
  const meta = /jsonb_build_object\(([^)]*)\)/.exec(body);
  assert.ok(meta);
  const keys = meta[1].split(', ').filter((_, i) => i % 2 === 0);
  assert.deepEqual(keys, ["'kind'", "'payment_intent_id'", "'target'", "'target_id'"]);
  const line = /select (\(lg\.meta[^]*?) as line,/.exec(body);
  assert.ok(line, 'the alert line is built from the audit rows');
  const fields = [...line[1].matchAll(/lg\.meta->>'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(fields, ['payment_intent_id', 'target', 'target_id']);
  assert.equal(/_raw_data->(?!>'created')/.test(body), false, 'only created is read from _raw_data');
});

test('the sweep is security definer with an empty search_path and is executable by service_role only', () => {
  const sql = newMigration();
  const header = norm(functionDef(sql, FN).header);
  assert.match(header, /\breturns integer\b/);
  assert.match(header, /\bsecurity definer\b/);
  assert.match(header, /\bset search_path to ''/);
  const all = norm(sql);
  assert.ok(all.includes(`revoke all on function public.${FN}() from public, anon, authenticated;`));
  const grants = all.match(new RegExp(`grant [^;]* on function public\\.${FN}\\(\\) to [^;]*;`, 'g')) ?? [];
  assert.deepEqual(grants, [`grant execute on function public.${FN}() to service_role;`], 'no other grant');
  // with an empty search_path every relation and non-catalog function must be schema-qualified
  const body = sweepBody();
  for (const m of body.matchAll(/\b(?:from|join|into|exists \( select 1 from) ([a-z_]+)(?=[\s(])/g)) {
    assert.ok(['v_count', 'candidates', 'stuck', 'logged', 'l'].includes(m[1]), `unqualified relation: ${m[1]}`);
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
  assert.deepEqual(creates, [`create or replace function public.${FN}`]);
  assert.equal(/create index (?!if not exists)/.test(all), false, 'index creation is re-runnable');
});
