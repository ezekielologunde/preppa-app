// DESIGN 1.6: connect-onboard takes its allowed post-KYC redirect origins from the APP_ORIGINS function secret,
// not from a literal in the source.
//
// connect-onboard is a Deno module with remote imports, so nothing here imports it. Each test reads the file as
// text, drops the two import lines, strips the TypeScript types and evaluates the whole module in a node:vm
// context whose only globals are stubs: Deno.env, Deno.serve (captures the handler), fetch (answers the Stripe
// key-mode guard's account lookup), createClient (a fake database) and Stripe (records accountLinks.create).
// Nothing reaches the network, Supabase or Stripe.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const FILE = join(__dirname, '..', 'supabase', 'functions', 'connect-onboard', 'index.ts');
const SOURCE = readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n');
const FAILURE_BODY = { error: 'Could not start payout setup. Please try again.' };
const EXPECTED_ACCOUNT = 'acct_1OnboardExpected';
const STAGING = 'https://staging.preppa.live';
const LOCAL = 'http://localhost:8081';
const PRODUCTION = 'https://app.preppa.live';
const USER_ID = 'user-1';
const KITCHEN_ID = 'kitchen-1';

type Env = Record<string, string | undefined>;
type Handler = (req: Request) => Promise<Response>;

function moduleCode(): string {
  const withoutImports = SOURCE.split('\n')
    .filter((line) => !line.startsWith('import '))
    .join('\n');
  assert.ok(!/^\s*import\s/m.test(withoutImports), 'only top-level import lines are dropped');
  return stripTypeScriptTypes(withoutImports);
}

function load(appOrigins: string | undefined) {
  const env: Env = {
    SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-fixture',
    STRIPE_SECRET_KEY: 'sk_test_OnboardFixtureTestKey',
    STRIPE_EXPECTED_ACCOUNT: EXPECTED_ACCOUNT,
    APP_ORIGINS: appOrigins,
  };
  const logs: string[] = [];
  const record = (...args: unknown[]) => void logs.push(args.map(String).join(' '));
  const dbCalls: string[] = [];
  const linkCalls: Record<string, unknown>[] = [];
  let handler: Handler | undefined;

  const query = (table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      single: async () => ({ data: { id: KITCHEN_ID, owner_id: USER_ID, name: 'Test Kitchen' } }),
      maybeSingle: async () => ({ data: table === 'stripe_accounts' ? { stripe_account_id: 'acct_1OnboardCook' } : null }),
      insert: async () => ({ error: null }),
    };
    return chain;
  };
  const db = {
    auth: {
      getUser: async () => {
        dbCalls.push('auth.getUser');
        return { data: { user: { id: USER_ID, email: 'cook@example.test' } } };
      },
    },
    rpc: async (name: string) => {
      dbCalls.push(`rpc:${name}`);
      return { error: null };
    },
    from: (table: string) => {
      dbCalls.push(`from:${table}`);
      return query(table);
    },
  };
  function Stripe() {
    return {
      accounts: { create: async () => ({ id: 'acct_1OnboardCook' }) },
      accountLinks: {
        create: async (args: Record<string, unknown>) => {
          linkCalls.push(args);
          return { url: 'https://connect.stripe.com/setup/e/fixture' };
        },
      },
    };
  }
  Stripe.createFetchHttpClient = () => ({});

  const context = vm.createContext({
    Deno: {
      env: { get: (key: string) => env[key] },
      serve: (fn: Handler) => {
        handler = fn;
      },
    },
    fetch: async () =>
      new Response(JSON.stringify({ id: EXPECTED_ACCOUNT, object: 'account' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    console: { log: record, info: record, warn: record, error: record, debug: record },
    createClient: () => db,
    Stripe,
    Response,
    AbortSignal,
    URL,
  });
  vm.runInContext(moduleCode(), context, { filename: 'connect-onboard/index.ts' });
  assert.ok(handler, 'the module registers a Deno.serve handler');
  return { handler: handler as Handler, logs, dbCalls, linkCalls };
}

function post(body: unknown): Request {
  return new Request('https://functions.example.test/connect-onboard', {
    method: 'POST',
    headers: { Authorization: 'Bearer user-jwt', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function onboard(appOrigins: string | undefined, body: Record<string, unknown>) {
  const world = load(appOrigins);
  const response = await world.handler(post({ kitchenId: KITCHEN_ID, ...body }));
  return { ...world, response, text: await response.text() };
}

async function assertRefused(label: string, appOrigins: string | undefined) {
  const result = await onboard(appOrigins, { returnUrl: `${STAGING}/my-hub?connect=return` });
  assert.equal(result.response.status, 500, label);
  assert.deepEqual(JSON.parse(result.text), FAILURE_BODY, label);
  assert.deepEqual(result.dbCalls, [], `${label}: no auth or database work`);
  assert.deepEqual(result.linkCalls, [], `${label}: no Stripe account link`);
  for (const output of [result.text, ...result.logs]) {
    assert.ok(!/preppa|localhost|evil|https?:/i.test(output), `${label}: no origin echoed: ${output}`);
    if (appOrigins && appOrigins.trim()) assert.ok(!output.includes(appOrigins.trim()), `${label}: config not echoed`);
  }
  assert.equal(result.logs.length, 1, `${label}: one fixed log line`);
}

async function linkUrls(appOrigins: string, body: Record<string, unknown>) {
  const result = await onboard(appOrigins, body);
  assert.equal(result.response.status, 200, result.text);
  assert.equal(result.linkCalls.length, 1);
  return { returnUrl: result.linkCalls[0].return_url, refreshUrl: result.linkCalls[0].refresh_url };
}

test('the source holds no literal app origin', () => {
  assert.ok(!SOURCE.includes(PRODUCTION), 'no https://app.preppa.live literal');
  assert.ok(!/ALLOWED_ORIGIN\b/.test(SOURCE), 'no ALLOWED_ORIGIN constant');
  assert.ok(SOURCE.includes("Deno.env.get('APP_ORIGINS')"), 'reads APP_ORIGINS');
});

test('missing or empty APP_ORIGINS fails closed with the fixed generic error', async () => {
  for (const value of [undefined, '', '   ', ',', ' , ,\n']) await assertRefused(JSON.stringify(value), value);
});

test('a malformed or wildcard APP_ORIGINS entry fails the whole list closed', async () => {
  for (const value of [
    '*',
    'https://*.preppa.live',
    `${STAGING},https://*.evil.example`,
    `${STAGING}/`,
    `${STAGING}/my-hub`,
    `${STAGING}?x=1`,
    `${STAGING}#x`,
    'staging.preppa.live',
    'ftp://staging.preppa.live',
    'https://Staging.preppa.live',
    'https://staging.preppa.live:443',
    'http://localhost:80',
    'https://user@staging.preppa.live',
    'null',
    'not a url',
    `${STAGING} ${LOCAL}`,
  ]) {
    await assertRefused(value, value);
  }
});

test('the CORS preflight still answers when APP_ORIGINS is missing', async () => {
  const world = load(undefined);
  const preflight = await world.handler(new Request('https://functions.example.test/connect-onboard', { method: 'OPTIONS' }));
  assert.equal(preflight.status, 200);
  assert.deepEqual(world.dbCalls, []);
});

test('redirects whose origin exactly matches a trimmed APP_ORIGINS entry pass through', async () => {
  const origins = ` ${STAGING} ,\t${LOCAL} `;
  const urls = await linkUrls(origins, {
    returnUrl: `${STAGING}/my-hub?connect=return`,
    refreshUrl: `${LOCAL}/my-hub?connect=refresh`,
  });
  assert.equal(urls.returnUrl, `${STAGING}/my-hub?connect=return`);
  assert.equal(urls.refreshUrl, `${LOCAL}/my-hub?connect=refresh`);
});

test('a redirect on any other origin falls back to the first APP_ORIGINS entry', async () => {
  for (const candidate of [
    `${PRODUCTION}/my-hub?connect=return`,
    'https://staging.preppa.live.evil.example/my-hub',
    'https://evilstaging.preppa.live/my-hub',
    `https://evil.example/?next=${STAGING}`,
    `https://evil.example/${STAGING}`,
    'http://staging.preppa.live/my-hub',
    'https://staging.preppa.live:8443/my-hub',
    'http://localhost:8082/my-hub',
    'javascript:alert(1)',
    `blob:${STAGING}/0b1c2d3e`,
    '//staging.preppa.live/my-hub',
    '/my-hub?connect=return',
    'not a url',
    42,
    null,
  ]) {
    const urls = await linkUrls(`${STAGING},${LOCAL}`, { returnUrl: candidate, refreshUrl: candidate });
    assert.equal(urls.returnUrl, `${STAGING}/my-hub?connect=return`, String(candidate));
    assert.equal(urls.refreshUrl, `${STAGING}/my-hub?connect=refresh`, String(candidate));
  }
});

test('with no redirect in the body (native clients) the defaults use the first APP_ORIGINS entry', async () => {
  assert.deepEqual(await linkUrls(`${LOCAL},${STAGING}`, {}), {
    returnUrl: `${LOCAL}/my-hub?connect=return`,
    refreshUrl: `${LOCAL}/my-hub?connect=refresh`,
  });
  assert.deepEqual(await linkUrls(PRODUCTION, {}), {
    returnUrl: `${PRODUCTION}/my-hub?connect=return`,
    refreshUrl: `${PRODUCTION}/my-hub?connect=refresh`,
  });
});

// The documented deploy paths must set APP_ORIGINS, or connect-onboard answers 500 to every POST once deployed.
const DEPLOY_SCRIPT = readFileSync(join(__dirname, '..', 'scripts', 'deploy-staging.ps1'), 'utf8').replace(/\r\n/g, '\n');
const DESIGN_DOC = readFileSync(join(__dirname, '..', 'docs', 'web-launch', 'DESIGN.md'), 'utf8').replace(/\r\n/g, '\n');

test('deploy-staging step 4 sets APP_ORIGINS to the staging origin with the other function secrets', () => {
  assert.match(DEPLOY_SCRIPT, /^\$AppOrigins = 'https:\/\/staging\.preppa\.live'/m, 'AppOrigins holds the staging origin');
  const step4 = DEPLOY_SCRIPT.slice(DEPLOY_SCRIPT.indexOf("Step 4 '"), DEPLOY_SCRIPT.indexOf('foreach ($fn in $Guarded3)'));
  assert.ok(step4.length > 0, 'step 4 found before the guarded deploys');
  assert.match(step4, /Set-FunctionSecrets @\{[^}]*\bAPP_ORIGINS = \$AppOrigins\b[^}]*\}/, 'APP_ORIGINS set by Set-FunctionSecrets');
  assert.match(step4, /Add-Evidence "function secrets set:[^"]*APP_ORIGINS = \$AppOrigins/, 'APP_ORIGINS recorded in the evidence line');
  const reminder = DEPLOY_SCRIPT.split('\n').find((line) => line.includes('supabase secrets list'));
  assert.ok(reminder && reminder.includes('APP_ORIGINS'), 'the closing secrets list reminder names APP_ORIGINS');
});

test('deploy-staging step 9 sets APP_ORIGINS when the run was resumed past step 4, before any function deploys', () => {
  const step9 = DEPLOY_SCRIPT.slice(DEPLOY_SCRIPT.indexOf("Step 9 '"));
  const guard = step9.indexOf('if ($StartAt -gt 4)');
  const firstDeploy = step9.indexOf('foreach ($fn in $order)');
  assert.ok(guard >= 0 && firstDeploy > guard, 'a StartAt > 4 guard comes before the deploy loop');
  const block = step9.slice(guard, firstDeploy);
  assert.match(block, /Set-FunctionSecrets @\{\s*APP_ORIGINS = \$AppOrigins\s*\}/, 'APP_ORIGINS set on the resume path');
  assert.match(block, /Add-Evidence.*APP_ORIGINS/, 'the resume path records it in the evidence file');
});

test('the DESIGN 4.2 deploy rule sets APP_ORIGINS, first entry the production origin, before connect-onboard', () => {
  const start = DESIGN_DOC.indexOf('**4.2 deploy order');
  const rule = DESIGN_DOC.slice(start, DESIGN_DOC.indexOf('\n1. ', start));
  assert.ok(start >= 0 && rule.length > 0, '4.2 deploy order block found');
  assert.match(rule, /`APP_ORIGINS`[^\n]*before `connect-onboard` is deployed/, 'APP_ORIGINS set before connect-onboard deploys');
  assert.match(rule, /first entry is `https:\/\/app\.preppa\.live`/, 'production first entry is the app origin');
});
