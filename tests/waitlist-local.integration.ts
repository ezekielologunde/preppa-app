// Opt-in only: requires a separately provisioned, task-owned local Supabase fixture.
// Never included in npm test. No hosted URL, service-role API key, Docker startup,
// database reset, or cleanup is performed by this file.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { fixtureModule, plain } from './helpers/fixture-module';

const fixture = process.env.PREPPA_WAITLIST_FIXTURE;
if (!fixture || !basename(fixture).startsWith('preppa-waitlist-supabase-')) {
  throw new Error('Set PREPPA_WAITLIST_FIXTURE to the separately approved disposable fixture');
}
const baseline = JSON.parse(readFileSync(resolve(fixture, 'baseline-resources.json'), 'utf8').replace(/^\uFEFF/, ''));
const status = JSON.parse(readFileSync(resolve(fixture, 'local-status.json'), 'utf8').replace(/^\uFEFF/, ''));
const url = 'http://127.0.0.1:55321';
assert.equal(status.API_URL, url, 'Only the approved loopback API endpoint is permitted');
assert.match(baseline.project, /^preppa-waitlist-\d{8}-\d{4}$/);
const key: string = status.ANON_KEY;
assert.ok(typeof key === 'string' && JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon', 'Only a local anon key is permitted');

const name = `supabase_db_${baseline.project}`;
assert.ok(!baseline.containers.includes(name), 'Database must not predate this task');
const db = JSON.parse(execFileSync('docker', ['inspect', name], { encoding: 'utf8' }))[0];
assert.equal(db.Config.Labels['com.supabase.cli.project'], baseline.project);
assert.deepEqual(Object.keys(db.NetworkSettings.Networks), [baseline.network]);
assert.ok(db.Mounts.some((mount: any) => mount.Name === `supabase_db_${baseline.project}`));
assert.ok(db.Mounts.every((mount: any) => mount.Type === 'volume' && !baseline.volumes.includes(mount.Name)), 'Cannot mount preexisting data');
const network = JSON.parse(execFileSync('docker', ['network', 'inspect', baseline.network], { encoding: 'utf8' }))[0];
assert.equal(network.Options['com.docker.network.bridge.host_binding_ipv4'], '127.0.0.1');
assert.deepEqual(db.NetworkSettings.Ports['5432/tcp'], [{ HostIp: '127.0.0.1', HostPort: '55322' }], 'Database must publish only the approved loopback port');

function ownerSQL(sql: string) {
  return execFileSync('docker', ['exec', '-i', db.Id, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' }).trim();
}
function stored(email: string) {
  assert.match(email, /^waitlist-local-[a-f0-9-]+-[a-z]+@example\.invalid$/);
  return JSON.parse(ownerSQL(`select coalesce(json_agg(row_to_json(w)), '[]') from (select email, zip, source from public.waitlist where email = '${email}') w;`));
}

const requests: { path: string; method: string; status: number }[] = [];
let rejectKey = false;
const localFetch: typeof fetch = async (input, init) => {
  const target = new URL(input instanceof Request ? input.url : String(input));
  assert.equal(target.origin, url, 'No request may leave the approved local API');
  const headers = new Headers(init?.headers);
  if (rejectKey) {
    headers.set('apikey', 'synthetic-invalid-key');
    headers.set('authorization', 'Bearer synthetic-invalid-token');
  }
  const response = await fetch(input, { ...init, headers, redirect: 'error', signal: AbortSignal.timeout(10000) });
  requests.push({ path: target.pathname, method: init?.method ?? 'GET', status: response.status });
  return response;
};
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: localFetch } };
const anonymous = createClient(url, key, options);
const authenticated = createClient(url, key, options);
const { joinWaitlist } = fixtureModule<{ joinWaitlist(email: string, zip?: string): Promise<{ ok: boolean; reason?: string }> }>('src/lib/waitlist.ts', {
  './supabase': { SUPABASE_URL: url, SUPABASE_ANON: key },
  '@supabase/supabase-js': { createClient: (actualUrl: string, actualKey: string, config: any) => {
    assert.equal(actualUrl, url);
    assert.ok(actualKey === key, 'Unexpected API key');
    return createClient(actualUrl, actualKey, { ...config, global: { fetch: localFetch } });
  } },
});

test('real local Supabase waitlist flow (approved disposable fixture only)', async t => {
  const prefix = `waitlist-local-${randomUUID()}`;
  const email = (suffix: string) => `${prefix}-${suffix}@example.invalid`;
  const countBefore = Number(ownerSQL('select count(*) from public.waitlist;'));

  await t.test('Auth creates and validates a synthetic signed-in session', async () => {
    const signup = await authenticated.auth.signUp({ email: email('user'), password: `Test-${randomUUID()}!` });
    assert.equal(signup.error, null);
    assert.ok(signup.data.session, 'Local email confirmations must be disabled for this fixture');
    const user = await authenticated.auth.getUser();
    assert.equal(user.error, null);
    assert.equal(user.data.user?.email, email('user'));
    assert.equal(JSON.parse(Buffer.from(signup.data.session.access_token.split('.')[1], 'base64url').toString()).role, 'authenticated');
  });

  await t.test('actual signup helper inserts a trimmed anonymous row without read-back', async () => {
    assert.deepEqual(plain(await joinWaitlist(`  ${email('anon')}  `, ' 00000 ')), { ok: true });
    assert.deepEqual(stored(email('anon')), [{ email: email('anon'), zip: '00000', source: 'app' }]);
  });

  await t.test('signed-in SDK caller can insert the allowed columns', async () => {
    const result = await authenticated.from('waitlist').insert({ email: email('auth'), zip: null, source: 'app' });
    assert.equal(result.error, null);
    assert.equal(result.status, 201);
    assert.deepEqual(stored(email('auth')), [{ email: email('auth'), zip: null, source: 'app' }]);
  });

  for (const [role, client] of [['anon', anonymous], ['authenticated', authenticated]] as const) {
    await t.test(`${role} cannot read, update, delete, return rows, or set protected columns`, async () => {
      const responses = [
        await client.from('waitlist').select('*'),
        await client.from('waitlist').select('*').eq('email', email('anon')),
        await client.from('waitlist').update({ zip: '99999' }).eq('email', email('anon')),
        await client.from('waitlist').delete().eq('email', email('anon')),
        await client.from('waitlist').insert({ email: email(`return${role}`), source: 'app' }).select(),
        await client.from('waitlist').insert({ email: email(`id${role}`), id: randomUUID(), source: 'app' }),
        await client.from('waitlist').insert({ email: email(`date${role}`), created_at: new Date().toISOString(), source: 'app' }),
      ];
      for (const response of responses) {
        assert.equal(response.error?.code, '42501');
        assert.equal(response.data, null);
      }
      assert.equal(stored(email('anon'))[0].zip, '00000');
    });
  }

  await t.test('case-insensitive duplicate gives 23505; the helper reports success without overwriting', async () => {
    const duplicate = await anonymous.from('waitlist').insert({ email: email('anon').toUpperCase(), zip: '99999', source: 'app' });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.error?.code, '23505');
    assert.deepEqual(plain(await joinWaitlist(email('anon').toUpperCase(), '99999')), { ok: true });
    assert.deepEqual(stored(email('anon')), [{ email: email('anon'), zip: '00000', source: 'app' }]);
  });

  await t.test('three simultaneous helper submissions create exactly one row', async () => {
    const results = await Promise.all([joinWaitlist(email('repeat')), joinWaitlist(email('repeat')), joinWaitlist(email('repeat'))]);
    assert.ok(results.every(result => result.ok));
    assert.equal(stored(email('repeat')).length, 1);
  });

  await t.test('real gateway rejection shows failure and a valid retry then inserts once', async () => {
    rejectKey = true;
    try {
      assert.deepEqual(plain(await joinWaitlist(email('retry'))), { ok: false, reason: 'failed' });
      assert.equal(requests.at(-1)?.status, 401);
      assert.equal(stored(email('retry')).length, 0);
    } finally { rejectKey = false; }
    assert.deepEqual(plain(await joinWaitlist(email('retry'))), { ok: true });
    assert.equal(stored(email('retry')).length, 1);
  });

  await t.test('a real fixture PostgREST outage fails safely and recovers after restart', async () => {
    const restName = `supabase_rest_${baseline.project}`;
    assert.ok(!baseline.containers.includes(restName));
    const rest = JSON.parse(execFileSync('docker', ['inspect', restName], { encoding: 'utf8' }))[0];
    assert.equal(rest.Config.Labels['com.supabase.cli.project'], baseline.project);
    assert.deepEqual(Object.keys(rest.NetworkSettings.Networks), [baseline.network]);
    execFileSync('docker', ['stop', '--time', '5', rest.Id], { stdio: 'pipe' });
    try {
      assert.deepEqual(plain(await joinWaitlist(email('outage'))), { ok: false, reason: 'failed' });
      assert.equal(stored(email('outage')).length, 0);
    } finally {
      execFileSync('docker', ['start', rest.Id], { stdio: 'pipe' });
    }
    let recovered = false;
    for (let attempt = 0; attempt < 15; attempt++) {
      const response = await localFetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      if (response.ok) { recovered = true; break; }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(recovered, 'Fixture PostgREST did not recover');
    assert.deepEqual(plain(await joinWaitlist(email('outage'))), { ok: true });
    assert.equal(stored(email('outage')).length, 1);
  });

  await t.test('rejected operations left only the five intended synthetic rows', () => {
    assert.equal(Number(ownerSQL('select count(*) from public.waitlist;')), countBefore + 5);
  });
});
