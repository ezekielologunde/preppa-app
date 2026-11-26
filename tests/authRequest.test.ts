// DESIGN docs/web-launch/SIGNIN-DESIGN.md (Loop 2 task 2.1, part A): the pure sign-in logic.
// isAuthFailure, the resume path allowlist, the stored intent codec, the one-sheet controller and
// the auth fragment helpers are tested directly. The last block reads the module as text and checks
// the rules that keep it safe to ship: no console, no page URL reads, no React Native, no em dash.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  __resetForTests,
  AUTH_COPY,
  clearIntent,
  decodeIntent,
  dismissSignIn,
  encodeIntent,
  getPendingIntent,
  getSignInState,
  INTENT_STORAGE_KEY,
  INTENT_TTL_MS,
  isAuthFailure,
  isSafePath,
  KNOWN_ROUTE_PREFIXES,
  loadIntent,
  mapAuthErrorMessage,
  parseAuthFragment,
  requestSignIn,
  resolveSignIn,
  saveIntent,
  scrubAuthFragment,
  subscribe,
  type Intent,
  type KeyValueStorage,
  type SignInState,
} from '../src/lib/authRequest';

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

// ---------------------------------------------------------------------------------------------
// isAuthFailure

const AUTH_FAILURES: [string, unknown][] = [
  ['Error AUTH_REQUIRED (ensureAuth)', new Error('AUTH_REQUIRED')],
  ['code AUTH_REQUIRED', { code: 'AUTH_REQUIRED' }],
  ['PostgREST JWT rejected', { code: 'PGRST301', message: 'JWSError' }],
  ['status 401', { status: 401 }],
  ['status "401"', { status: '401' }],
  ['Functions error context.status 401', { name: 'FunctionsHttpError', context: { status: 401 } }],
  ['jwt expired message', { message: 'JWT expired' }],
  ['not authenticated message', new Error('User is Not Authenticated')],
  ['bare string AUTH_REQUIRED', 'AUTH_REQUIRED'],
];

for (const [name, err] of AUTH_FAILURES) {
  test(`isAuthFailure: ${name} is an auth failure with or without a session`, () => {
    assert.equal(isAuthFailure(err, false), true);
    assert.equal(isAuthFailure(err, true), true);
  });
}

test('isAuthFailure: 42501 counts only when there is no session', () => {
  assert.equal(isAuthFailure({ code: '42501', message: 'permission denied' }, false), true);
  assert.equal(isAuthFailure({ code: '42501', message: 'new row violates row-level security policy' }, true), false);
});

test('isAuthFailure: other errors and odd inputs are not auth failures and never throw', () => {
  const hostile = {
    get code(): string {
      throw new Error('boom');
    },
  };
  const odd: unknown[] = [
    null,
    undefined,
    '',
    'network down',
    0,
    42,
    true,
    Symbol('x'),
    [],
    {},
    { status: 500 },
    { status: 403 },
    { context: null },
    { context: { status: 500 } },
    { code: 'PGRST116' },
    { code: 23505, message: 'duplicate key' },
    new Error('Failed to fetch'),
    hostile,
    () => 1,
  ];
  odd.forEach((err, i) => {
    assert.doesNotThrow(() => isAuthFailure(err, false), `odd input #${i}`);
    assert.equal(isAuthFailure(err, false), false, `odd input #${i}`);
  });
});

// ---------------------------------------------------------------------------------------------
// isSafePath

const HOSTILE_PATHS: [string, string][] = [
  ['protocol-relative host', '//evil.com'],
  ['double slash inside', '/home//evil.com'],
  // Passes the charset and the /home prefix, so only the "//" rule stops it.
  ['double slash inside, charset-clean', '/home//evil'],
  ['double slash after a known route', '/store//evil-host'],
  ['backslash host', '/\\evil'],
  ['javascript scheme', 'javascript:alert(1)'],
  ['encoded slash', '/a%2fb'],
  ['encoded under a known prefix', '/home/%2f%2fevil.com'],
  ['colon', '/a:b'],
  ['colon under a known prefix', '/home/a:b'],
  ['over length', '/home/' + 'a'.repeat(200)],
  ['empty', ''],
  ['no leading slash', 'home'],
  ['unknown prefix', '/evil'],
  ['prefix lookalike', '/homepage'],
  ['admin console', '/admin'],
  ['cook hub', '/hub/money'],
  ['absolute url', 'https://evil.com/home'],
  ['query string', '/home?next=//evil.com'],
  ['fragment', '/home#x'],
  ['dot segments', '/home/../admin'],
  ['whitespace', '/home '],
  ['newline', '/home\n'],
];

for (const [name, p] of HOSTILE_PATHS) {
  test(`isSafePath rejects ${name}: ${JSON.stringify(p.length > 40 ? p.slice(0, 40) + '...' : p)}`, () => {
    assert.equal(isSafePath(p), false);
  });
}

test('isSafePath accepts known routes and their sub-paths', () => {
  for (const p of ['/', '/home', '/checkout', '/experience/abc-123', '/store/cook_1/feed', '/messages/t1', '/my-hub', '/cart']) {
    assert.equal(isSafePath(p), true, p);
  }
  assert.equal(isSafePath('/home/' + 'a'.repeat(114)), true, 'exactly 120 characters');
  assert.equal(isSafePath('/home/' + 'a'.repeat(115)), false, '121 characters');
});

test('isSafePath rejects non-string input without throwing', () => {
  for (const v of [null, undefined, 1, {}, ['/home']]) {
    assert.equal(isSafePath(v as unknown as string), false);
  }
});

test('KNOWN_ROUTE_PREFIXES all name a real route in app/', () => {
  const routes = new Set<string>();
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      if (entry.isDirectory()) {
        // Route groups like (tabs) add no URL segment.
        const seg = /^\(.*\)$/.test(entry.name) ? '' : '/' + entry.name;
        routes.add(prefix + seg);
        walk(join(dir, entry.name), prefix + seg);
      } else if (/\.tsx$/.test(entry.name) && !entry.name.startsWith('_') && !entry.name.startsWith('+')) {
        const base = entry.name.replace(/\.tsx$/, '');
        routes.add(base === 'index' ? prefix || '/' : prefix + '/' + base);
      }
    }
  };
  walk('app', '');
  for (const prefix of KNOWN_ROUTE_PREFIXES) {
    assert.ok(routes.has(prefix), `${prefix} is not a route in app/`);
  }
});

// ---------------------------------------------------------------------------------------------
// Intent codec

const NOW = 1_800_000_000_000;
const KEY = 'user_9f2c';
const good: Intent = { kind: 'follow', ids: ['cook-1'], path: '/store/cook-1', t: NOW };

test('intent codec round-trips a valid intent', () => {
  const raw = encodeIntent(good, KEY);
  assert.ok(raw);
  assert.deepEqual(decodeIntent(raw, NOW + 1000, KEY), good);
});

test('intent codec rejects a kind outside the fixed enum', () => {
  assert.equal(encodeIntent({ ...good, kind: 'deleteAccount' as Intent['kind'] }, KEY), null);
  const tampered = JSON.stringify({ kind: 'pay', ids: [], path: '/home', t: NOW, k: KEY });
  assert.equal(decodeIntent(tampered, NOW, KEY), null);
});

test('intent codec rejects an expired or far-future timestamp', () => {
  const raw = encodeIntent(good, KEY)!;
  assert.ok(decodeIntent(raw, NOW + INTENT_TTL_MS, KEY), 'exactly at the TTL is still valid');
  assert.equal(decodeIntent(raw, NOW + INTENT_TTL_MS + 1, KEY), null);
  const future = encodeIntent({ ...good, t: NOW + 10 * 60 * 1000 }, KEY)!;
  assert.equal(decodeIntent(future, NOW, KEY), null);
});

test('intent codec drops unknown fields on encode and decode', () => {
  const sneaky = { ...good, email: 'a@b.c', password: 'x', access_token: 'tok', cart: [{ price: 1 }] } as Intent;
  const raw = encodeIntent(sneaky, KEY)!;
  assert.deepEqual(Object.keys(JSON.parse(raw)).sort(), ['ids', 'k', 'kind', 'path', 't']);
  const stored = JSON.stringify({ ...JSON.parse(raw), email: 'a@b.c', token: 'tok' });
  assert.deepEqual(decodeIntent(stored, NOW, KEY), good);
});

test('intent codec drops an intent bound to another account', () => {
  const raw = encodeIntent(good, KEY)!;
  assert.equal(decodeIntent(raw, NOW, 'someone_else'), null);
  assert.equal(decodeIntent(raw, NOW, ''), null);
  const unbound = JSON.stringify({ kind: 'follow', ids: [], path: '/home', t: NOW });
  assert.equal(decodeIntent(unbound, NOW, KEY), null);
  assert.equal(encodeIntent(good, ''), null);
  assert.equal(encodeIntent(good, 'has space'), null);
});

test('intent codec rejects oversized or malformed ids', () => {
  assert.equal(encodeIntent({ ...good, ids: Array.from({ length: 9 }, (_, i) => 'id' + i) }, KEY), null);
  assert.ok(encodeIntent({ ...good, ids: Array.from({ length: 8 }, (_, i) => 'id' + i) }, KEY));
  assert.equal(encodeIntent({ ...good, ids: ['a'.repeat(65)] }, KEY), null);
  assert.ok(encodeIntent({ ...good, ids: ['a'.repeat(64)] }, KEY));
  assert.equal(encodeIntent({ ...good, ids: ['a b'] }, KEY), null);
  assert.equal(encodeIntent({ ...good, ids: [''] }, KEY), null);
  assert.equal(encodeIntent({ ...good, ids: [1 as unknown as string] }, KEY), null);
  assert.equal(encodeIntent({ ...good, ids: 'cook-1' as unknown as string[] }, KEY), null);
});

test('intent codec checks the path on encode and again on decode', () => {
  assert.equal(encodeIntent({ ...good, path: '//evil.com' }, KEY), null);
  const tampered = JSON.stringify({ kind: 'follow', ids: [], path: '//evil.com', t: NOW, k: KEY });
  assert.equal(decodeIntent(tampered, NOW, KEY), null);
  const unknownRoute = JSON.stringify({ kind: 'follow', ids: [], path: '/admin/users', t: NOW, k: KEY });
  assert.equal(decodeIntent(unknownRoute, NOW, KEY), null);
});

test('intent codec returns null for tampered or non-JSON input', () => {
  for (const raw of ['', '{', 'null', '[]', '"x"', '42', '{"kind":"follow"}', 'x'.repeat(5000), null, undefined, 7]) {
    assert.equal(decodeIntent(raw, NOW, KEY), null, String(raw).slice(0, 20));
  }
  const badT = JSON.stringify({ kind: 'follow', ids: [], path: '/home', t: 'soon', k: KEY });
  assert.equal(decodeIntent(badT, NOW, KEY), null);
});

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const blocked: KeyValueStorage = {
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  },
  removeItem() {
    throw new Error('SecurityError');
  },
};

test('saveIntent, loadIntent and clearIntent use the preppa.authIntent key', () => {
  const s = memoryStorage();
  assert.equal(saveIntent(good, KEY, s), true);
  assert.ok(s.data.has(INTENT_STORAGE_KEY));
  assert.deepEqual(loadIntent(NOW, KEY, s), good);
  clearIntent(s);
  assert.equal(s.data.size, 0);
  assert.equal(loadIntent(NOW, KEY, s), null);
});

test('loadIntent removes an intent that fails to decode (expired or another account)', () => {
  const s = memoryStorage();
  saveIntent(good, KEY, s);
  assert.equal(loadIntent(NOW, 'other_account', s), null);
  assert.equal(s.data.has(INTENT_STORAGE_KEY), false);
  saveIntent(good, KEY, s);
  assert.equal(loadIntent(NOW + INTENT_TTL_MS + 1, KEY, s), null);
  assert.equal(s.data.has(INTENT_STORAGE_KEY), false);
});

test('saveIntent refuses an invalid intent and writes nothing', () => {
  const s = memoryStorage();
  assert.equal(saveIntent({ ...good, path: 'javascript:alert(1)' }, KEY, s), false);
  assert.equal(s.data.size, 0);
});

test('blocked or missing storage is a no-op that returns null or false', () => {
  assert.equal(saveIntent(good, KEY, blocked), false);
  assert.equal(loadIntent(NOW, KEY, blocked), null);
  assert.doesNotThrow(() => clearIntent(blocked));
  assert.equal(saveIntent(good, KEY, null), false);
  assert.equal(loadIntent(NOW, KEY, null), null);
  assert.doesNotThrow(() => clearIntent(null));
  // Node has no sessionStorage, so the default path is the missing-storage case.
  assert.equal(saveIntent(good, KEY), false);
  assert.equal(loadIntent(NOW, KEY), null);
});

// ---------------------------------------------------------------------------------------------
// Controller

test('controller: concurrent requests share one pending promise and open once', async () => {
  __resetForTests();
  const seen: SignInState[] = [];
  subscribe((s) => seen.push(s));
  const a = requestSignIn('checkout');
  const b = requestSignIn('follow');
  assert.equal(a, b);
  assert.deepEqual(getSignInState(), { open: true, reason: 'checkout' });
  assert.equal(seen.length, 1);
  resolveSignIn(true);
  assert.deepEqual(await Promise.all([a, b]), [true, true]);
  assert.deepEqual(seen.at(-1), { open: false, reason: null });
  __resetForTests();
});

test('controller: resolves exactly once; later calls change nothing', async () => {
  __resetForTests();
  let calls = 0;
  subscribe(() => calls++);
  const p = requestSignIn('book');
  resolveSignIn(true);
  resolveSignIn(false);
  dismissSignIn();
  assert.equal(await p, true);
  assert.equal(calls, 2, 'one open, one close');
  const next = requestSignIn('save');
  assert.notEqual(next, p, 'a new request after settling gets a new promise');
  dismissSignIn();
  assert.equal(await next, false);
  __resetForTests();
});

test('controller: dismiss resolves false and closes', async () => {
  __resetForTests();
  const p = requestSignIn('like');
  dismissSignIn();
  assert.equal(await p, false);
  assert.deepEqual(getSignInState(), { open: false, reason: null });
});

test('controller: keeps the first sanitised intent and drops it on settle', async () => {
  __resetForTests();
  const p = requestSignIn('follow', { ...good, extra: 'x' } as Intent);
  requestSignIn('save', { ...good, kind: 'save' });
  assert.deepEqual(getPendingIntent(), good);
  dismissSignIn();
  await p;
  assert.equal(getPendingIntent(), null);
  requestSignIn('follow', { ...good, path: '//evil.com' });
  assert.equal(getPendingIntent(), null, 'an unsafe intent is never held');
  __resetForTests();
});

test('controller: a throwing listener does not block others; unsubscribe works', async () => {
  __resetForTests();
  let other = 0;
  subscribe(() => {
    throw new Error('bad listener');
  });
  const off = subscribe(() => other++);
  const p = requestSignIn('generic');
  assert.equal(other, 1);
  off();
  resolveSignIn(true);
  assert.equal(await p, true);
  assert.equal(other, 1);
  __resetForTests();
});

test('controller: __resetForTests settles a pending request false and clears listeners', async () => {
  __resetForTests();
  let calls = 0;
  subscribe(() => calls++);
  const p = requestSignIn('connect');
  __resetForTests();
  assert.equal(await p, false);
  assert.deepEqual(getSignInState(), { open: false, reason: null });
  requestSignIn('connect');
  assert.equal(calls, 1, 'the old listener was removed');
  __resetForTests();
});

// ---------------------------------------------------------------------------------------------
// Auth fragment

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.secret-payload.sig';
const REFRESH = 'r3fr3sh-v4lue';

test('parseAuthFragment reports tokens without returning their values', () => {
  const hash = `#access_token=${TOKEN}&expires_in=3600&refresh_token=${REFRESH}&token_type=bearer&type=magiclink`;
  const parsed = parseAuthFragment(hash);
  assert.deepEqual(parsed, { hasTokens: true, error: null, errorCode: null });
  const text = JSON.stringify(parsed);
  assert.ok(!text.includes(TOKEN) && !text.includes(REFRESH) && !text.includes('secret'));
});

test('parseAuthFragment reads error and error_code as short codes only', () => {
  assert.deepEqual(
    parseAuthFragment('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'),
    { hasTokens: false, error: 'access_denied', errorCode: 'otp_expired' },
  );
  const sneaky = parseAuthFragment('#error=%3Cscript%3Ealert(1)%3C%2Fscript%3E&error_code=' + 'x'.repeat(100));
  assert.deepEqual(sneaky, { hasTokens: false, error: 'unknown', errorCode: 'unknown' });
  assert.deepEqual(parseAuthFragment('#error=%E0%A4%A'), { hasTokens: false, error: 'unknown', errorCode: null });
});

test('parseAuthFragment ignores empty, unrelated and odd input', () => {
  const none = { hasTokens: false, error: null, errorCode: null };
  for (const h of ['', '#', '#section-2', '#a=1&b=2', 'no-hash', '#&&=']) {
    assert.deepEqual(parseAuthFragment(h), none, h);
  }
  assert.deepEqual(parseAuthFragment(undefined as unknown as string), none);
});

function fakeWindow(hash: string, pathname = '/checkout', search = '?connect=return') {
  const calls: unknown[][] = [];
  return {
    calls,
    location: { hash, pathname, search },
    history: { state: { k: 1 }, replaceState: (...args: unknown[]) => void calls.push(args) },
  };
}

test('scrubAuthFragment replaces the URL only when an auth fragment is present', () => {
  const w = fakeWindow(`#access_token=${TOKEN}&refresh_token=${REFRESH}`);
  const found = scrubAuthFragment(w);
  assert.deepEqual(found, { hasTokens: true, error: null, errorCode: null });
  assert.equal(w.calls.length, 1);
  assert.deepEqual(w.calls[0], [{ k: 1 }, '', '/checkout?connect=return']);
  assert.ok(!JSON.stringify(w.calls).includes(TOKEN));

  const e = fakeWindow('#error=access_denied&error_code=otp_expired', '/', '');
  assert.deepEqual(scrubAuthFragment(e), { hasTokens: false, error: 'access_denied', errorCode: 'otp_expired' });
  assert.deepEqual(e.calls[0], [{ k: 1 }, '', '/']);

  for (const hash of ['', '#section-2', '#a=1']) {
    const clean = fakeWindow(hash);
    assert.equal(scrubAuthFragment(clean), null, hash);
    assert.equal(clean.calls.length, 0, hash);
  }
});

test('scrubAuthFragment is a no-op without a window or history and never throws', () => {
  assert.equal(scrubAuthFragment(null), null);
  assert.equal(scrubAuthFragment({}), null);
  assert.equal(scrubAuthFragment({ location: { hash: `#access_token=${TOKEN}` } }), null);
  const throwing = {
    location: { hash: `#access_token=${TOKEN}`, pathname: '/' },
    history: {
      replaceState() {
        throw new Error('SecurityError');
      },
    },
  };
  assert.doesNotThrow(() => scrubAuthFragment(throwing));
  // Node has no location or history, so the default is the missing-window case.
  assert.equal(scrubAuthFragment(), null);
});

// ---------------------------------------------------------------------------------------------
// Error copy

test('mapAuthErrorMessage maps otp_expired, 429 and rate limits, and never echoes server text', () => {
  assert.equal(mapAuthErrorMessage('otp_expired'), 'That link expired. Send a new one.');
  assert.equal(mapAuthErrorMessage('Error code OTP_EXPIRED'), AUTH_COPY.expired);
  assert.equal(mapAuthErrorMessage(429), 'Too many tries. Wait a minute.');
  assert.equal(mapAuthErrorMessage('429'), AUTH_COPY.rateLimited);
  assert.equal(mapAuthErrorMessage('over_email_send_rate_limit'), AUTH_COPY.rateLimited);
  assert.equal(mapAuthErrorMessage('Too many requests'), AUTH_COPY.rateLimited);
  const raw = 'duplicate key value violates unique constraint "users_email_key"';
  assert.equal(mapAuthErrorMessage(raw), 'Something went wrong. Try again.');
  for (const v of [null, undefined, '', {}, 4290, 'generate', new Error('otp_expired')]) {
    assert.equal(mapAuthErrorMessage(v), AUTH_COPY.generic, String(v));
  }
});

// ---------------------------------------------------------------------------------------------
// Text wiring

test('authRequest.ts has no console, no page URL reads, no React Native import and no em dash', () => {
  const src = read('src/lib/authRequest.ts');
  assert.ok(!src.includes('console.'), 'console. found');
  assert.ok(!src.includes('window.location'), 'window.location found');
  assert.ok(!/from\s+['"]react-native/.test(src) && !/require\(['"]react-native/.test(src), 'react-native import found');
  assert.ok(!/from\s+['"]react['"]/.test(src), 'react import found');
  assert.ok(!src.includes('—'), 'em dash found');
});

test('every user-facing auth copy string is free of em dashes', () => {
  for (const copy of Object.values(AUTH_COPY)) assert.ok(!copy.includes('—'), copy);
});
