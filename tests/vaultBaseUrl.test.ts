// DESIGN 1.2: pg_cron workers and notify()'s push dispatch resolve the functions host from the Vault secret
// project_base_url (via public.project_function_url) instead of a hardcoded production URL, the migration
// RAISES when the secret is missing, and detect_system_health_issues() alerts on a missing secret and on a
// worker with no successful run in its window.
//
// No Postgres is available here, so these are static checks over the SQL text. The jobs and functions to
// repoint are derived by scanning every earlier migration for the production functions URL, so a new
// hardcoded caller added before this migration fails the coverage test. The production ref itself is read
// from an applied migration, so this file carries no copy of it.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations');
const NEW_MIGRATION = '20260927000000_vault_base_url_for_workers.sql';
const NEW_PATH = join(MIGRATIONS_DIR, NEW_MIGRATION);
const HELPER = 'public.project_function_url';

function read(file: string): string {
  return readFileSync(join(MIGRATIONS_DIR, file), 'utf8').replace(/\r\n/g, '\n');
}

const earlier = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql') && f < NEW_MIGRATION)
  .sort();

const notifySource = read('20260808024849_high_fix_notify_push_pass_kind.sql');
const refMatch = /https:\/\/([a-z0-9]{20})\.supabase\.co\/functions\/v1\/send-push/.exec(notifySource);
assert.ok(refMatch, 'could not read the production ref from 20260808024849');
const PROD_REF = refMatch[1];
const PROD_FUNCTIONS = `https://${PROD_REF}.supabase.co/functions/v1/`;

function newSql(): string {
  assert.ok(existsSync(NEW_PATH), `missing ${NEW_MIGRATION}`);
  return readFileSync(NEW_PATH, 'utf8').replace(/\r\n/g, '\n');
}

// SQL with -- comments removed, for checks that prose in comments must not satisfy or trip.
function code(sql: string): string {
  return sql.split('\n').map((line) => line.replace(/(^|\s)--.*$/, '')).join('\n');
}

type Job = { name: string; schedule: string; command: string; file: string };
type Fn = { name: string; header: string; body: string; file: string };

const JOB_RE = /cron\.schedule\(\s*'([a-z0-9_-]+)',\s*'([^']+)',(?:[ \t]*--[^\n]*)?\s*\$job\$([\s\S]*?)\$job\$\s*\)/g;
const FN_RE = /create\s+or\s+replace\s+function\s+(?:public\.)?([a-z0-9_]+)\s*\(([\s\S]*?)\bas\s+(\$[a-z_]*\$)([\s\S]*?)\3/gi;

function jobs(sql: string, file: string): Job[] {
  return [...sql.matchAll(JOB_RE)].map((m) => ({ name: m[1], schedule: m[2], command: m[3], file }));
}

function fns(sql: string, file: string): Fn[] {
  return [...sql.matchAll(FN_RE)].map((m) => ({ name: m[1].toLowerCase(), header: m[2], body: m[4], file }));
}

// Latest definition of each job / function across the earlier migrations.
const latestJob = new Map<string, Job>();
const latestFn = new Map<string, Fn>();
for (const file of earlier) {
  const sql = read(file);
  for (const j of jobs(sql, file)) latestJob.set(j.name, j);
  for (const f of fns(sql, file)) latestFn.set(f.name, f);
}

const hardcodedJobs = [...latestJob.values()].filter((j) => j.command.includes(PROD_FUNCTIONS));
const hardcodedFns = [...latestFn.values()].filter((f) => f.body.includes(PROD_FUNCTIONS));

function repoint(text: string): string {
  return text.replace(new RegExp(`'${PROD_FUNCTIONS.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}([a-z0-9-]+)'`, 'g'),
    (_m, fn: string) => `${HELPER}('${fn}')`);
}

test('new migration exists and carries no production ref', () => {
  const sql = newSql();
  assert.equal(sql.includes(PROD_REF), false, 'new migration contains the production ref');
  assert.equal(readFileSync(__filename, 'utf8').includes(PROD_REF), false, 'this test file contains the production ref');
});

test('the scan finds the known hardcoded workers and notify()', () => {
  assert.deepEqual(hardcodedJobs.map((j) => j.name).sort(), [
    'auto-payouts',
    'charge-due-cycles',
    'reconcile-booking-balances',
    'reconcile-cycle-charges',
    'reconcile-payouts',
    'stripe-sync-worker',
  ]);
  assert.deepEqual(hardcodedFns.map((f) => f.name), ['notify']);
});

test('every live use of the production functions URL in earlier migrations is a parsed job or function', () => {
  // Guards the scan above: an occurrence outside a parsed cron command or function body (other than a
  // comment) would be a caller this test does not see.
  for (const file of earlier) {
    const sql = read(file);
    let covered = 0;
    for (const j of jobs(sql, file)) covered += j.command.split(PROD_FUNCTIONS).length - 1;
    for (const f of fns(sql, file)) covered += f.body.split(PROD_FUNCTIONS).length - 1;
    const live = sql.split('\n').filter((line) => !line.trim().startsWith('--'))
      .reduce((n, line) => n + line.split(PROD_FUNCTIONS).length - 1, 0);
    assert.equal(covered, live, `${file}: ${live - covered} uncovered use(s) of the production functions URL`);
  }
});

test('helper reads project_base_url from Vault and RAISES when it is missing, empty or malformed', () => {
  const sql = newSql();
  const helper = fns(sql, NEW_MIGRATION).find((f) => f.name === 'project_function_url');
  assert.ok(helper, 'public.project_function_url not defined with create or replace');
  assert.match(helper.header, /returns\s+text/i);
  assert.match(helper.header, /security\s+definer/i);
  assert.match(helper.header, /set\s+search_path\s+to\s+''/i);
  assert.match(helper.body, /from\s+vault\.decrypted_secrets\s+where\s+name\s*=\s*'project_base_url'/i);
  assert.match(helper.body, /if\s+v_base\s+is\s+null\s+or\s+v_base\s*=\s*''\s+then\s+raise\s+exception\s+'[^']*project_base_url[^']*missing/i);
  // https only, host only: no trailing slash, path or whitespace.
  assert.ok(helper.body.includes("v_base !~ '^https://[^/[:space:]]+$'"), 'https / no trailing slash check missing');
  assert.match(helper.body, /!~\s*'\^https:[^']*'\s+then\s+raise\s+exception/i);
  assert.ok(helper.body.includes("return v_base || '/functions/v1/' || p_fn;"), 'URL shape is not base || /functions/v1/<fn>');
  assert.match(sql, /revoke\s+all\s+on\s+function\s+public\.project_function_url\(text\)\s+from\s+public,\s*anon,\s*authenticated;/i);
  assert.equal(/coalesce\([^)]*project_base_url/i.test(code(sql)), false, 'no fallback for a missing secret');
});

test('migration calls the helper up front, before scheduling any job, so apply RAISES without the secret', () => {
  const sql = code(newSql());
  const doStart = sql.indexOf('do $$');
  assert.ok(doStart >= 0, 'missing DO block');
  const block = sql.slice(doStart);
  const check = block.indexOf(`perform ${HELPER}('`);
  const firstSchedule = block.indexOf('cron.schedule(');
  assert.ok(check >= 0, 'no up-front helper call in the DO block');
  assert.ok(firstSchedule > check, 'helper must be called before the first cron.schedule');
  assert.equal(/where\s+exists\s*\([^)]*project_base_url/i.test(sql), false, 'project_base_url must not be a silent where-exists skip');
});

test('each hardcoded job is re-scheduled under its own name, schedule and command, only the URL changed', () => {
  const sql = newSql();
  const mine = new Map(jobs(sql, NEW_MIGRATION).map((j) => [j.name, j]));
  for (const old of hardcodedJobs) {
    const now = mine.get(old.name);
    assert.ok(now, `${old.name} (from ${old.file}) is not re-scheduled`);
    assert.equal(now.schedule, old.schedule, `${old.name}: schedule changed`);
    const expected = repoint(old.command);
    assert.notEqual(expected, old.command, `${old.name}: nothing to repoint`);
    assert.equal(now.command, expected, `${old.name}: command differs from ${old.file} beyond the URL`);
    assert.ok(now.command.includes(`${HELPER}('`), `${old.name}: URL not resolved by the helper at run time`);
  }
});

test('notify() is redefined from its latest body with only the URL expression changed', () => {
  const sql = newSql();
  const mine = new Map(fns(sql, NEW_MIGRATION).map((f) => [f.name, f]));
  for (const old of hardcodedFns) {
    const now = mine.get(old.name);
    assert.ok(now, `${old.name} (from ${old.file}) is not redefined`);
    assert.equal(now.header, old.header, `${old.name}: signature or attributes changed`);
    assert.equal(now.body, repoint(old.body), `${old.name}: body differs from ${old.file} beyond the URL`);
  }
  assert.ok(mine.get('notify')?.body.includes(`url := ${HELPER}('send-push')`));
});

test('re-runnable: functions are create or replace, jobs upsert by name, nothing is unscheduled', () => {
  const sql = code(newSql());
  assert.equal(/create\s+function/i.test(sql), false, 'bare create function is not re-runnable');
  assert.equal(/cron\.unschedule/i.test(sql), false, 'unschedule would give the job a new jobid and drop its run history');
  const scheduleCalls = sql.match(/cron\.schedule\(/g) ?? [];
  assert.equal(scheduleCalls.length, jobs(sql, NEW_MIGRATION).length, 'every cron.schedule call is the named three-argument form');
  assert.match(sql, /if\s+to_regnamespace\('cron'\)\s+is\s+not\s+null\s+then/i);
});

test('detect_system_health_issues() keeps every existing check and adds the base-URL and stale-worker checks', () => {
  const sql = newSql();
  const old = latestFn.get('detect_system_health_issues');
  assert.ok(old, 'no earlier detect_system_health_issues()');
  const now = fns(sql, NEW_MIGRATION).find((f) => f.name === 'detect_system_health_issues');
  assert.ok(now, 'detect_system_health_issues() not redefined');
  assert.equal(now.header, old.header);

  // Existing lines survive in order (checks added, none removed).
  const lines = now.body.split('\n');
  let at = 0;
  for (const line of old.body.split('\n').filter((l) => l.trim() !== '')) {
    const found = lines.indexOf(line, at);
    assert.ok(found >= 0, `existing line dropped or reordered: ${line.trim()}`);
    at = found + 1;
  }

  // Missing / invalid base URL, through the same validation the workers use.
  assert.match(now.body, /perform\s+public\.project_function_url\('[a-z-]+'\);\s*exception\s+when\s+others\s+then\s+v_base_url_problem\s*:=\s*sqlerrm;/i);
  assert.match(now.body, /meta->>'kind'\s*=\s*'project_base_url_missing'/);
  assert.match(now.body, /jsonb_build_object\('kind',\s*'project_base_url_missing'\)/);

  // Worker with no successful run in its window, from cron.job_run_details.
  assert.match(now.body, /join\s+cron\.job_run_details\s+r\s+on\s+r\.jobid\s*=\s*j\.jobid/i);
  assert.match(now.body, /r\.status\s*=\s*'succeeded'/);
  assert.match(now.body, /meta->>'kind'\s*=\s*'worker_not_running'/);
  assert.match(now.body, /jsonb_build_object\('kind',\s*'worker_not_running'/);
  for (const j of hardcodedJobs) {
    assert.ok(now.body.includes(`('${j.name}',`), `${j.name} is not in the stale-worker check`);
  }

  // Same issue-row shape as the existing checks: admin notification plus an audit_log anomaly row.
  assert.equal((now.body.match(/perform notify_admins\('admin',/g) ?? []).length, 4);
  assert.equal((now.body.match(/insert into audit_log \(actor_id, action, entity, entity_id, meta\)/g) ?? []).length, 4);
  assert.match(sql, /revoke\s+all\s+on\s+function\s+public\.detect_system_health_issues\(\)\s+from\s+public,\s*anon,\s*authenticated;/i);
});
