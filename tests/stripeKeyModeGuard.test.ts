// DESIGN 1.1g / SECURITY-SPEC S8: key-mode and account guard in the three vendored Stripe wrappers.
//
// The functions are Deno bundles, so nothing here imports them. Each test reads the wrapper source as text
// and evaluates either the guard block (between its BEGIN/END marker comments) or the whole wrapper section
// (from the bundle's `// src/supabase/edge-functions/<name>.ts` comment to the end of the file) inside a
// node:vm context whose only globals are stubs: Deno.env, fetch, console, StripeSync and the postgres client.
// Nothing reaches the network, a database or Stripe.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const FUNCTIONS = ['stripe-setup', 'stripe-webhook', 'stripe-worker'] as const;
type FunctionName = (typeof FUNCTIONS)[number];

const PROD_REF = 'fwidhpzwldneeaphrxgg';
const TEST_REF = 'abcdefghijklmnopqrst';
const PROD_URL = `https://${PROD_REF}.supabase.co`;
const TEST_URL = `https://${TEST_REF}.supabase.co`;
const EXPECTED_ACCOUNT = 'acct_1GuardExpected';
const OTHER_ACCOUNT = 'acct_1GuardSomeoneElse';
const SK_LIVE = 'sk_live_GuardFixtureLiveKey';
const RK_LIVE = 'rk_live_GuardFixtureLiveKey';
const SK_TEST = 'sk_test_GuardFixtureTestKey';
const RK_TEST = 'rk_test_GuardFixtureTestKey';
const DB_URL = 'postgres://guard-fixture-db';
const VAULT_SECRET = 'guard-fixture-vault-secret';
const FAILURE_BODY = { error: 'Stripe configuration check failed' };
const SECRET_VALUES = [PROD_REF, TEST_REF, EXPECTED_ACCOUNT, OTHER_ACCOUNT, SK_LIVE, RK_LIVE, SK_TEST, RK_TEST];

type Env = Record<string, string | undefined>;
type Guard = { stripeKeyModeGuard: () => Promise<boolean>; stripeGuardFailureResponse: () => Response };
type Handler = (req: Request) => Promise<Response>;

const sourceCache = new Map<FunctionName, string>();
function source(name: FunctionName): string {
  let text = sourceCache.get(name);
  if (text === undefined) {
    text = readFileSync(join(__dirname, '..', 'supabase', 'functions', name, 'index.ts'), 'utf8').replace(/\r\n/g, '\n');
    sourceCache.set(name, text);
  }
  return text;
}

function sliceOnce(text: string, startMarker: string, endMarker?: string): string {
  const start = text.indexOf(startMarker);
  assert.ok(start >= 0, `missing marker: ${startMarker}`);
  assert.equal(text.indexOf(startMarker, start + 1), -1, `marker appears more than once: ${startMarker}`);
  if (endMarker === undefined) return text.slice(start);
  const end = text.indexOf(endMarker, start);
  assert.ok(end > start, `missing marker: ${endMarker}`);
  return text.slice(start, end + endMarker.length);
}

function guardBlock(name: FunctionName): string {
  return sliceOnce(source(name), '// BEGIN stripe-key-mode-guard', '// END stripe-key-mode-guard');
}

function wrapperSection(name: FunctionName): string {
  return sliceOnce(source(name), `// src/supabase/edge-functions/${name}.ts`);
}

function accountResponse(id: string, status = 200): Response {
  return new Response(JSON.stringify({ id, object: 'account' }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Stubbed outside world for one evaluation. `respond` answers the one fetch the guard may make.
function makeWorld(env: Env, respond: () => Response | Promise<Response> = () => accountResponse(EXPECTED_ACCOUNT)) {
  const fetchCalls: { url: string; init?: RequestInit }[] = [];
  const logs: string[] = [];
  const record = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  };
  return {
    fetchCalls,
    logs,
    globals: {
      Deno: { env: { get: (key: string) => env[key] } } as Record<string, unknown>,
      fetch: async (url: unknown, init?: RequestInit) => {
        fetchCalls.push({ url: String(url), init });
        return respond();
      },
      console: { log: record, info: record, warn: record, error: record, debug: record },
      Response,
      AbortSignal,
    } as Record<string, unknown>,
  };
}

function loadGuard(name: FunctionName, world: ReturnType<typeof makeWorld>): Guard {
  const context = vm.createContext({ ...world.globals });
  vm.runInContext(guardBlock(name), context, { filename: `${name}/index.ts (guard block)` });
  return context as unknown as Guard;
}

async function refusalBody(response: Response): Promise<string> {
  assert.equal(response.status, 500);
  const text = await response.text();
  assert.deepEqual(JSON.parse(text), FAILURE_BODY);
  return text;
}

function assertNoLeak(label: string, ...texts: string[]) {
  for (const text of texts) {
    for (const value of SECRET_VALUES) {
      assert.ok(!text.includes(value), `${label}: output leaks ${value}`);
    }
  }
}

function env(overrides: Env): Env {
  return { STRIPE_EXPECTED_ACCOUNT: EXPECTED_ACCOUNT, SUPABASE_DB_URL: DB_URL, ...overrides };
}

const REFUSALS_WITHOUT_LOOKUP: { label: string; env: Env }[] = [
  { label: 'live secret key on a non-production ref', env: env({ SUPABASE_URL: TEST_URL, STRIPE_SECRET_KEY: SK_LIVE }) },
  { label: 'live restricted key on a non-production ref', env: env({ SUPABASE_URL: TEST_URL, STRIPE_SECRET_KEY: RK_LIVE }) },
  { label: 'test secret key on the production ref', env: env({ SUPABASE_URL: PROD_URL, STRIPE_SECRET_KEY: SK_TEST }) },
  { label: 'test restricted key on the production ref', env: env({ SUPABASE_URL: PROD_URL, STRIPE_SECRET_KEY: RK_TEST }) },
  { label: 'publishable key in place of the secret key', env: env({ SUPABASE_URL: TEST_URL, STRIPE_SECRET_KEY: 'pk_test_GuardFixture' }) },
  { label: 'missing STRIPE_SECRET_KEY', env: env({ SUPABASE_URL: TEST_URL, STRIPE_SECRET_KEY: undefined }) },
  { label: 'missing STRIPE_EXPECTED_ACCOUNT', env: env({ SUPABASE_URL: TEST_URL, STRIPE_SECRET_KEY: SK_TEST, STRIPE_EXPECTED_ACCOUNT: undefined }) },
  { label: 'empty STRIPE_EXPECTED_ACCOUNT', env: env({ SUPABASE_URL: PROD_URL, STRIPE_SECRET_KEY: SK_LIVE, STRIPE_EXPECTED_ACCOUNT: '' }) },
  { label: 'missing SUPABASE_URL', env: env({ SUPABASE_URL: undefined, STRIPE_SECRET_KEY: SK_TEST }) },
  { label: 'SUPABASE_URL over http', env: env({ SUPABASE_URL: `http://${PROD_REF}.supabase.co`, STRIPE_SECRET_KEY: SK_LIVE }) },
  { label: 'SUPABASE_URL on a look-alike host', env: env({ SUPABASE_URL: `https://${PROD_REF}.supabase.co.example.com`, STRIPE_SECRET_KEY: SK_LIVE }) },
  { label: 'SUPABASE_URL with a path', env: env({ SUPABASE_URL: `${PROD_URL}/rest/v1`, STRIPE_SECRET_KEY: SK_LIVE }) },
  { label: 'SUPABASE_URL that is not a URL', env: env({ SUPABASE_URL: 'not a url', STRIPE_SECRET_KEY: SK_TEST }) },
];

const ALLOWED_PAIRS: { label: string; url: string; key: string }[] = [
  { label: 'production ref with sk_live_', url: PROD_URL, key: SK_LIVE },
  { label: 'production ref with rk_live_', url: PROD_URL, key: RK_LIVE },
  { label: 'production ref with trailing slash and sk_live_', url: `${PROD_URL}/`, key: SK_LIVE },
  { label: 'non-production ref with sk_test_', url: TEST_URL, key: SK_TEST },
  { label: 'non-production ref with rk_test_', url: TEST_URL, key: RK_TEST },
];

test('the guard block is identical in all three vendored wrappers', () => {
  const [first, ...rest] = FUNCTIONS.map(guardBlock);
  for (const block of rest) assert.equal(block, first);
  assert.ok(first.includes(`"${PROD_REF}"`), 'guard names the production ref');
});

for (const name of FUNCTIONS) {
  test(`${name}: refuses with no outbound call when the key mode or configuration is wrong`, async () => {
    for (const scenario of REFUSALS_WITHOUT_LOOKUP) {
      const world = makeWorld(scenario.env);
      const guard = loadGuard(name, world);
      assert.equal(await guard.stripeKeyModeGuard(), false, scenario.label);
      assert.equal(world.fetchCalls.length, 0, `${scenario.label}: no fetch at all`);
      assert.ok(world.logs.length > 0, `${scenario.label}: refusal is logged`);
      assertNoLeak(`${name} ${scenario.label}`, ...world.logs, await refusalBody(guard.stripeGuardFailureResponse()));
    }
  });

  test(`${name}: refuses when the Stripe account is not STRIPE_EXPECTED_ACCOUNT, after exactly one lookup`, async () => {
    const lookups: { label: string; url: string; key: string; respond: () => Response | Promise<Response> }[] = [
      { label: 'test env, other account', url: TEST_URL, key: SK_TEST, respond: () => accountResponse(OTHER_ACCOUNT) },
      { label: 'prod env, other account', url: PROD_URL, key: SK_LIVE, respond: () => accountResponse(OTHER_ACCOUNT) },
      { label: 'lookup rejected by Stripe', url: TEST_URL, key: SK_TEST, respond: () => accountResponse(EXPECTED_ACCOUNT, 401) },
      { label: 'lookup network failure', url: PROD_URL, key: SK_LIVE, respond: () => Promise.reject(new TypeError(`fetch failed for ${SK_LIVE}`)) },
      { label: 'lookup returns no id', url: TEST_URL, key: SK_TEST, respond: () => new Response('{}', { status: 200 }) },
      { label: 'lookup returns non-JSON', url: TEST_URL, key: SK_TEST, respond: () => new Response(`<html>${EXPECTED_ACCOUNT}</html>`, { status: 200 }) },
    ];
    for (const scenario of lookups) {
      const world = makeWorld(env({ SUPABASE_URL: scenario.url, STRIPE_SECRET_KEY: scenario.key }), scenario.respond);
      const guard = loadGuard(name, world);
      assert.equal(await guard.stripeKeyModeGuard(), false, scenario.label);
      assert.equal(world.fetchCalls.length, 1, `${scenario.label}: only the account lookup`);
      assert.equal(world.fetchCalls[0].url, 'https://api.stripe.com/v1/account');
      assertNoLeak(`${name} ${scenario.label}`, ...world.logs, await refusalBody(guard.stripeGuardFailureResponse()));
    }
  });

  test(`${name}: allows a matching key mode and account with one GET /v1/account`, async () => {
    for (const pair of ALLOWED_PAIRS) {
      const world = makeWorld(env({ SUPABASE_URL: pair.url, STRIPE_SECRET_KEY: pair.key }));
      const guard = loadGuard(name, world);
      assert.equal(await guard.stripeKeyModeGuard(), true, pair.label);
      assert.equal(world.fetchCalls.length, 1, pair.label);
      const [call] = world.fetchCalls;
      assert.equal(call.url, 'https://api.stripe.com/v1/account');
      assert.equal(call.init?.method, 'GET');
      const headers = { ...(call.init?.headers as Record<string, string>) };
      assert.deepEqual(headers, { Authorization: `Bearer ${pair.key}` });
      assert.equal(world.logs.length, 0, `${pair.label}: nothing logged on success`);
    }
  });

  test(`${name}: caches a verified result per isolate and retries after a failure`, async () => {
    const verified = makeWorld(env({ SUPABASE_URL: TEST_URL, STRIPE_SECRET_KEY: SK_TEST }));
    const guard = loadGuard(name, verified);
    assert.equal(await guard.stripeKeyModeGuard(), true);
    assert.equal(await guard.stripeKeyModeGuard(), true);
    assert.equal(await guard.stripeKeyModeGuard(), true);
    assert.equal(verified.fetchCalls.length, 1, 'one lookup for many calls');

    let answer = OTHER_ACCOUNT;
    const flaky = makeWorld(env({ SUPABASE_URL: TEST_URL, STRIPE_SECRET_KEY: SK_TEST }), () => accountResponse(answer));
    const retrying = loadGuard(name, flaky);
    assert.equal(await retrying.stripeKeyModeGuard(), false);
    answer = EXPECTED_ACCOUNT;
    assert.equal(await retrying.stripeKeyModeGuard(), true);
    assert.equal(await retrying.stripeKeyModeGuard(), true);
    assert.equal(flaky.fetchCalls.length, 2, 'a refusal is not cached; a pass is');
  });
}

// ---- Wiring: the guard runs before StripeSync.create in each real wrapper ----

type StripeSyncStub = Record<string, unknown>;

// Evaluates a wrapper section with stubbed bundle dependencies and returns the Deno.serve handler.
async function loadWrapper(name: FunctionName, world: ReturnType<typeof makeWorld>, stripeSync: StripeSyncStub) {
  const createCalls: Record<string, unknown>[] = [];
  const sqlCalls: string[] = [];
  const migrationCalls: unknown[] = [];
  let handler: Handler | undefined;
  const postgres = () => {
    const sql = async (strings: TemplateStringsArray) => {
      sqlCalls.push(strings.join('?'));
      return [{ decrypted_secret: VAULT_SECRET }];
    };
    return Object.assign(sql, { end: async () => {}, unsafe: async () => [] });
  };
  const deno = world.globals.Deno as Record<string, unknown>;
  deno.serve = (fn: Handler) => {
    handler = fn;
  };
  const context = vm.createContext({
    ...world.globals,
    StripeSync: {
      create: async (config: Record<string, unknown>) => {
        createCalls.push(config);
        return stripeSync;
      },
    },
    StripeSyncWorker: class {},
    default6: postgres,
    runMigrationsFromContent: async (...args: unknown[]) => {
      migrationCalls.push(args);
    },
    embeddedMigrations: [],
    parseSchemaComment: () => ({ status: 'installed' }),
    VERSION: '0.0.0-guard-fixture',
    URL, // stripe-setup derives projectRef with new URL(SUPABASE_URL)
  });
  await vm.runInContext(`(async () => {\n${wrapperSection(name)}\n})()`, context, {
    filename: `${name}/index.ts (wrapper section)`,
  });
  assert.ok(handler, `${name} registers a Deno.serve handler`);
  return { handler, createCalls, sqlCalls, migrationCalls };
}

const MISMATCHED = env({ SUPABASE_URL: TEST_URL, STRIPE_SECRET_KEY: SK_LIVE });
const MATCHED = env({ SUPABASE_URL: TEST_URL, STRIPE_SECRET_KEY: SK_TEST });

function setupStripeSync(): StripeSyncStub {
  return {
    postgresClient: { query: async () => [], pool: { end: async () => {} } },
    webhook: {
      findOrCreateManagedWebhook: async () => ({ id: 'we_guard_fixture' }),
      listManagedWebhooks: async () => [],
    },
  };
}

test('stripe-setup: a refused key never reaches migrations, StripeSync.create or the management API', async () => {
  for (const method of ['POST', 'DELETE', 'GET']) {
    const world = makeWorld(MISMATCHED);
    const wrapper = await loadWrapper('stripe-setup', world, setupStripeSync());
    const response = await wrapper.handler(
      new Request(`${TEST_URL}/functions/v1/stripe-setup`, {
        method,
        headers: { Authorization: `Bearer ${VAULT_SECRET}`, 'x-management-api-token': 'sbp_guard_fixture' },
      }),
    );
    assertNoLeak(`stripe-setup ${method}`, await refusalBody(response), ...world.logs);
    assert.equal(wrapper.createCalls.length, 0, `${method}: no StripeSync.create`);
    assert.equal(wrapper.migrationCalls.length, 0, `${method}: no migrations`);
    assert.equal(world.fetchCalls.length, 0, `${method}: no fetch`);
    assert.deepEqual(
      wrapper.sqlCalls.map((q) => q.includes('vault.decrypted_secrets')),
      [true],
      `${method}: only the caller-secret check ran`,
    );
  }
});

test('stripe-setup: an unauthenticated caller is turned away before the guard looks anything up', async () => {
  const world = makeWorld(MATCHED);
  const wrapper = await loadWrapper('stripe-setup', world, setupStripeSync());
  const response = await wrapper.handler(new Request(`${TEST_URL}/functions/v1/stripe-setup`, { method: 'POST' }));
  assert.equal(response.status, 401);
  assert.equal(world.fetchCalls.length, 0);
});

test('stripe-setup: a verified key proceeds to setup with that key', async () => {
  const world = makeWorld(MATCHED);
  const wrapper = await loadWrapper('stripe-setup', world, setupStripeSync());
  const response = await wrapper.handler(
    new Request(`${TEST_URL}/functions/v1/stripe-setup`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${VAULT_SECRET}` },
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, message: 'Setup complete', webhookId: 'we_guard_fixture' });
  assert.equal(world.fetchCalls.length, 1);
  assert.equal(world.fetchCalls[0].url, 'https://api.stripe.com/v1/account');
  assert.equal(wrapper.migrationCalls.length, 1);
  assert.equal(wrapper.createCalls.length, 1);
  assert.equal(wrapper.createCalls[0].stripeSecretKey, SK_TEST);
});

function webhookRequest(body: string, signature = 't=1,v1=guardfixture'): Request {
  return new Request(`${TEST_URL}/functions/v1/stripe-webhook`, {
    method: 'POST',
    headers: { 'stripe-signature': signature },
    body,
  });
}

test('stripe-webhook: a refused key returns the generic 500 before StripeSync.create', async () => {
  const scenarios: { label: string; env: Env; respond?: () => Response; lookups: number }[] = [
    { label: 'live key on a non-production ref', env: MISMATCHED, lookups: 0 },
    { label: 'wrong account', env: MATCHED, respond: () => accountResponse(OTHER_ACCOUNT), lookups: 1 },
  ];
  for (const scenario of scenarios) {
    const world = makeWorld(scenario.env, scenario.respond);
    let processed = 0;
    const wrapper = await loadWrapper('stripe-webhook', world, {
      webhook: { processWebhook: async () => void processed++ },
      postgresClient: { pool: { end: async () => {} } },
    });
    const response = await wrapper.handler(webhookRequest('{"id":"evt_guard_fixture"}'));
    assertNoLeak(`stripe-webhook ${scenario.label}`, await refusalBody(response), ...world.logs);
    assert.equal(wrapper.createCalls.length, 0, scenario.label);
    assert.equal(processed, 0, scenario.label);
    assert.equal(world.fetchCalls.length, scenario.lookups, scenario.label);
  }
});

test('stripe-webhook: a verified key still hands the raw body and signature to signature verification', async () => {
  const world = makeWorld(MATCHED);
  const seen: { body: string; sig: string }[] = [];
  let failSignature = false;
  const wrapper = await loadWrapper('stripe-webhook', world, {
    webhook: {
      processWebhook: async (rawBody: Uint8Array, sig: string) => {
        seen.push({ body: Buffer.from(rawBody).toString('utf8'), sig });
        if (failSignature) throw new Error('No signatures found matching the expected signature for payload');
      },
    },
    postgresClient: { pool: { end: async () => {} } },
  });
  const body = '{"id":"evt_guard_fixture","type":"charge.succeeded"}';

  const ok = await wrapper.handler(webhookRequest(body, 't=1,v1=good'));
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { received: true });

  failSignature = true;
  const bad = await wrapper.handler(webhookRequest(body, 't=1,v1=forged'));
  assert.equal(bad.status, 400, 'a bad signature is still a 400');

  assert.deepEqual(seen, [
    { body, sig: 't=1,v1=good' },
    { body, sig: 't=1,v1=forged' },
  ]);
  assert.equal(wrapper.createCalls[0].stripeSecretKey, SK_TEST);
  assert.equal(world.fetchCalls.length, 1, 'the account lookup is cached across requests');

  const missing = await wrapper.handler(new Request(`${TEST_URL}/functions/v1/stripe-webhook`, { method: 'POST', body }));
  assert.equal(missing.status, 400, 'a missing signature header is still a 400');
});

test('stripe-worker: a refused key skips StripeSync.create and every request gets the generic 500', async () => {
  const world = makeWorld(MISMATCHED);
  const wrapper = await loadWrapper('stripe-worker', world, {});
  assert.equal(wrapper.createCalls.length, 0);
  for (const authorization of [`Bearer ${VAULT_SECRET}`, undefined]) {
    const response = await wrapper.handler(
      new Request(`${TEST_URL}/functions/v1/stripe-worker`, {
        method: 'POST',
        headers: authorization ? { Authorization: authorization } : {},
      }),
    );
    assertNoLeak('stripe-worker', await refusalBody(response), ...world.logs);
  }
  assert.equal(wrapper.sqlCalls.length, 0, 'no vault query');
  assert.equal(world.fetchCalls.length, 0);
});

test('stripe-worker: a verified key creates StripeSync once and keeps the worker-secret check', async () => {
  const world = makeWorld(MATCHED);
  const wrapper = await loadWrapper('stripe-worker', world, {
    getSupportedSyncObjects: () => ['customer'],
    resourceRegistry: { customer: { tableName: 'customers' } },
  });
  assert.equal(wrapper.createCalls.length, 1);
  assert.equal(wrapper.createCalls[0].stripeSecretKey, SK_TEST);
  assert.equal(world.fetchCalls.length, 1);
  const unauthenticated = await wrapper.handler(new Request(`${TEST_URL}/functions/v1/stripe-worker`, { method: 'POST' }));
  assert.equal(unauthenticated.status, 401);
  const forbidden = await wrapper.handler(
    new Request(`${TEST_URL}/functions/v1/stripe-worker`, { method: 'POST', headers: { Authorization: 'Bearer wrong' } }),
  );
  assert.equal(forbidden.status, 403);
});
