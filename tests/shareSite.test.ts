import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { FALLBACK_SITE, parseSiteOrigin, resolveSite, SITE_HOSTS } from '../src/lib/siteOrigin';

// DESIGN 2.12: share links use the configured origin, validated, instead of the production literal.

const PRODUCTION = 'https://app.preppa.live';
const STAGING = 'https://staging.preppa.live';

// [input, origin resolveSite returns]. A rejected value resolves to production.
const CASES: [string | undefined, string][] = [
  ['javascript:alert(1)', PRODUCTION],
  ['//evil.com', PRODUCTION],
  ['https://evil.com', PRODUCTION],
  ['https://app.preppa.live@evil.com', PRODUCTION],
  ['https://app.preppa.live.evil.com', PRODUCTION],
  ['http://app.preppa.live', PRODUCTION],
  ['', PRODUCTION],
  [undefined, PRODUCTION],
  ['HTTPS://APP.PREPPA.LIVE/', PRODUCTION],
  ['https://app.preppa.live/path', PRODUCTION],
  [STAGING, STAGING],
  ['https://staging.preppa.live/', STAGING],
  ['https://staging.preppa.live:443', STAGING],
  ['http://localhost:8081', 'http://localhost:8081'],
  ['https://localhost', 'https://localhost'],
  ['http://127.0.0.1:19006', 'http://127.0.0.1:19006'],
  // Rejections on the staging host, where the fallback differs from the input's origin.
  ['https://staging.preppa.live/path', PRODUCTION],
  ['https://staging.preppa.live?x=1', PRODUCTION],
  ['https://staging.preppa.live/#x', PRODUCTION],
  ['https://user:pw@staging.preppa.live', PRODUCTION],
  ['https://user@staging.preppa.live', PRODUCTION],
  ['https://staging.preppa.live:8443', PRODUCTION],
  ['http://staging.preppa.live', PRODUCTION],
  ['https://staging.preppa.live.', PRODUCTION],
  ['https://staging.preppa.live\\@evil.com', PRODUCTION],
  [' https://staging.preppa.live', PRODUCTION],
  ['https://staging.preppa.live\n', PRODUCTION],
  ['wss://staging.preppa.live', PRODUCTION],
  ['ftp://localhost', PRODUCTION],
  ['http://localhost.evil.com', PRODUCTION],
  ['https://evil.com/https://staging.preppa.live', PRODUCTION],
  ['staging.preppa.live', PRODUCTION],
  ['   ', PRODUCTION],
];

for (const [input, expected] of CASES) {
  test(`resolveSite(${JSON.stringify(input)}) is ${expected}`, () => {
    assert.equal(resolveSite(input), expected);
  });
}

test('parseSiteOrigin rejects, rather than accepts, the hostile production-host inputs', () => {
  // resolveSite returns production for these either way, so check the rejection itself.
  for (const input of ['https://app.preppa.live@evil.com', 'http://app.preppa.live', 'https://app.preppa.live/path', '', undefined]) {
    assert.equal(parseSiteOrigin(input), null, String(input));
  }
  assert.equal(parseSiteOrigin('HTTPS://APP.PREPPA.LIVE/'), PRODUCTION);
  assert.equal(FALLBACK_SITE, PRODUCTION);
});

test('share.ts builds SITE from EXPO_PUBLIC_SITE_URL through resolveSite, with no production literal', () => {
  const src = readFileSync(resolve(process.cwd(), 'src/lib/share.ts'), 'utf8');
  // Expo inlines EXPO_PUBLIC_* only for a literal process.env.NAME read.
  assert.match(src, /export const SITE = resolveSite\(process\.env\.EXPO_PUBLIC_SITE_URL\);/);
  assert.match(src, /export \{ resolveSite \}/);
  assert.ok(!src.includes('https://app.preppa.live'), 'share.ts must not hardcode the production origin');
});

// scripts/check-vercel-env.mjs keeps its own copy of the allowlist and rules.
const SCRIPT = resolve(process.cwd(), 'scripts/check-vercel-env.mjs');

test('check-vercel-env.mjs carries the same host allowlist as siteOrigin.ts', () => {
  const src = readFileSync(SCRIPT, 'utf8');
  const match = /const SITE_HOSTS = (\[[^\]]*\]);/.exec(src);
  assert.ok(match, 'expected a SITE_HOSTS array literal in check-vercel-env.mjs');
  assert.deepEqual(JSON.parse(match[1].replace(/'/g, '"')), [...SITE_HOSTS]);
});

test('check-vercel-env.mjs fails a build exactly when resolveSite would reject a set value', () => {
  const base: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(base)) {
    if (/^VERCEL(_|$)|^EXPO_PUBLIC_/i.test(key)) delete base[key];
  }
  Object.assign(base, {
    VERCEL_ENV: 'preview',
    EXPO_PUBLIC_SUPABASE_URL: 'https://isolated.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_x',
    EXPO_PUBLIC_APP_ENV: 'preview',
  });
  for (const [input] of CASES) {
    const env = { ...base };
    if (input !== undefined) env.EXPO_PUBLIC_SITE_URL = input;
    const result = spawnSync(process.execPath, [SCRIPT], { env, encoding: 'utf8' });
    const flagged = /^ {2}EXPO_PUBLIC_SITE_URL: /m.test(result.stderr);
    const rejected = input !== undefined && input !== '' && parseSiteOrigin(input) === null;
    assert.equal(flagged, rejected, `${JSON.stringify(input)}:\n${result.stdout}${result.stderr}`);
    assert.equal(result.status === 0, !rejected, `${JSON.stringify(input)}:\n${result.stdout}${result.stderr}`);
  }
});
