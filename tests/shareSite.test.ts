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
    // The build is a preview one, which also rejects the production origin (M2).
    const rejected = input !== undefined && input !== '' && (parseSiteOrigin(input) ?? PRODUCTION) === PRODUCTION;
    assert.equal(flagged, rejected, `${JSON.stringify(input)}:\n${result.stdout}${result.stderr}`);
    assert.equal(result.status === 0, !rejected, `${JSON.stringify(input)}:\n${result.stdout}${result.stderr}`);
  }
});

// ---- React Native URL independence (iOS and Android replace global URL with a regex class).

// Stand-in for react-native/Libraries/Blob/URL.js (the URL class React Native installs as the
// global URL on iOS and Android). The constructor (single argument) and every getter below are
// copied from that file in react-native 0.8x as read from the shared deps; only the Flow types,
// the blob helpers and the base-URL branch are left out.
class RnUrl {
  _url: string;
  constructor(url: string) {
    this._url = url;
    if (this._url.includes('#')) {
      const split = this._url.split('#');
      const website = split[0].split('://')[1];
      if (!website.includes('/')) this._url = split.join('/#');
    }
    if (!this._url.endsWith('/') && !(this._url.includes('?') || this._url.includes('#'))) {
      const afterProtocol = this._url.split('://')[1];
      if (afterProtocol && !afterProtocol.includes('/')) this._url += '/';
    }
  }
  get hash() {
    const m = this._url.match(/#([^/]*)/);
    return m ? `#${m[1]}` : '';
  }
  get hostname() {
    const m = this._url.match(/^https?:\/\/(?:[^@]+@)?([^:/?#]+)/);
    return m ? m[1] : '';
  }
  get origin() {
    const m = this._url.match(/^(https?:\/\/[^/]+)/);
    return m ? m[1] : '';
  }
  get password() {
    const m = this._url.match(/https?:\/\/.*:(.*)@/);
    return m ? m[1] : '';
  }
  get pathname() {
    const m = this._url.match(/https?:\/\/[^/]+(\/[^?#]*)?/);
    return m ? m[1] || '/' : '/';
  }
  get port() {
    const m = this._url.match(/:(\d+)(?=[/?#]|$)/);
    return m ? m[1] : '';
  }
  get protocol() {
    const m = this._url.match(/^([a-zA-Z][a-zA-Z\d+\-.]*):/);
    return m ? `${m[1]}:` : '';
  }
  get search() {
    const m = this._url.match(/\?([^#]*)/);
    return m ? `?${m[1]}` : '';
  }
  get username() {
    return '';
  }
}

const RN_HOSTILE = ['https://:@staging.preppa.live', 'https://:\\evil.com:@staging.preppa.live'];

const MATRIX: (string | undefined)[] = [
  ...CASES.map(([input]) => input),
  ...RN_HOSTILE,
  'https://staging.preppa.live:443',
  'HTTPS://APP.PREPPA.LIVE/',
  'HTTPS://STAGING.PREPPA.LIVE',
  'http://LOCALHOST:8081/',
  'http://localhost:80',
  'http://localhost:0080',
  'https://localhost:443',
  'http://localhost:0',
  'https://localhost:0',
  'http://127.0.0.1:0',
  'http://localhost:65535',
  'http://localhost:65536',
  'http://localhost:99999',
  'http://localhost:123456',
  'http://localhost:',
  'https://staging.preppa.live:0',
  'https://staging.preppa.live:80',
  'https://staging.preppa.live//',
  'https://staging.preppa.live%2e',
  'https://staging.preppa.live\u0000',
  'https://staging.preppa.live\t',
  'https://[::1]',
  'https://:@app.preppa.live',
  'https://@staging.preppa.live',
];

const withUrl = <T>(impl: unknown, fn: () => T): T => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'URL');
  Object.defineProperty(globalThis, 'URL', { value: impl, configurable: true, writable: true });
  try {
    return fn();
  } finally {
    if (saved) Object.defineProperty(globalThis, 'URL', saved);
  }
};

test('React Native URL stand-in reproduces the divergence this guards against', () => {
  // Under RN's URL the hostile inputs parse to the staging host with no credentials, which the old
  // URL-based check accepted; Node's URL reports a username or a different host for them.
  const rn = new RnUrl('https://:@staging.preppa.live');
  assert.equal(rn.hostname, 'staging.preppa.live');
  assert.equal(rn.username, '');
  assert.equal(rn.password, '');
  assert.equal(rn.pathname, '/');
  assert.equal(new RnUrl('https://:\\evil.com:@staging.preppa.live').hostname, 'staging.preppa.live');
});

test('parseSiteOrigin rejects the userinfo hostile inputs, with or without React Native URL', () => {
  for (const impl of [URL, RnUrl, undefined]) {
    withUrl(impl, () => {
      for (const input of RN_HOSTILE) {
        assert.equal(parseSiteOrigin(input), null, input);
        assert.equal(resolveSite(input), PRODUCTION, input);
      }
    });
  }
});

test('parseSiteOrigin gives identical results under Node URL, React Native URL and no URL at all', () => {
  const baseline = MATRIX.map((input) => parseSiteOrigin(input));
  for (const impl of [RnUrl, undefined]) {
    const results = withUrl(impl, () => MATRIX.map((input) => parseSiteOrigin(input)));
    assert.deepEqual(results, baseline);
  }
});

test('parseSiteOrigin normalises to lowercase scheme://host[:port] and drops default ports', () => {
  assert.equal(parseSiteOrigin('HTTPS://APP.PREPPA.LIVE/'), PRODUCTION);
  assert.equal(parseSiteOrigin('HTTPS://STAGING.PREPPA.LIVE'), STAGING);
  assert.equal(parseSiteOrigin('https://staging.preppa.live:443'), STAGING);
  assert.equal(parseSiteOrigin('http://LOCALHOST:8081/'), 'http://localhost:8081');
  assert.equal(parseSiteOrigin('http://localhost:80'), 'http://localhost');
  assert.equal(parseSiteOrigin('https://localhost:443'), 'https://localhost');
  assert.equal(parseSiteOrigin('http://localhost:65535'), 'http://localhost:65535');
});

test('parseSiteOrigin rejects port 0, ports above 65535 and an empty port', () => {
  for (const input of [
    'http://localhost:0', 'https://localhost:0', 'http://127.0.0.1:0', 'http://localhost:65536',
    'http://localhost:99999', 'http://localhost:123456', 'http://localhost:', 'https://staging.preppa.live:0',
  ]) {
    assert.equal(parseSiteOrigin(input), null, input);
  }
});

test('check-vercel-env.mjs siteOrigin block returns exactly what parseSiteOrigin returns', () => {
  const src = readFileSync(SCRIPT, 'utf8');
  const block = /\/\/ BEGIN siteOrigin[^\n]*\r?\n([\s\S]*?)\/\/ END siteOrigin/.exec(src);
  assert.ok(block, 'expected BEGIN siteOrigin and END siteOrigin markers in check-vercel-env.mjs');
  const scriptOrigin = new Function(`${block[1]}; return siteOrigin;`)() as (value: string) => string | null;
  for (const input of MATRIX) {
    if (input === undefined) continue;
    assert.equal(scriptOrigin(input), parseSiteOrigin(input), JSON.stringify(input));
  }
  for (const impl of [RnUrl, undefined]) {
    withUrl(impl, () => {
      for (const input of RN_HOSTILE) assert.equal(scriptOrigin(input), null, input);
    });
  }
});
