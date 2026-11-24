// DESIGN 1.7 / SECURITY-SPEC S8: the 1.1g key-mode and account rule in every hand-written Edge Function that
// calls requireEnv('STRIPE_SECRET_KEY').
//
// The functions are Deno modules with remote imports, so nothing here imports them. The callers are found by
// scanning supabase/functions/*/index.ts for requireEnv('STRIPE_SECRET_KEY'), so a new caller without the guard
// fails these tests. Each test reads a file as text, strips the TypeScript types from the guard block (and from
// requireEnv where needed) and evaluates it in a node:vm context whose only globals are stubs: Deno.env, fetch,
// console. Nothing reaches the network or Stripe.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const FUNCTIONS_DIR = join(__dirname, '..', 'supabase', 'functions');
const VENDORED = ['stripe-setup', 'stripe-webhook', 'stripe-worker'];
const BEGIN = '// BEGIN stripe-key-mode-guard-callers';
const END = '// END stripe-key-mode-guard-callers';

const PROD_REF = 'fwidhpzwldneeaphrxgg';
const TEST_REF = 'abcdefghijklmnopqrst';
const PROD_URL = `https://${PROD_REF}.supabase.co`;
const TEST_URL = `https://${TEST_REF}.supabase.co`;
const EXPECTED_ACCOUNT = 'acct_1CallerExpected';
const OTHER_ACCOUNT = 'acct_1CallerSomeoneElse';
const SK_LIVE = 'sk_live_CallerFixtureLiveKey';
const RK_LIVE = 'rk_live_CallerFixtureLiveKey';
const SK_TEST = 'sk_test_CallerFixtureTestKey';
const RK_TEST = 'rk_test_CallerFixtureTestKey';
const FAILURE_BODY = { error: 'Stripe configuration check failed' };
const SECRET_VALUES = [PROD_REF, TEST_REF, EXPECTED_ACCOUNT, OTHER_ACCOUNT, SK_LIVE, RK_LIVE, SK_TEST, RK_TEST];
const LOCAL_URLS = ['http://kong:8000', 'http://127.0.0.1:54321', 'http://localhost:54321/'];

type Env = Record<string, string | undefined>;
type Guard = {
  stripeKeyModeGuard: (clock?: () => number) => Promise<boolean>;
  stripeGuardFailureResponse: (headers?: Record<string, string>) => Response;
  requireEnv?: (name: string) => string;
};

const sources = new Map<string, string>();
for (const dir of readdirSync(FUNCTIONS_DIR)) {
  const file = join(FUNCTIONS_DIR, dir, 'index.ts');
  if (!existsSync(file)) continue;
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  if (text.includes("requireEnv('STRIPE_SECRET_KEY')")) sources.set(dir, text);
}
const CALLERS = [...sources.keys()].sort();

function source(name: string): string {
  const text = sources.get(name);
  assert.ok(text !== undefined, name);
  return text;
}

function sliceOnce(text: string, startMarker: string, endMarker: string, label: string): string {
  const start = text.indexOf(startMarker);
  assert.ok(start >= 0, `${label}: missing marker ${startMarker}`);
  assert.equal(text.indexOf(startMarker, start + 1), -1, `${label}: marker appears more than once: ${startMarker}`);
  const end = text.indexOf(endMarker, start);
  assert.ok(end > start, `${label}: missing marker ${endMarker}`);
  return text.slice(start, end + endMarker.length);
}

function guardBlock(name: string): string {
  return sliceOnce(source(name), BEGIN, END, name);
}

function requireEnvSource(name: string): string {
  return sliceOnce(source(name), 'function requireEnv(name: string): string {\n', '\n}\n', name);
}

function accountResponse(id: string, status = 200): Response {
  return new Response(JSON.stringify({ id, object: 'account' }), { status, headers: { 'Content-Type': 'application/json' } });
}

function makeWorld(env: Env, respond: () => Response | Promise<Response> = () => accountResponse(EXPECTED_ACCOUNT)) {
  const fetchCalls: { url: string; init?: RequestInit }[] = [];
  const logs: string[] = [];
  const record = (...args: unknown[]) => void logs.push(args.map(String).join(' '));
  return {
    fetchCalls,
    logs,
    globals: {
      Deno: { env: { get: (key: string) => env[key] } },
      fetch: async (url: unknown, init?: RequestInit) => {
        fetchCalls.push({ url: String(url), init });
        return respond();
      },
      console: { log: record, info: record, warn: record, error: record, debug: record },
      Response,
      AbortSignal,
      URL,
    } as Record<string, unknown>,
  };
}

function loadGuard(name: string, world: ReturnType<typeof makeWorld>, withRequireEnv = false): Guard {
  const context = vm.createContext({ ...world.globals });
  const code = guardBlock(name) + (withRequireEnv ? `\n${requireEnvSource(name)}` : '');
  vm.runInContext(stripTypeScriptTypes(code), context, { filename: `${name}/index.ts (guard block)` });
  return context as unknown as Guard;
}

async function refusalBody(response: Response): Promise<string> {
  assert.equal(response.status, 500);
  const text = await response.text();
  assert.deepEqual(JSON.parse(text), FAILURE_BODY);
  return text;
}

function assertNoLeak(label: string, ...texts: string[]) {
  for (const text of texts) for (const value of SECRET_VALUES) assert.ok(!text.includes(value), `${label}: output leaks ${value}`);
}

function env(overrides: Env): Env {
  return { STRIPE_EXPECTED_ACCOUNT: EXPECTED_ACCOUNT, ...overrides };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const REFUSALS_WITHOUT_LOOKUP: { label: string; env: Env }[] = [
  { label: 'live secret key on a non-production ref', env: env({ SUPABASE_URL: TEST_URL, STRIPE_SECRET_KEY: SK_LIVE }) },
  { label: 'live restricted key on a non-production ref', env: env({ SUPABASE_URL: TEST_URL, STRIPE_SECRET_KEY: RK_LIVE }) },
  { label: 'test secret key on the production ref', env: env({ SUPABASE_URL: PROD_URL, STRIPE_SECRET_KEY: SK_TEST }) },
  { label: 'test restricted key on the production ref', env: env({ SUPABASE_URL: PROD_URL, STRIPE_SECRET_KEY: RK_TEST }) },
  { label: 'publishable key in place of the secret key', env: env({ SUPABASE_URL: TEST_URL, STRIPE_SECRET_KEY: 'pk_test_CallerFixture' }) },
  { label: 'missing STRIPE_SECRET_KEY', env: env({ SUPABASE_URL: TEST_URL, STRIPE_SECRET_KEY: undefined }) },
  { label: 'missing STRIPE_EXPECTED_ACCOUNT', env: env({ SUPABASE_URL: TEST_URL, STRIPE_SECRET_KEY: SK_TEST, STRIPE_EXPECTED_ACCOUNT: undefined }) },
  { label: 'blank STRIPE_EXPECTED_ACCOUNT', env: env({ SUPABASE_URL: PROD_URL, STRIPE_SECRET_KEY: SK_LIVE, STRIPE_EXPECTED_ACCOUNT: ' \n' }) },
  { label: 'missing SUPABASE_URL', env: env({ SUPABASE_URL: undefined, STRIPE_SECRET_KEY: SK_TEST }) },
  { label: 'SUPABASE_URL that is not a URL', env: env({ SUPABASE_URL: 'not a url', STRIPE_SECRET_KEY: SK_TEST }) },
  { label: 'SUPABASE_URL over ftp', env: env({ SUPABASE_URL: `ftp://${PROD_REF}.supabase.co`, STRIPE_SECRET_KEY: SK_TEST }) },
  { label: 'production look-alike host with a live key', env: env({ SUPABASE_URL: `https://${PROD_REF}.supabase.co.example.com`, STRIPE_SECRET_KEY: SK_LIVE }) },
  { label: 'production host with a path and a live key', env: env({ SUPABASE_URL: `${PROD_URL}/rest/v1`, STRIPE_SECRET_KEY: SK_LIVE }) },
  { label: 'production host with a port and a live key', env: env({ SUPABASE_URL: `${PROD_URL}:8443`, STRIPE_SECRET_KEY: SK_LIVE }) },
  { label: 'local stack with a live key', env: env({ SUPABASE_URL: 'http://kong:8000', STRIPE_SECRET_KEY: SK_LIVE }) },
];

test('the callers are the 26 hand-written functions, not the vendored wrappers', () => {
  assert.equal(CALLERS.length, 26, CALLERS.join(', '));
  for (const name of VENDORED) assert.ok(!CALLERS.includes(name), name);
});

test('the guard block is byte-identical in every requireEnv(STRIPE_SECRET_KEY) caller', () => {
  const [first, ...rest] = CALLERS.map(guardBlock);
  rest.forEach((block, i) => assert.equal(block, first, CALLERS[i + 1]));
  assert.ok(first.includes(`'https://${PROD_REF}.supabase.co/'`), 'guard names the production host');
});

for (const name of CALLERS) {
  test(`${name}: the handler awaits the guard before any other work except the CORS preflight`, () => {
    const text = source(name);
    const serve = 'Deno.serve(async (req) => {\n';
    const at = text.indexOf(serve);
    assert.ok(at >= 0, 'one Deno.serve(async (req) => { handler');
    assert.equal(text.indexOf('Deno.serve(', at + 1), -1, 'only one Deno.serve');
    const body = text.slice(at + serve.length).split('\n');
    const preflight = "  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });";
    if (body[0] === preflight) {
      assert.equal(body[1], '  if (!(await stripeKeyModeGuard())) return stripeGuardFailureResponse(corsHeaders);');
    } else {
      assert.equal(body[0], '  if (!(await stripeKeyModeGuard())) return stripeGuardFailureResponse();');
    }
  });

  test(`${name}: requireEnv('STRIPE_SECRET_KEY') rejects a mismatched key mode at load, without echoing it`, () => {
    const text = source(name);
    assert.match(
      requireEnvSource(name),
      /\n {2}if \(name === 'STRIPE_SECRET_KEY' && !stripeGuardKeyModeMatches\((v|value)\)\) throw new Error\(STRIPE_GUARD_FAILURE_MESSAGE\);\n {2}return \1;\n\}\n$/,
    );
    const outsideBlock = text.replace(guardBlock(name), '// GUARD BLOCK');
    assert.ok(
      outsideBlock.indexOf('// GUARD BLOCK') < outsideBlock.indexOf("requireEnv('STRIPE_SECRET_KEY')"),
      'the block (and its constants) precede the first requireEnv call at module load',
    );
    for (const scenario of [
      { url: TEST_URL, key: SK_LIVE },
      { url: TEST_URL, key: RK_LIVE },
      { url: PROD_URL, key: SK_TEST },
      { url: 'http://localhost:54321', key: SK_LIVE },
      { url: undefined, key: SK_TEST },
    ]) {
      const world = makeWorld(env({ SUPABASE_URL: scenario.url, STRIPE_SECRET_KEY: scenario.key }));
      const guard = loadGuard(name, world, true);
      assert.throws(
        () => guard.requireEnv?.('STRIPE_SECRET_KEY'),
        (error: Error) => error.message === FAILURE_BODY.error,
      );
      assert.equal(world.logs.length, 1, `${scenario.url} ${scenario.key}: logged once`);
      assertNoLeak(`${name} requireEnv`, ...world.logs);
      assert.equal(world.fetchCalls.length, 0);
    }
    for (const scenario of [
      { url: TEST_URL, key: SK_TEST },
      { url: 'http://kong:8000', key: RK_TEST },
      { url: `${PROD_URL}/`, key: SK_LIVE },
      { url: PROD_URL, key: RK_LIVE },
    ]) {
      const world = makeWorld(env({ SUPABASE_URL: scenario.url, STRIPE_SECRET_KEY: scenario.key, OTHER_SECRET: 'x' }));
      const guard = loadGuard(name, world, true);
      assert.equal(guard.requireEnv?.('STRIPE_SECRET_KEY'), scenario.key);
      assert.equal(guard.requireEnv?.('OTHER_SECRET'), 'x');
      assert.equal(world.logs.length, 0);
    }
    const missing = loadGuard(name, makeWorld(env({ SUPABASE_URL: TEST_URL })), true);
    assert.throws(() => missing.requireEnv?.('STRIPE_SECRET_KEY'), /Missing required secret: STRIPE_SECRET_KEY/);
  });

  test(`${name}: refuses with no Stripe call when the key mode or configuration is wrong`, async () => {
    for (const scenario of REFUSALS_WITHOUT_LOOKUP) {
      const world = makeWorld(scenario.env);
      const guard = loadGuard(name, world);
      assert.equal(await guard.stripeKeyModeGuard(() => 0), false, scenario.label);
      assert.equal(world.fetchCalls.length, 0, `${scenario.label}: no fetch at all`);
      assert.equal(world.logs.length, 1, `${scenario.label}: refusal is logged once`);
      assertNoLeak(`${name} ${scenario.label}`, ...world.logs, await refusalBody(guard.stripeGuardFailureResponse()));
    }
  });

  test(`${name}: refuses when the account is not STRIPE_EXPECTED_ACCOUNT, after exactly one lookup`, async () => {
    for (const scenario of [
      { label: 'test env, other account', url: TEST_URL, key: SK_TEST, respond: () => accountResponse(OTHER_ACCOUNT) },
      { label: 'prod env, other account', url: PROD_URL, key: SK_LIVE, respond: () => accountResponse(OTHER_ACCOUNT) },
      { label: 'lookup rejected', url: TEST_URL, key: SK_TEST, respond: () => accountResponse(EXPECTED_ACCOUNT, 401) },
      { label: 'network failure', url: PROD_URL, key: SK_LIVE, respond: () => Promise.reject(new TypeError(`fetch failed for ${SK_LIVE}`)) },
      { label: 'non-JSON', url: TEST_URL, key: SK_TEST, respond: () => new Response(`<html>${EXPECTED_ACCOUNT}</html>`) },
    ]) {
      const world = makeWorld(env({ SUPABASE_URL: scenario.url, STRIPE_SECRET_KEY: scenario.key }), scenario.respond);
      const guard = loadGuard(name, world);
      assert.equal(await guard.stripeKeyModeGuard(() => 0), false, scenario.label);
      assert.equal(world.fetchCalls.length, 1, `${scenario.label}: only the account lookup`);
      assert.equal(world.fetchCalls[0].url, 'https://api.stripe.com/v1/account');
      assert.equal(world.logs.length, 1, `${scenario.label}: logged once`);
      assertNoLeak(`${name} ${scenario.label}`, ...world.logs, await refusalBody(guard.stripeGuardFailureResponse()));
    }
  });

  test(`${name}: a matching key and account pass with one GET /v1/account, cached for the isolate`, async () => {
    for (const pair of [
      { url: PROD_URL, key: SK_LIVE },
      { url: `${PROD_URL}/`, key: RK_LIVE },
      { url: TEST_URL, key: SK_TEST },
      { url: TEST_URL, key: RK_TEST },
      ...LOCAL_URLS.map((url) => ({ url, key: SK_TEST })),
    ]) {
      let now = 0;
      const world = makeWorld(
        env({ SUPABASE_URL: pair.url, STRIPE_SECRET_KEY: ` ${pair.key}\r\n`, STRIPE_EXPECTED_ACCOUNT: ` ${EXPECTED_ACCOUNT}\n` }),
      );
      const guard = loadGuard(name, world);
      assert.equal(await guard.stripeKeyModeGuard(() => now), true, `${pair.url} ${pair.key}`);
      now += 3_600_000;
      assert.equal(await guard.stripeKeyModeGuard(() => now), true);
      assert.equal(world.fetchCalls.length, 1, `${pair.url}: one lookup`);
      const [call] = world.fetchCalls;
      assert.equal(call.url, 'https://api.stripe.com/v1/account');
      assert.equal(call.init?.method, 'GET');
      assert.deepEqual({ ...(call.init?.headers as Record<string, string>) }, { Authorization: `Bearer ${pair.key}` });
      assert.ok(call.init?.signal, 'the lookup has a timeout signal');
      assert.equal(world.logs.length, 0);
    }
  });

  test(`${name}: a failure is cached for 30 seconds, then one fresh lookup runs`, async () => {
    let now = 1_000_000;
    const clock = () => now;
    let answer = OTHER_ACCOUNT;
    const world = makeWorld(env({ SUPABASE_URL: TEST_URL, STRIPE_SECRET_KEY: SK_TEST }), () => accountResponse(answer));
    const guard = loadGuard(name, world);
    assert.equal(await guard.stripeKeyModeGuard(clock), false);
    now += 29_000;
    answer = EXPECTED_ACCOUNT;
    assert.equal(await guard.stripeKeyModeGuard(clock), false, '29s: refused from cache');
    assert.equal(world.fetchCalls.length, 1, '29s: no lookup');
    now += 2_000;
    assert.equal(await guard.stripeKeyModeGuard(clock), true, '31s: a fresh lookup passes');
    assert.equal(world.fetchCalls.length, 2);
  });

  test(`${name}: concurrent first calls share one lookup, pass or fail`, async () => {
    for (const [answer, expected] of [
      [EXPECTED_ACCOUNT, true],
      [OTHER_ACCOUNT, false],
    ] as const) {
      const lookup = deferred<Response>();
      const world = makeWorld(env({ SUPABASE_URL: TEST_URL, STRIPE_SECRET_KEY: SK_TEST }), () => lookup.promise);
      const guard = loadGuard(name, world);
      const calls = Array.from({ length: 5 }, () => guard.stripeKeyModeGuard(() => 0));
      lookup.resolve(accountResponse(answer));
      assert.deepEqual(await Promise.all(calls), Array(5).fill(expected), answer);
      assert.equal(world.fetchCalls.length, 1, `${answer}: one lookup for five callers`);
    }
  });

  test(`${name}: the refusal response keeps the caller's CORS headers and the fixed body`, async () => {
    const guard = loadGuard(name, makeWorld(env({})));
    const response = guard.stripeGuardFailureResponse({ 'Access-Control-Allow-Origin': '*' });
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
    assert.equal(response.headers.get('Content-Type'), 'application/json');
    await refusalBody(response);
  });
}
