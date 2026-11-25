// DESIGN 1.4: one re-runnable public.install_stripe_reconcile_triggers() for the stripe.* mirror triggers, a
// check_stripe_reconcile_triggers() that lists missing ones, and a detect_system_health_issues() alert.
//
// No Postgres runs here, so these are static checks over the migration text. The expected triggers are not
// hard-coded: they are parsed from the four applied migrations that first tried to create them, so the
// installer must reproduce each one's name, timing, events, table and function exactly.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations');
const NEW_MIGRATION = '20260927002000_install_stripe_reconcile_triggers.sql';
const ORIGINALS = [
  '20260710195031_reconcile_stripe_payment_to_order.sql',
  '20260711060016_reconcile_subscription_invoice.sql',
  '20260713234329_prepplus_p3_membership_sync_trigger.sql',
  '20260808025920_high_add_cook_pro_membership.sql',
];
const EXPECTED_NAMES = [
  'reconcile_paid_pi_trg',
  'reconcile_paid_invoice_trg',
  'sync_prepplus_membership_trg',
  'sync_cook_pro_membership_trg',
];
// The production ref is read from an applied migration (as tests/vaultBaseUrl.test.ts does) rather than
// repeated here, so this file holds no ref literal.
const PROD_REF = (() => {
  const src = readFileSync(join(MIGRATIONS_DIR, '20260808024849_high_fix_notify_push_pass_kind.sql'), 'utf8');
  const m = /https:\/\/([a-z0-9]{20})\.supabase\.co\/functions\/v1\/send-push/.exec(src);
  assert.ok(m, 'could not read the production ref from 20260808024849');
  return m[1];
})();
const NEW_FUNCTIONS = ['install_stripe_reconcile_triggers', 'check_stripe_reconcile_triggers'];

type TriggerSpec = { name: string; timing: string; events: string; table: string; fn: string };

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

function originalTriggers(): TriggerSpec[] {
  const specs: TriggerSpec[] = [];
  const re =
    /create trigger (\w+) (after|before) (.+?) on (stripe\.\w+) for each row execute function (public\.\w+)\(\)/g;
  for (const file of ORIGINALS) {
    const sql = norm(read(file));
    for (let m = re.exec(sql); m; m = re.exec(sql)) {
      specs.push({ name: m[1], timing: m[2], events: m[3], table: m[4], fn: m[5] });
    }
  }
  return specs;
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('the new migration exists and carries no production ref or project host literal', () => {
  const sql = newMigration();
  assert.equal(sql.includes(PROD_REF), false, 'no production ref literal');
  assert.equal(/[a-z0-9]{20}\.supabase\.co/i.test(sql), false, 'no project host literal');
  assert.equal(readFileSync(__filename, 'utf8').includes(PROD_REF), false, 'this test file contains no production ref');
});

test('the four applied migrations define exactly the four expected stripe.* reconcile triggers', () => {
  const names = originalTriggers().map((t) => t.name);
  assert.deepEqual([...names].sort(), [...EXPECTED_NAMES].sort());
});

test('install_stripe_reconcile_triggers drops and recreates every original trigger with the same definition', () => {
  const body = norm(functionDef(newMigration(), 'install_stripe_reconcile_triggers').body);
  const specs = originalTriggers();
  for (const t of specs) {
    const expected = `drop trigger if exists ${t.name} on ${t.table}; create trigger ${t.name} ${t.timing} ${t.events} on ${t.table} for each row execute function ${t.fn}();`;
    assert.ok(body.includes(expected), `install must contain: ${expected}`);
  }
  assert.equal(body.match(/create trigger /g)?.length, specs.length, 'one create per original trigger');
  assert.equal(body.match(/drop trigger if exists /g)?.length, specs.length, 'one drop per original trigger');
});

test('install checks every table and trigger function first and raises naming each blocked trigger', () => {
  const body = norm(functionDef(newMigration(), 'install_stripe_reconcile_triggers').body);
  const firstDrop = body.indexOf('drop trigger');
  assert.ok(firstDrop > 0);
  const preamble = body.slice(0, firstDrop);
  assert.match(preamble, /raise exception '[^']*cannot install/, 'raise exception before any trigger is created');
  assert.equal(/\braise (notice|warning)\b/.test(body), false, 'never downgrades to a notice or warning');
  for (const t of originalTriggers()) {
    assert.ok(preamble.includes(`to_regclass('${t.table}') is null`), `checks ${t.table} exists`);
    assert.ok(preamble.includes(`to_regprocedure('${t.fn}()') is null`), `checks ${t.fn}() exists`);
    assert.ok(preamble.includes(`'${t.name} (`), `blocked list names ${t.name}`);
  }
  assert.match(body.slice(firstDrop), /check_stripe_reconcile_triggers\(\);.*raise exception/, 're-checks after install');
});

test('install is security definer with a pinned search_path and is executable by service_role only', () => {
  const sql = newMigration();
  const header = norm(functionDef(sql, 'install_stripe_reconcile_triggers').header);
  assert.match(header, /\bsecurity definer\b/);
  assert.match(header, /\bset search_path to ''/);
  const all = norm(sql);
  for (const fn of NEW_FUNCTIONS) {
    assert.ok(
      all.includes(`revoke all on function public.${fn}() from public, anon, authenticated;`),
      `${fn}: execute revoked from public, anon, authenticated`,
    );
    assert.ok(all.includes(`grant execute on function public.${fn}() to service_role;`), `${fn}: granted to service_role`);
    const grants = all.match(new RegExp(`grant [^;]* on function public\\.${fn}\\(\\) to [^;]*;`, 'g')) ?? [];
    assert.deepEqual(grants, [`grant execute on function public.${fn}() to service_role;`], `${fn}: no other grant`);
  }
});

test('check_stripe_reconcile_triggers covers every trigger by name, table and function and reads pg_trigger', () => {
  const sql = newMigration();
  const def = functionDef(sql, 'check_stripe_reconcile_triggers');
  assert.match(norm(def.header), /returns text\[\]/);
  assert.match(norm(def.header), /\bset search_path to ''/);
  const body = norm(def.body);
  for (const t of originalTriggers()) {
    const tuple = new RegExp(`\\(\\d+, '${t.name}', '${escape(t.table)}', '${escape(t.fn)}\\(\\)'\\)`);
    assert.match(body, tuple, `check lists ${t.name} on ${t.table} -> ${t.fn}()`);
  }
  for (const needle of ['pg_catalog.pg_trigger', 't.tgname', 't.tgfoid', 't.tgenabled', "'{}'::text[]"]) {
    assert.ok(body.includes(needle), `check uses ${needle}`);
  }
});

test('the migration is re-runnable and installs only where the stripe.* mirror already exists', () => {
  const all = norm(newMigration());
  const creates = all.match(/create (or replace )?function [^(]+/g) ?? [];
  assert.ok(creates.length >= 3);
  for (const c of creates) assert.ok(c.startsWith('create or replace function'), `idempotent: ${c}`);
  const calls = all.match(/perform public\.install_stripe_reconcile_triggers\(\)/g) ?? [];
  assert.equal(calls.length, 1, 'install is called once by the migration body');
  assert.match(
    all,
    /do \$\$ begin if to_regclass\('stripe\.payment_intents'\) is not null or to_regclass\('stripe\.invoices'\) is not null or to_regclass\('stripe\.subscriptions'\) is not null then perform public\.install_stripe_reconcile_triggers\(\);/,
    'the call is guarded by the stripe.* tables existing',
  );
  assert.ok(
    /select public\.install_stripe_reconcile_triggers\(\)/i.test(newMigration()),
    'header documents the post-stripe-setup operator step',
  );
});

test('the latest detect_system_health_issues alerts on missing reconcile triggers and keeps every earlier check', () => {
  const definers = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => /create or replace function public\.detect_system_health_issues\s*\(/i.test(read(f)));
  assert.ok(definers.includes(NEW_MIGRATION), `${NEW_MIGRATION} must redefine detect_system_health_issues`);
  const latest = definers[definers.length - 1];
  const body = norm(functionDef(read(latest), 'detect_system_health_issues').body);

  assert.match(
    body,
    /if to_regclass\('stripe\.[a-z_]+'\) is not null.*?v_missing_triggers := check_stripe_reconcile_triggers\(\); if cardinality\(v_missing_triggers\) > 0/,
    'alerts only when a stripe.* table exists and the check is non-empty',
  );
  assert.ok(body.includes("'stripe_reconcile_triggers_missing'"), 'alert kind recorded and deduplicated');
  assert.ok(body.includes("perform notify_admins('admin', 'stripe reconcile triggers missing'"), 'notifies admins');

  const kinds = new Set<string>();
  for (const f of definers) {
    const earlier = norm(functionDef(read(f), 'detect_system_health_issues').body);
    for (const m of earlier.matchAll(/jsonb_build_object\('kind', '([a-z_]+)'/g)) kinds.add(m[1]);
  }
  for (const kind of kinds) {
    assert.ok(body.includes(`jsonb_build_object('kind', '${kind}'`), `latest definition keeps the ${kind} check`);
  }
  assert.ok(kinds.has('cron_job_failure') && kinds.has('outbound_http_failure'));
});

test('the newest detect_system_health_issues keeps the 1.2 base-URL and worker checks alongside the 1.4 alert', () => {
  // 20260927000000_vault_base_url_for_workers.sql (1.2) added project_base_url_missing and worker_not_running;
  // a later redefinition built from an older body would silently drop them.
  const definers = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => /create or replace function public\.detect_system_health_issues\s*\(/i.test(read(f)));
  const newest = definers[definers.length - 1];
  const body = norm(functionDef(read(newest), 'detect_system_health_issues').body);
  for (const kind of ['project_base_url_missing', 'worker_not_running', 'stripe_reconcile_triggers_missing']) {
    assert.ok(body.includes(`jsonb_build_object('kind', '${kind}'`), `${newest} records the ${kind} alert`);
  }
  assert.ok(body.includes("perform public.project_function_url('stripe-worker');"), 'probes the Vault base URL');
  assert.ok(body.includes('v_missing_triggers := check_stripe_reconcile_triggers();'), 'runs the trigger check');
});
