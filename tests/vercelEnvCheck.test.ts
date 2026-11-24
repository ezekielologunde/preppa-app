import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';

const SCRIPT = resolve(process.cwd(), 'scripts/check-vercel-env.mjs');
const PRODUCTION_REF = 'fwidhpzwldneeaphrxgg';
const NAMES = {
  url: 'EXPO_PUBLIC_SUPABASE_URL',
  anon: 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  stripe: 'EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  appEnv: 'EXPO_PUBLIC_APP_ENV',
} as const;

// Every value carries a marker so the output can be checked for leaked values.
const MARKER = 'leakmarker';
const ISOLATED = {
  [NAMES.url]: `https://${MARKER}isolated.supabase.co`,
  [NAMES.anon]: `${MARKER}-test-anon-key`,
  [NAMES.stripe]: `pk_test_${MARKER}`,
  [NAMES.appEnv]: 'preview',
};
const PRODUCTION = {
  [NAMES.url]: `https://${PRODUCTION_REF}.supabase.co`,
  [NAMES.anon]: `${MARKER}-production-anon-key`,
  [NAMES.stripe]: `pk_live_${MARKER}`,
  [NAMES.appEnv]: 'production',
};

type Vars = Record<string, string | undefined>;

function run(vars: Vars) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^VERCEL(_|$)|^EXPO_PUBLIC_/i.test(key)) delete env[key];
  }
  for (const [key, value] of Object.entries(vars)) {
    if (value !== undefined) env[key] = value;
  }
  const result = spawnSync(process.execPath, [SCRIPT], { env, encoding: 'utf8' });
  const output = `${result.stdout}${result.stderr}`;
  assert.ok(!output.includes(MARKER), `output must not print variable values:\n${output}`);
  assert.ok(!output.includes(PRODUCTION_REF), `output must not print the Supabase URL:\n${output}`);
  const flagged = result.stderr
    .split(/\r?\n/)
    .map((line) => /^ {2}([A-Z_]+): \S/.exec(line)?.[1])
    .filter((name): name is string => Boolean(name))
    .sort();
  return { status: result.status, output, flagged };
}

function assertPass(vars: Vars) {
  const result = run(vars);
  assert.equal(result.status, 0, result.output);
  assert.deepEqual(result.flagged, []);
  return result;
}

function assertFail(vars: Vars, expected: string[]) {
  const result = run(vars);
  assert.notEqual(result.status, 0, `expected a failing exit:\n${result.output}`);
  assert.match(result.output, /FAIL/);
  assert.deepEqual(result.flagged, [...expected].sort(), result.output);
  return result;
}

test('local build: VERCEL_ENV unset passes with a note, whatever else is set', () => {
  assert.match(assertPass({ ...PRODUCTION, [NAMES.stripe]: 'pk_test_x' }).output, /local build/);
  assert.match(assertPass({}).output, /local build/);
});

test('local build: an empty VERCEL_ENV is treated as unset', () => {
  assert.match(assertPass({ VERCEL_ENV: '' }).output, /local build/);
});

test('preview: isolated test config passes', () => {
  assertPass({ VERCEL_ENV: 'preview', ...ISOLATED });
});

test('preview: a live Stripe key fails', () => {
  assertFail({ VERCEL_ENV: 'preview', ...ISOLATED, [NAMES.stripe]: `pk_live_${MARKER}` }, [NAMES.stripe]);
});

test('preview: a Supabase URL containing the production ref fails', () => {
  assertFail({ VERCEL_ENV: 'preview', ...ISOLATED, [NAMES.url]: `https://${PRODUCTION_REF}.supabase.co` }, [NAMES.url]);
  assertFail(
    { VERCEL_ENV: 'preview', ...ISOLATED, [NAMES.url]: `https://${PRODUCTION_REF.toUpperCase()}.supabase.co` },
    [NAMES.url],
  );
});

test('preview: APP_ENV production fails', () => {
  assertFail({ VERCEL_ENV: 'preview', ...ISOLATED, [NAMES.appEnv]: 'production' }, [NAMES.appEnv]);
});

for (const name of [NAMES.url, NAMES.anon, NAMES.stripe]) {
  test(`preview: missing ${name} fails`, () => {
    assertFail({ VERCEL_ENV: 'preview', ...ISOLATED, [name]: undefined }, [name]);
  });
  test(`preview: empty ${name} fails`, () => {
    assertFail({ VERCEL_ENV: 'preview', ...ISOLATED, [name]: '' }, [name]);
    assertFail({ VERCEL_ENV: 'preview', ...ISOLATED, [name]: '   ' }, [name]);
  });
}

test('preview: no config at all fails on all three variables', () => {
  assertFail({ VERCEL_ENV: 'preview' }, [NAMES.url, NAMES.anon, NAMES.stripe]);
});

test('preview: the full production config fails on every rule', () => {
  assertFail({ VERCEL_ENV: 'preview', ...PRODUCTION }, [NAMES.appEnv, NAMES.stripe, NAMES.url]);
});

test('development: held to the same isolation rules as preview', () => {
  assertPass({ VERCEL_ENV: 'development', ...ISOLATED, [NAMES.appEnv]: 'development' });
  assertFail({ VERCEL_ENV: 'development', ...ISOLATED, [NAMES.stripe]: `pk_live_${MARKER}` }, [NAMES.stripe]);
  assertFail({ VERCEL_ENV: 'development' }, [NAMES.url, NAMES.anon, NAMES.stripe]);
});

test('production: unset variables pass, because production relies on in-code fallbacks', () => {
  assertPass({ VERCEL_ENV: 'production' });
});

test('production: empty variables pass like unset ones', () => {
  assertPass({ VERCEL_ENV: 'production', [NAMES.url]: '', [NAMES.anon]: '', [NAMES.stripe]: '', [NAMES.appEnv]: '' });
});

test('production: the explicit production config passes', () => {
  assertPass({ VERCEL_ENV: 'production', ...PRODUCTION });
  assertPass({ VERCEL_ENV: 'production', [NAMES.url]: `https://${PRODUCTION_REF}.supabase.co/` });
});

test('production: a Stripe test key fails', () => {
  assertFail({ VERCEL_ENV: 'production', [NAMES.stripe]: `pk_test_${MARKER}` }, [NAMES.stripe]);
});

test('production: a Supabase URL for any other project fails', () => {
  assertFail({ VERCEL_ENV: 'production', [NAMES.url]: `https://${MARKER}isolated.supabase.co` }, [NAMES.url]);
  assertFail({ VERCEL_ENV: 'production', [NAMES.url]: `https://${PRODUCTION_REF}.${MARKER}.example` }, [NAMES.url]);
  assertFail({ VERCEL_ENV: 'production', [NAMES.url]: `https://${MARKER}.example/${PRODUCTION_REF}` }, [NAMES.url]);
  assertFail({ VERCEL_ENV: 'production', [NAMES.url]: `not a url ${MARKER}` }, [NAMES.url]);
});

test('production: APP_ENV preview fails', () => {
  assertFail({ VERCEL_ENV: 'production', [NAMES.appEnv]: 'preview' }, [NAMES.appEnv]);
});

test('production: the full isolated test config fails on every rule', () => {
  assertFail({ VERCEL_ENV: 'production', ...ISOLATED }, [NAMES.appEnv, NAMES.stripe, NAMES.url]);
});

test('an unrecognised VERCEL_ENV fails without printing it', () => {
  assertFail({ VERCEL_ENV: `${MARKER}-staging`, ...ISOLATED }, ['VERCEL_ENV']);
});
