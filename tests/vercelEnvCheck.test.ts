import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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

const jwt = (payload: unknown) =>
  `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;

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

test('vercel.json runs the check before the web export', () => {
  const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'));
  assert.equal(
    config.buildCommand,
    'node scripts/check-vercel-env.mjs && expo export -p web && node scripts/scan-build-secrets.mjs',
  );
});

test('Vercel builder without VERCEL_ENV: VERCEL set fails instead of skipping the checks', () => {
  assertFail({ VERCEL: '1', ...PRODUCTION, [NAMES.stripe]: `pk_test_${MARKER}` }, ['VERCEL_ENV']);
  assertFail({ VERCEL: `${MARKER}` }, ['VERCEL_ENV']);
  assertFail({ VERCEL: '1', VERCEL_ENV: '' }, ['VERCEL_ENV']);
  assertFail({ VERCEL: '1', VERCEL_ENV: '   ' }, ['VERCEL_ENV']);
});

test('Vercel builder without VERCEL_ENV: VERCEL_URL set fails, with or without CI', () => {
  assertFail({ CI: '1', VERCEL_URL: `${MARKER}.vercel.app`, ...ISOLATED }, ['VERCEL_ENV']);
  assertFail({ VERCEL_URL: `${MARKER}.vercel.app` }, ['VERCEL_ENV']);
});

test('a whitespace-only VERCEL_ENV is not a local build', () => {
  assertFail({ VERCEL_ENV: '   ' }, ['VERCEL_ENV']);
});

test('local build: CI alone, or an empty VERCEL, is still a local build', () => {
  assert.match(assertPass({ CI: '1' }).output, /local build/);
  assert.match(assertPass({ VERCEL: '', VERCEL_URL: '' }).output, /local build/);
});

for (const target of ['preview', 'development']) {
  for (const key of [`sk_live_${MARKER}`, `rk_live_${MARKER}`, `sk_test_${MARKER}`, `rk_test_${MARKER}`, `pk_live_${MARKER}`, `${MARKER}`]) {
    test(`${target}: a Stripe value shaped ${key.replace(MARKER, '...')} fails; only pk_test_ passes`, () => {
      assertFail({ VERCEL_ENV: target, ...ISOLATED, [NAMES.appEnv]: target, [NAMES.stripe]: key }, [NAMES.stripe]);
    });
  }
}

for (const key of [`sk_live_${MARKER}`, `rk_live_${MARKER}`, `sk_test_${MARKER}`, `pk_test_${MARKER}`, `${MARKER}`]) {
  test(`production: a Stripe value shaped ${key.replace(MARKER, '...')} fails; only pk_live_ passes`, () => {
    assertFail({ VERCEL_ENV: 'production', [NAMES.stripe]: key }, [NAMES.stripe]);
  });
}

for (const name of Object.values(NAMES)) {
  test(`production: a whitespace-only ${name} fails, because the client would not fall back`, () => {
    assertFail({ VERCEL_ENV: 'production', [name]: '   ' }, [name]);
    assertFail({ VERCEL_ENV: 'production', ...PRODUCTION, [name]: '\t' }, [name]);
  });
}

test('preview: a Supabase URL that does not parse fails', () => {
  assertFail({ VERCEL_ENV: 'preview', ...ISOLATED, [NAMES.url]: `not a url ${MARKER}` }, [NAMES.url]);
  assertFail({ VERCEL_ENV: 'preview', ...ISOLATED, [NAMES.url]: `https://${MARKER}[isolated` }, [NAMES.url]);
});

test('preview: a production host hidden by URL encoding still fails', () => {
  const encoded = `%${PRODUCTION_REF.charCodeAt(0).toString(16)}${PRODUCTION_REF.slice(1)}`;
  const fullWidth = `${String.fromCharCode(PRODUCTION_REF.charCodeAt(0) + 0xfee0)}${PRODUCTION_REF.slice(1)}`;
  for (const host of [
    `${encoded}.supabase.co`,
    `${PRODUCTION_REF.slice(0, 5)}%${PRODUCTION_REF.charCodeAt(5).toString(16).toUpperCase()}${PRODUCTION_REF.slice(6)}.supabase.co`,
    `${fullWidth}.supabase.co`,
    `${encoded}.supabase.co.`,
    `${encoded.toUpperCase()}.SUPABASE.CO:443`,
  ]) {
    assert.ok(!`https://${host}`.includes(PRODUCTION_REF), `fixture must hide the ref: ${host}`);
    assertFail({ VERCEL_ENV: 'preview', ...ISOLATED, [NAMES.url]: `https://${host}` }, [NAMES.url]);
  }
});

test('preview: the production ref anywhere in the raw URL still fails', () => {
  assertFail({ VERCEL_ENV: 'preview', ...ISOLATED, [NAMES.url]: `https://${MARKER}.example/?project=${PRODUCTION_REF}` }, [NAMES.url]);
  assertFail({ VERCEL_ENV: 'preview', ...ISOLATED, [NAMES.url]: `https://${PRODUCTION_REF}@${MARKER}.example` }, [NAMES.url]);
});

test('production: padded values fail because Expo inlines the raw value', () => {
  assertFail({ VERCEL_ENV: 'production', [NAMES.stripe]: 'pk_live_x\n' }, [NAMES.stripe]);
  assertFail({ VERCEL_ENV: 'production', [NAMES.appEnv]: ' production ' }, [NAMES.appEnv]);
  assertFail({ VERCEL_ENV: 'production', [NAMES.url]: `https://${PRODUCTION_REF}.supabase.co ` }, [NAMES.url]);
  assertFail({ VERCEL_ENV: 'production', [NAMES.anon]: ` ${MARKER}-production-anon-key` }, [NAMES.anon]);
});

test('preview and development: padded values fail, clean values still pass', () => {
  assertFail({ VERCEL_ENV: 'preview', ...ISOLATED, [NAMES.url]: `${ISOLATED[NAMES.url]} ` }, [NAMES.url]);
  assertFail({ VERCEL_ENV: 'development', ...ISOLATED, [NAMES.stripe]: `pk_test_${MARKER}\r\n` }, [NAMES.stripe]);
  assertFail({ VERCEL_ENV: 'preview', ...ISOLATED, [NAMES.appEnv]: '\tpreview' }, [NAMES.appEnv]);
  assertFail({ VERCEL_ENV: 'preview', ...ISOLATED, [NAMES.anon]: `${ISOLATED[NAMES.anon]}\n` }, [NAMES.anon]);
  assertPass({ VERCEL_ENV: 'preview', ...ISOLATED });
  assertPass({ VERCEL_ENV: 'production', ...PRODUCTION });
});

test('production: a JWT anon key for another project ref fails', () => {
  assertFail({ VERCEL_ENV: 'production', [NAMES.anon]: jwt({ ref: 'otherref', role: 'anon' }) }, [NAMES.anon]);
});

test('production: a JWT anon key for the production ref passes, as does one without a ref', () => {
  assertPass({ VERCEL_ENV: 'production', [NAMES.anon]: jwt({ ref: PRODUCTION_REF, role: 'anon' }) });
  assertPass({ VERCEL_ENV: 'production', [NAMES.anon]: jwt({ role: 'anon' }) });
});

test('production: a non-JWT anon key (new-style publishable key) is left alone', () => {
  assertPass({ VERCEL_ENV: 'production', [NAMES.anon]: `sb_publishable_${MARKER}` });
});

test('production: a JWT-shaped anon key whose payload does not decode fails', () => {
  assertFail({ VERCEL_ENV: 'production', [NAMES.anon]: 'a.b.c' }, [NAMES.anon]);
  assertFail({ VERCEL_ENV: 'production', [NAMES.anon]: `a.${Buffer.from('not json').toString('base64url')}.c` }, [NAMES.anon]);
});

test('preview: a JWT anon key for the production ref fails; another ref passes', () => {
  assertFail({ VERCEL_ENV: 'preview', ...ISOLATED, [NAMES.anon]: jwt({ ref: PRODUCTION_REF, role: 'anon' }) }, [NAMES.anon]);
  assertPass({ VERCEL_ENV: 'preview', ...ISOLATED, [NAMES.anon]: jwt({ ref: 'otherref', role: 'anon' }) });
});
