import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { fixtureModule, plain } from './helpers/fixture-module';

type Result = { ok: true } | { ok: false; reason: 'invalid_email' | 'failed' };
type Waitlist = { joinWaitlist(email: string, zip?: string): Promise<Result> };

function setup(reply: () => Response | Promise<Response> = () => new Response(null, { status: 201 })) {
  const requests: { url: URL; headers: Headers; method: string; body: unknown }[] = [];
  const configurations: any[] = [];
  let storageReads = 0;
  const api = fixtureModule<Waitlist>('src/lib/waitlist.ts', {
    './supabase': { SUPABASE_URL: 'https://waitlist.example.invalid', SUPABASE_ANON: 'synthetic-anon-key' },
    '@supabase/supabase-js': {
      createClient(url: string, key: string, options: any) {
        configurations.push(plain(options));
        return createClient(url, key, {
          ...options,
          auth: {
            ...options.auth,
            storage: {
              getItem: () => { storageReads++; throw new Error('Must not load an app session'); },
              setItem: () => { throw new Error('Must not persist an app session'); }, removeItem: () => {},
            },
          },
          global: { fetch: async (input, init) => {
            requests.push({ url: new URL(String(input)), headers: new Headers(init?.headers), method: init?.method ?? 'GET', body: JSON.parse(String(init?.body)) });
            return reply(); // Real SDK, intercepted transport: no network request can escape.
          } },
        });
      },
    },
  });
  return { ...api, requests, configurations, storageReads: () => storageReads };
}

test('signup uses the real SDK to issue one trimmed insert without read-back', async () => {
  const f = setup();
  assert.deepEqual(plain(await f.joinWaitlist('  Person@example.invalid  ', ' 60601 ')), { ok: true });
  assert.equal(f.requests.length, 1);
  const request = f.requests[0];
  assert.equal(request.method, 'POST');
  assert.equal(request.url.pathname, '/rest/v1/waitlist');
  assert.equal(request.url.search, '');
  assert.equal(request.headers.get('authorization'), 'Bearer synthetic-anon-key');
  assert.ok(!request.headers.get('prefer')?.includes('return=representation'));
  assert.deepEqual(request.body, { email: 'Person@example.invalid', zip: '60601', source: 'app' });
});

test('empty ZIP becomes null and no extra writable columns are sent', async () => {
  const f = setup();
  await f.joinWaitlist('person@example.invalid', ' ');
  assert.deepEqual(f.requests[0].body, { email: 'person@example.invalid', zip: null, source: 'app' });
});

test('invalid and oversized emails never construct a client or send a request', async () => {
  const f = setup();
  for (const email of ['', ' ', 'missing-at', 'a@b', 'a b@example.invalid', 'a@@example.invalid', 'a'.repeat(310) + '@example.invalid']) {
    assert.deepEqual(plain(await f.joinWaitlist(email)), { ok: false, reason: 'invalid_email' });
  }
  assert.equal(f.requests.length, 0);
  assert.equal(f.configurations.length, 0);
});

test('anonymous client ignores session storage and explicitly disables URL session detection', async () => {
  const f = setup();
  await f.joinWaitlist('signed-in-visitor@example.invalid');
  assert.equal(f.storageReads(), 0);
  assert.equal(f.configurations[0].auth.persistSession, false);
  assert.equal(f.configurations[0].auth.autoRefreshToken, false);
  assert.equal(f.configurations[0].auth.detectSessionInUrl, false);
  assert.equal(f.requests[0].headers.get('authorization'), 'Bearer synthetic-anon-key');
});

test('duplicate email gets the same successful result without selecting or updating', async () => {
  const f = setup(() => new Response(JSON.stringify({ code: '23505', message: 'duplicate key' }), { status: 409 }));
  assert.deepEqual(plain(await f.joinWaitlist('existing@example.invalid')), { ok: true });
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].method, 'POST');
});

for (const [status, code] of [[403, '42501'], [500, 'XX000'], [409, 'unexpected_conflict']] as const) {
  test(`backend ${status}/${code} is a retryable failure, not a successful signup`, async () => {
    const f = setup(() => new Response(JSON.stringify({ code, message: 'backend rejected insert' }), { status }));
    assert.deepEqual(plain(await f.joinWaitlist('person@example.invalid')), { ok: false, reason: 'failed' });
  });
}

test('a rejected transport becomes a controlled failure', async () => {
  const f = setup(() => { throw new TypeError('synthetic offline'); });
  assert.deepEqual(plain(await f.joinWaitlist('person@example.invalid')), { ok: false, reason: 'failed' });
});

test('a client initialization exception becomes a controlled failure', async () => {
  const api = fixtureModule<Waitlist>('src/lib/waitlist.ts', {
    './supabase': { SUPABASE_URL: 'https://waitlist.example.invalid', SUPABASE_ANON: 'synthetic-anon-key' },
    '@supabase/supabase-js': { createClient: () => { throw new Error('synthetic initialization error'); } },
  });
  assert.deepEqual(plain(await api.joinWaitlist('person@example.invalid')), { ok: false, reason: 'failed' });
});
