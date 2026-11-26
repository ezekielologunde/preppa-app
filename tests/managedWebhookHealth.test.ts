// DESIGN 1.11 (part B): detect_system_health_issues() alerts admins when stripe._managed_webhooks has no
// enabled row, when card orders were placed but no stripe.* mirror row was written in 24 hours (unless
// worker_not_running already holds in the same run), and when notify_admins() would reach no admin.
//
// No Postgres runs here, so these are static checks over the migration text. The guard against dropped
// checks is derived, not hard-coded: every alert kind any earlier definition recorded, and the whole
// statement section of the previous definition, must survive in the newest one.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations');
const NEW_MIGRATION = '20260927003000_managed_webhook_health.sql';
const FN = 'detect_system_health_issues';
const NEW_KINDS = ['stripe_managed_webhook_missing', 'stripe_mirror_stale', 'no_admin_recipients'];
// Checks earlier tasks added; listed as well as derived so a lost definer file cannot shrink the set.
const EXISTING_KINDS = [
  'cron_job_failure',
  'outbound_http_failure',
  'project_base_url_missing',
  'worker_not_running',
  'stripe_reconcile_triggers_missing',
];

const read = (file: string): string => readFileSync(join(MIGRATIONS_DIR, file), 'utf8').replace(/\r\n/g, '\n');

const PROD_REF = (() => {
  const m = /https:\/\/([a-z0-9]{20})\.supabase\.co\/functions\/v1\/send-push/.exec(
    read('20260808024849_high_fix_notify_push_pass_kind.sql'),
  );
  assert.ok(m, 'could not read the production ref from 20260808024849');
  return m[1];
})();

// Lower-case, drop -- comments, collapse whitespace. None of the SQL here has '--' inside a string literal.
const norm = (sql: string): string =>
  sql
    .replace(/--[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();

function newMigration(): string {
  assert.ok(existsSync(join(MIGRATIONS_DIR, NEW_MIGRATION)), `${NEW_MIGRATION} must exist`);
  return read(NEW_MIGRATION);
}

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

const definers = (name: string = FN): string[] =>
  readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => new RegExp(`create or replace function public\\.${name}\\s*\\(`, 'i').test(read(f)));

function newest(): { file: string; body: string } {
  const all = definers();
  const file = all[all.length - 1];
  return { file, body: norm(functionDef(read(file), FN).body) };
}

// The SQL between a kind's hourly dedupe lookup and the audit_log insert that records it.
function alertBlock(body: string, kind: string): string {
  const at = body.indexOf(`jsonb_build_object('kind', '${kind}'`);
  assert.ok(at > 0, `${kind} alert recorded`);
  const dedupe = body.lastIndexOf(`meta->>'kind' = '${kind}'`, at);
  assert.ok(dedupe > 0, `${kind} dedupe precedes its insert`);
  return body.slice(dedupe, at);
}

test('the new migration exists, is the newest definer, and carries no production ref or host literal', () => {
  const sql = newMigration();
  assert.equal(newest().file, NEW_MIGRATION, `${NEW_MIGRATION} must be the newest ${FN} definition`);
  assert.equal(sql.includes(PROD_REF), false, 'no production ref literal');
  assert.equal(/[a-z0-9]{20}\.supabase\.co/i.test(sql), false, 'no project host literal');
  assert.equal(readFileSync(__filename, 'utf8').includes(PROD_REF), false, 'this test file has no production ref');
  const creates = norm(sql).match(/create (or replace )?function [^(]+/g) ?? [];
  assert.deepEqual(creates, [`create or replace function public.${FN}`], 'redefines only this function');
});

test('the newest definition keeps every check any earlier definition had', () => {
  const { file, body } = newest();
  const kinds = new Set<string>(EXISTING_KINDS);
  for (const f of definers().filter((d) => d !== file)) {
    const earlier = norm(functionDef(read(f), FN).body);
    for (const m of earlier.matchAll(/jsonb_build_object\('kind', '([a-z_]+)'/g)) kinds.add(m[1]);
  }
  for (const kind of kinds) {
    assert.ok(body.includes(`jsonb_build_object('kind', '${kind}'`), `${file} still records the ${kind} alert`);
    assert.ok(body.includes(`meta->>'kind' = '${kind}'`), `${file} still deduplicates the ${kind} alert`);
  }
});

test('the newest definition contains the previous definition statement for statement', () => {
  const all = definers();
  assert.ok(all.length >= 2);
  const prevBody = norm(functionDef(read(all[all.length - 2]), FN).body);
  const { body } = newest();
  // Everything from the first `begin` up to the closing `end;` of the previous body, which the new checks extend.
  const prevStatements = prevBody.slice(prevBody.indexOf(' begin ') + 1, prevBody.lastIndexOf(' end;'));
  assert.ok(prevStatements.length > 2000, 'previous statement section parsed');
  assert.ok(body.includes(prevStatements), 'previous checks are carried over unchanged');
  const prevDecls = prevBody
    .slice(0, prevBody.indexOf(' begin '))
    .replace(/^declare /, '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  assert.ok(prevDecls.length >= 8, 'previous declarations parsed');
  for (const decl of prevDecls) assert.ok(body.includes(`${decl};`), `keeps declaration ${decl}`);
});

test('signature, security definer, search_path and grants are unchanged', () => {
  const all = definers();
  const prevHeader = norm(functionDef(read(all[all.length - 2]), FN).header);
  const header = norm(functionDef(newMigration(), FN).header);
  assert.equal(header, prevHeader);
  assert.match(header, /returns void language plpgsql security definer set search_path to 'public'$/);
  const sql = norm(newMigration());
  assert.ok(sql.includes(`revoke all on function public.${FN}() from public, anon, authenticated;`));
  const grants = sql.match(/grant [^;]* on function [^;]*;/g) ?? [];
  assert.deepEqual(grants, [`grant execute on function public.${FN}() to service_role;`]);
});

test('alerts when stripe._managed_webhooks exists and has no enabled row', () => {
  const { body } = newest();
  assert.match(
    body,
    /if to_regclass\('stripe\._managed_webhooks'\) is not null then select count\(\*\), count\(\*\) filter \(where coalesce\(w\.status, 'enabled'\) <> 'disabled'\) into v_webhook_rows, v_webhook_enabled from stripe\._managed_webhooks w; if v_webhook_enabled = 0 and not exists/,
    'guarded by the table existing, counts rows and enabled rows, alerts on zero enabled',
  );
  const block = alertBlock(body, 'stripe_managed_webhook_missing');
  assert.ok(block.includes("perform notify_admins('admin', 'stripe webhook missing'"), 'notifies admins');
  assert.ok(block.includes('when v_webhook_rows = 0'), 'says whether the table is empty or all rows are disabled');
});

test('alerts when card orders were placed and no stripe.* mirror row was written in 24 hours', () => {
  const block = alertBlock(newest().body, 'stripe_mirror_stale');
  assert.match(
    block,
    /and exists \( select 1 from orders o where o\.method = 'card' and o\.created_at > now\(\) - interval '24 hours' and o\.created_at <= now\(\) - interval '15 minutes' \) then/,
    'only when card orders were attempted in the window',
  );
  for (const needle of [
    "n.nspname = 'stripe'",
    "c.relkind in ('r', 'p')",
    "c.relname not like '\\_%'",
    "c.relname <> 'accounts'",
    "a.attname = '_updated_at'",
    'not a.attisdropped',
  ]) {
    assert.ok(block.includes(needle), `mirror tables selected with ${needle}`);
  }
  assert.ok(
    block.includes(
      "execute format('select exists (select 1 from %s where _updated_at > $1)', v_mirror_table) into v_mirror_fresh using now() - interval '24 hours'; exit when v_mirror_fresh;",
    ),
    'dynamic SQL takes the table as a regclass and the cutoff as a bound parameter',
  );
  assert.ok(
    block.includes("if v_mirror_tables > 0 and not v_mirror_fresh then perform notify_admins('admin', 'stripe mirror stale'"),
    'alerts only when the mirror exists and nothing in it is fresh',
  );
  assert.match(newest().body, /v_mirror_table regclass; v_mirror_tables int := 0; v_mirror_fresh boolean := false;/);
});

test('both new alerts deduplicate hourly and sit inside the pg_cron guard', () => {
  const { body } = newest();
  const guard = body.indexOf("if to_regnamespace('cron') is null then return;");
  assert.ok(guard >= 0, 'pg_cron guard still first');
  for (const kind of NEW_KINDS) {
    const dedupe = new RegExp(
      `not exists \\( select 1 from audit_log where action = 'anomaly_alerted' and entity = 'platform' and meta->>'kind' = '${kind}' and created_at > now\\(\\) - interval '1 hour' \\)`,
    );
    assert.match(body, dedupe, `${kind} re-alerts at most hourly`);
    assert.ok(body.indexOf(`'${kind}'`) > guard, `${kind} runs after the pg_cron guard`);
    assert.ok(
      body.includes(
        `insert into audit_log (actor_id, action, entity, entity_id, meta) values (null, 'anomaly_alerted', 'platform', null, jsonb_build_object('kind', '${kind}'`,
      ),
      `${kind} recorded in audit_log`,
    );
  }
});

test('stripe_mirror_stale stays silent while worker_not_running holds in the same run', () => {
  const { body } = newest();
  const assigned = body.indexOf('into v_stale_workers');
  const workerAlert = body.indexOf("meta->>'kind' = 'worker_not_running'");
  const staleGuard = body.indexOf(
    "if v_stale_workers is null and not exists ( select 1 from audit_log where action = 'anomaly_alerted' and entity = 'platform' and meta->>'kind' = 'stripe_mirror_stale'",
  );
  assert.ok(assigned > 0 && workerAlert > assigned, 'worker_not_running condition computed first');
  assert.ok(staleGuard > workerAlert, 'stripe_mirror_stale is gated on v_stale_workers being null');
  assert.equal(body.slice(assigned + 1, staleGuard).includes('into v_stale_workers'), false, 'not reassigned in between');
  assert.equal(/v_stale_workers :=/.test(body), false, 'v_stale_workers is only set by its select');
});

test('no_admin_recipients uses exactly the recipient predicate of the newest notify_admins()', () => {
  const all = definers('notify_admins');
  assert.ok(all.length > 0, 'notify_admins is defined');
  const notify = norm(functionDef(read(all[all.length - 1]), 'notify_admins').body);
  const loop = /for v_admin, v_admin_email in select \S+ \S+ (from .*?) loop/.exec(notify);
  assert.ok(loop, 'notify_admins recipient loop parsed');
  assert.equal(loop[1], "from profiles p join auth.users u on u.id = p.id where p.role = 'admin'");
  const { body } = newest();
  assert.ok(
    body.includes(
      `if not exists ( select 1 ${loop[1]} ) and not exists ( select 1 from audit_log where action = 'anomaly_alerted' and entity = 'platform' and meta->>'kind' = 'no_admin_recipients' and created_at > now() - interval '1 hour' ) then`,
    ),
    'alerts when no profile matches the notify_admins predicate, at most hourly',
  );
  const block = alertBlock(body, 'no_admin_recipients');
  assert.ok(block.includes("perform notify_admins('admin', 'no admin recipients'"), 'still calls notify_admins for the webhook URL');
});

test('the migration header names every new check and claims only what the checks can detect', () => {
  const sql = newMigration();
  const header = sql.slice(0, sql.indexOf('create or replace function')).replace(/^-- ?/gm, '').toLowerCase().replace(/\s+/g, ' ');
  for (const kind of NEW_KINDS) assert.ok(header.includes(kind), `header describes ${kind}`);
  assert.ok(header.includes('local snapshot'), 'says _managed_webhooks is only a local snapshot');
  assert.match(
    header,
    /what these checks cannot see: an endpoint deleted on the stripe side .* or disabled by stripe/,
    'says Stripe-side deletion and disabling are not detected',
  );
  assert.ok(header.includes('part e'), 'points to part E for those cases');
  assert.equal(
    /if that table is empty \(the endpoint was never registered, or was deleted as orphaned/.test(header),
    false,
    'no longer claims the empty-table check catches an orphan deletion',
  );
});
