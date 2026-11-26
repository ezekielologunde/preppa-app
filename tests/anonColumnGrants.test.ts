// Web launch S12: anon (signed-out guest browse) reads only allowlisted columns of kitchens, reviews,
// plans and plan_items, and the SELECT policies that read kitchens.owner_id run through a definer
// helper so they keep working for anon.
//
// No Postgres runs here, so these are static checks over the migration text. The smoke script
// supabase/tests/anon_browse_smoke.sql runs the real queries.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = join(__dirname, '..');
const MIGRATION = join(ROOT, 'supabase', 'migrations', '20260927005000_anon_column_grants.sql');
const TABLES = ['kitchens', 'reviews', 'plans', 'plan_items'];
const WITHHELD: Record<string, string[]> = {
  kitchens: ['owner_id', 'cod_enabled', 'cod_paused', 'approved_at', 'rejection_reason', 'suspension_reason',
    'service_categories', 'approval_notice_seen_at', 'updated_at'],
  reviews: ['author_id', 'order_id', 'booking_id'],
  plans: ['stripe_price_id', 'tax_bps', 'interval', 'service_area', 'photo_urls', 'updated_at'],
  plan_items: [],
};
const REWRITTEN: Array<[string, string]> = [
  ['plans_read_active', 'plans'],
  ['plan_items_read', 'plan_items'],
  ['posts_public_read', 'posts'],
  ['subs_customer_read', 'subscriptions'],
  ['quotes_read', 'quotes'],
  ['bookings_read', 'bookings'],
  ['kitchen_private_owner_or_admin_read', 'kitchen_private'],
];

// Lower-case, drop -- comments, collapse whitespace. None of the SQL here has '--' inside a string literal.
const norm = (sql: string): string =>
  sql.replace(/\r\n/g, '\n').replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').toLowerCase().trim();

function migration(): string {
  assert.ok(existsSync(MIGRATION), 'the S12 migration must exist');
  return norm(readFileSync(MIGRATION, 'utf8'));
}

const src = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

function anonGrant(sql: string, table: string): string[] {
  const m = new RegExp(`grant select \\(([^)]*)\\) on public\\.${table} to anon;`).exec(sql);
  assert.ok(m, `anon gets a column grant on ${table}`);
  return m[1].split(',').map((c) => c.trim());
}

// Columns named in a PostgREST embed such as kitchens!inner(name, avatar_url) in a source file.
function embedColumns(rel: string, embed: string): string[] {
  const m = new RegExp(`${embed}(?:!inner)?\\(([^)]*)\\)`).exec(src(rel));
  assert.ok(m, `${rel} still embeds ${embed}(...)`);
  return m[1].split(',').map((c) => c.trim());
}

test('each table grant is revoked from anon before the column grant', () => {
  const sql = migration();
  for (const t of TABLES) {
    const revoke = sql.indexOf(`revoke select on public.${t} from anon;`);
    const grant = sql.indexOf(`grant select (`, revoke);
    assert.ok(revoke >= 0, `table-level SELECT on ${t} is revoked from anon`);
    assert.ok(grant > revoke && sql.indexOf(`on public.${t} to anon;`, revoke) > revoke, `${t} column grant follows its revoke`);
    assert.ok(sql.indexOf(`on public.${t} to anon;`) > revoke, `no ${t} anon grant precedes the revoke`);
    assert.equal(new RegExp(`grant select on public\\.${t} to anon`).test(sql), false, `no table-level re-grant on ${t}`);
  }
});

test('no withheld column is in any anon grant', () => {
  const sql = migration();
  for (const t of TABLES) {
    const cols = anonGrant(sql, t);
    for (const c of WITHHELD[t]) assert.equal(cols.includes(c), false, `${t}.${c} withheld from anon`);
    assert.equal(cols.some((c) => c.startsWith('in_home_vetting')), false, `${t}: in_home_vetting_* withheld`);
  }
});

test('authenticated, service_role and default privileges are untouched', () => {
  const sql = migration();
  assert.equal(/revoke [^;]* from [^;]*(authenticated|service_role)/.test(sql.replace('revoke all on function public.owned_kitchen_ids() from public;', '')), false);
  assert.equal(/grant [^;]* on public\.(kitchens|reviews|plans|plan_items) to [^;]*(authenticated|service_role)/.test(sql), false);
  assert.equal(sql.includes('alter default privileges'), false);
});

test('the helper is SECURITY DEFINER with search_path set, executable by anon and authenticated only', () => {
  const sql = migration();
  assert.match(
    sql,
    /create or replace function public\.owned_kitchen_ids\(\) returns setof uuid language sql stable security definer set search_path to 'public' as \$function\$ select k\.id from public\.kitchens k where k\.owner_id = \(select auth\.uid\(\)\); \$function\$;/,
  );
  assert.ok(sql.includes('revoke all on function public.owned_kitchen_ids() from public;'));
  const grants = sql.match(/grant [^;]* on function [^;]*;/g) ?? [];
  assert.deepEqual(grants, ['grant execute on function public.owned_kitchen_ids() to anon, authenticated;']);
});

test('every rewritten policy is dropped if it exists, re-created, and no longer reads kitchens.owner_id', () => {
  const sql = migration();
  for (const [name, table] of REWRITTEN) {
    const drop = sql.indexOf(`drop policy if exists ${name} on public.${table};`);
    const create = sql.indexOf(`create policy ${name} on public.${table} for select `);
    assert.ok(drop >= 0 && create > drop, `${name} dropped then re-created`);
    const end = sql.indexOf('drop policy if exists', create);
    const body = sql.slice(create, end < 0 ? undefined : end);
    assert.ok(body.includes('(select public.owned_kitchen_ids())'), `${name} uses the helper`);
    assert.equal(body.includes('owner_id'), false, `${name} reads no owner_id`);
    assert.equal(/auth\.uid\(\)/.test(body.replace(/\(select auth\.uid\(\)\)/g, '')), false, `${name} wraps auth.uid()`);
  }
  assert.ok(sql.includes('create policy posts_public_read on public.posts for select to anon, authenticated using'), 'posts roles kept');
  const creates = sql.match(/create policy \w+/g) ?? [];
  assert.equal(creates.length, REWRITTEN.length, 'only the listed policies are re-created');
});

test('every column the signed-out client paths read is in the anon grant', () => {
  const sql = migration();
  const kitchens = anonGrant(sql, 'kitchens');
  const need = new Set<string>([
    ...embedColumns('src/data/supabaseRepository.ts', 'kitchens'),
    ...embedColumns('src/lib/orders.ts', 'kitchens'),
    ...embedColumns('src/lib/feed.ts', 'kitchens'),
    ...embedColumns('src/lib/livestream.ts', 'kitchens'),
    'id',
    'verification_status',
  ]);
  const views = readFileSync(join(ROOT, 'supabase', 'migrations', '20260809031720_kitchen_public_expose_fulfillment.sql'), 'utf8');
  const view = /create or replace view kitchen_public\s+as\s+select\s+([\s\S]*?)\s+from\s+kitchens/i.exec(views);
  assert.ok(view, 'kitchen_public definition parsed');
  for (const c of view[1].split(',')) need.add(c.trim());
  for (const c of need) assert.ok(kitchens.includes(c), `kitchens.${c} granted to anon`);

  const reviews = anonGrant(sql, 'reviews');
  const hooks = /from\('reviews'\)\.select\('([^']*)'\)/.exec(src('src/data/hooks.ts'));
  assert.ok(hooks, 'reviews select parsed');
  for (const c of [...hooks[1].split(','), 'kitchen_id']) assert.ok(reviews.includes(c.trim()), `reviews.${c} granted to anon`);

  const planSelect = /const PLAN_SELECT =\s*'([^']*)'/.exec(src('src/lib/subscriptions.ts'));
  assert.ok(planSelect, 'PLAN_SELECT parsed');
  const top = planSelect[1].replace(/\w+\([^()]*(\([^()]*\))?[^()]*\)/g, '').split(',').map((c) => c.trim()).filter(Boolean);
  const plans = anonGrant(sql, 'plans');
  for (const c of [...top, 'created_at']) assert.ok(plans.includes(c), `plans.${c} granted to anon`);
  const items = /plan_items\(([^()]*?),?\s*meals\(/.exec(planSelect[1]);
  assert.ok(items, 'plan_items embed parsed');
  const planItems = anonGrant(sql, 'plan_items');
  for (const c of [...items[1].split(','), 'plan_id']) assert.ok(planItems.includes(c.trim()), `plan_items.${c} granted to anon`);
});

test('regressions.sql and the smoke script cover the grants', () => {
  const reg = src('supabase/tests/regressions.sql');
  assert.ok(reg.includes("has_column_privilege('anon', 'public.' || c.tbl, c.col, 'select')"));
  assert.ok(reg.includes("has_column_privilege('authenticated', 'public.kitchens', 'owner_id', 'select')"));
  const smoke = src('supabase/tests/anon_browse_smoke.sql');
  assert.match(smoke, /^[\s\S]*\nbegin;\n[\s\S]*set local role anon;[\s\S]*reset role;[\s\S]*\nrollback;\n$/);
  for (const col of ["('kitchens', 'owner_id')", "('reviews', 'author_id')", "('plans', 'stripe_price_id')"]) {
    assert.ok(smoke.includes(col), `smoke checks ${col} raises`);
  }
  assert.ok(smoke.includes('exception when insufficient_privilege then'));
});
