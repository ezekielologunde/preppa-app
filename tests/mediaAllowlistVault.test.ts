// DESIGN 1.3: public.is_allowed_media_url builds its Supabase Storage prefixes from the Vault secret
// project_base_url at call time instead of the production host hardcoded by
// 20260714065911_critical_fix_post_media_url_allowlist.sql.
//
// No Postgres is available to these tests, so they read the SQL as text: the latest definition of the
// function must be the 1.3 migration, must carry no production host, must raise when the secret is missing,
// empty or ends in '/', and must keep the original's buckets and Mux prefixes. The allow rules are also
// lifted out of the SQL and evaluated against sample URLs for a test project.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations');
const NEW_FILE = '20260927001000_media_allowlist_from_vault.sql';
const ORIGINAL_FILE = '20260714065911_critical_fix_post_media_url_allowlist.sql';
const DEFINITION = /create\s+or\s+replace\s+function\s+public\.is_allowed_media_url\s*\(/i;

function read(name: string): string {
  return readFileSync(join(MIGRATIONS_DIR, name), 'utf8').replace(/\r\n/g, '\n');
}

function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}

const original = read(ORIGINAL_FILE);
// The production ref is taken from the applied original so no new file has to spell it out.
const prodMatch = original.match(/https:\/\/([a-z0-9]{20})\.supabase\.co\/storage\/v1\/object\/public\//);
assert.ok(prodMatch, 'original allowlist migration no longer shows the production storage host');
const PROD_REF = prodMatch[1];
const PROD_BASE = `https://${PROD_REF}.supabase.co`;
const ORIGINAL_BUCKETS = [...original.matchAll(/\/storage\/v1\/object\/public\/([a-z0-9-]+)\/%'/g)].map((m) => m[1]);
const ORIGINAL_MUX = [...original.matchAll(/'(https:\/\/[a-z]+\.mux\.com\/)%'/g)].map((m) => m[1]);

function newSql(): string {
  const file = join(MIGRATIONS_DIR, NEW_FILE);
  assert.ok(existsSync(file), `missing migration ${NEW_FILE}`);
  return read(NEW_FILE);
}

function functionBody(sql: string): string {
  const code = stripComments(sql);
  const start = code.search(DEFINITION);
  assert.ok(start >= 0, `${NEW_FILE} does not define public.is_allowed_media_url`);
  const tagMatch = code.slice(start).match(/\bas\s+(\$[a-z_]*\$)/i);
  assert.ok(tagMatch && tagMatch.index !== undefined, 'function body has no dollar-quote tag');
  const bodyStart = start + tagMatch.index + tagMatch[0].length;
  const bodyEnd = code.indexOf(tagMatch[1], bodyStart);
  assert.ok(bodyEnd > bodyStart, 'function body is not closed');
  return code.slice(bodyStart, bodyEnd);
}

function header(sql: string): string {
  const code = stripComments(sql);
  const start = code.search(DEFINITION);
  assert.ok(start >= 0, `${NEW_FILE} does not define public.is_allowed_media_url`);
  return code.slice(start, code.indexOf('$', start));
}

test('the original applied migration still shows the three buckets and the two Mux prefixes', () => {
  assert.deepEqual(ORIGINAL_BUCKETS, ['meal-photos', 'post-videos', 'avatars']);
  assert.deepEqual(ORIGINAL_MUX, ['https://image.mux.com/', 'https://stream.mux.com/']);
});

test('the 1.3 migration is the latest definition of is_allowed_media_url', () => {
  newSql();
  const definers = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => DEFINITION.test(stripComments(read(f))));
  assert.equal(definers[definers.length - 1], NEW_FILE, `latest definition is ${definers[definers.length - 1]}`);
});

test('the 1.3 migration carries no production ref or literal supabase.co host', () => {
  const sql = newSql();
  assert.equal(sql.includes(PROD_REF), false);
  assert.doesNotMatch(stripComments(sql), /supabase\.co\//);
});

test('same signature, pinned search_path, SECURITY DEFINER to read Vault, re-runnable', () => {
  const sql = newSql();
  const head = header(sql);
  assert.match(head, /public\.is_allowed_media_url\s*\(\s*p_url\s+text\s*\)\s*returns\s+boolean/i);
  assert.match(head, /\bsecurity\s+definer\b/i);
  assert.match(head, /\bset\s+search_path\s+to\s+'public'/i);
  assert.match(head, /\bstable\b/i);
  assert.doesNotMatch(head, /\bimmutable\b/i, 'the result depends on a Vault row, so it cannot be IMMUTABLE');
  const code = stripComments(sql);
  assert.doesNotMatch(code, /create\s+function/i, 'use CREATE OR REPLACE so the migration re-runs');
  assert.doesNotMatch(code, /\bdrop\s+function\b/i, 'dropping would lose grants and break dependent CHECK constraints');
  assert.doesNotMatch(code, /\b(insert\s+into|update|delete\s+from)\s+vault\./i, 'the migration must not write Vault');
  assert.doesNotMatch(code, /\b(grant|revoke)\b/i, 'grants stay as they are');
});

test('reads project_base_url from vault.decrypted_secrets', () => {
  const body = functionBody(newSql());
  assert.match(body, /from\s+vault\.decrypted_secrets\b[\s\S]*?\bname\s*=\s*'project_base_url'/i);
  assert.match(body, /select\s+\w+\.decrypted_secret\s+into\s+v_base\b|select\s+decrypted_secret\s+into\s+v_base\b/i);
});

test('raises when the secret is missing, empty or ends in a slash, before any allow decision', () => {
  const body = functionBody(newSql());
  const missing = body.match(/if\s+v_base\s+is\s+null\s+or\s+length\s*\(\s*btrim\s*\(\s*v_base\s*\)\s*\)\s*=\s*0\s+then\s+raise\s+exception\s+'([^']+)'/i);
  assert.ok(missing, 'no RAISE for a missing or empty project_base_url');
  assert.match(missing[1], /project_base_url/);
  assert.match(missing[1], /missing or empty/);
  const slash = body.match(/if\s+right\s*\(\s*v_base\s*,\s*1\s*\)\s*=\s*'\/'\s+then\s+raise\s+exception\s+'([^']+)'/i);
  assert.ok(slash, 'no RAISE for a trailing slash');
  const firstReturn = body.search(/\breturn\b/i);
  assert.ok(firstReturn > body.indexOf(missing[0]) && firstReturn > body.indexOf(slash[0]), 'a return precedes the RAISE');
  assert.equal((body.match(/\breturn\b/gi) ?? []).length, 1, 'exactly one return, after the checks');
  assert.doesNotMatch(body, /\bexception\s+when\b/i, 'an exception handler would swallow the RAISE');
  assert.doesNotMatch(body, /coalesce\s*\(\s*v_base/i, 'no fallback value for the base URL');
});

// Lift the allow rules out of the single RETURN and evaluate them in JS.
type Rule = { kind: 'base'; suffix: string } | { kind: 'literal'; prefix: string };
function rules(body: string): Rule[] {
  const ret = body.match(/\breturn\s+p_url\s+is\s+not\s+null\s+and\s*\(([\s\S]*?)\)\s*;\s*end\s*;/i);
  assert.ok(ret, 'RETURN is not of the form: p_url is not null and (...)');
  const parts = ret[1].split(/\bor\b/i).map((p) => p.trim());
  return parts.map((part) => {
    const base = part.match(/^starts_with\s*\(\s*p_url\s*,\s*v_base\s*\|\|\s*'([^']*)'\s*\)$/i);
    if (base) return { kind: 'base', suffix: base[1] };
    const lit = part.match(/^p_url\s+like\s+'([^'%_]*)%'$/i);
    if (lit) return { kind: 'literal', prefix: lit[1] };
    assert.fail(`unrecognised allow rule: ${part}`);
  });
}

function allowed(rs: Rule[], base: string, url: string | null): boolean {
  if (url === null) return false;
  return rs.some((r) => (r.kind === 'base' ? url.startsWith(base + r.suffix) : url.startsWith(r.prefix)));
}

test('storage prefixes are project_base_url plus the original three buckets; Mux prefixes unchanged', () => {
  const rs = rules(functionBody(newSql()));
  const suffixes = rs.filter((r) => r.kind === 'base').map((r) => (r as { suffix: string }).suffix);
  assert.deepEqual(suffixes, ORIGINAL_BUCKETS.map((b) => `/storage/v1/object/public/${b}/`));
  const literals = rs.filter((r) => r.kind === 'literal').map((r) => (r as { prefix: string }).prefix);
  assert.deepEqual(literals, ORIGINAL_MUX);
});

test('evaluated against a test project base URL', () => {
  const rs = rules(functionBody(newSql()));
  const TEST_BASE = 'https://abcdefghijklmnopqrst.supabase.co';
  for (const bucket of ORIGINAL_BUCKETS) {
    assert.equal(allowed(rs, TEST_BASE, `${TEST_BASE}/storage/v1/object/public/${bucket}/u/1.jpg`), true, bucket);
    assert.equal(allowed(rs, TEST_BASE, `${PROD_BASE}/storage/v1/object/public/${bucket}/u/1.jpg`), false, `prod ${bucket}`);
  }
  assert.equal(allowed(rs, TEST_BASE, 'https://image.mux.com/abc/thumbnail.jpg'), true);
  assert.equal(allowed(rs, TEST_BASE, 'https://stream.mux.com/abc.m3u8'), true);
  assert.equal(allowed(rs, TEST_BASE, `${TEST_BASE}/storage/v1/object/public/other-bucket/x.jpg`), false);
  assert.equal(allowed(rs, TEST_BASE, `${TEST_BASE}/storage/v1/object/sign/meal-photos/x.jpg`), false);
  assert.equal(allowed(rs, TEST_BASE, `${TEST_BASE}.evil.example/storage/v1/object/public/avatars/x.jpg`), false);
  assert.equal(allowed(rs, TEST_BASE, 'https://evil.example/meal-photos/x.jpg'), false);
  assert.equal(allowed(rs, TEST_BASE, null), false);
  // The production base reproduces the original allowlist exactly.
  for (const bucket of ORIGINAL_BUCKETS) {
    assert.equal(allowed(rs, PROD_BASE, `${PROD_BASE}/storage/v1/object/public/${bucket}/u/1.jpg`), true, bucket);
  }
});
