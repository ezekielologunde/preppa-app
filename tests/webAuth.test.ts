// DESIGN docs/web-launch/SIGNIN-DESIGN.md (Loop 2 task 2.1, part B2a): the web sign-in settings and
// helpers in src/lib/webAuth.ts. The last block reads the module as text and checks it stays pure.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { AUTH_COPY } from '../src/lib/authRequest';
import { accountKeyForEmail, consentModeFromFlag, WEB_AUTH_COPY, WEB_PASSWORD_MIN, WEB_RESEND_COOLDOWN_SEC, webAuthError, webAuthNotice } from '../src/lib/webAuth';

const TIMEOUT = /export const AUTH_TIMEOUT_MESSAGE = '([^']*)'/.exec(readFileSync(join(__dirname, '..', 'src', 'lib', 'supabase.ts'), 'utf8'))![1];

test('web settings: password minimum 10, resend cooldown 60 s', () => {
  assert.equal(WEB_PASSWORD_MIN, 10);
  assert.equal(WEB_RESEND_COOLDOWN_SEC, 60);
});

test('consentModeFromFlag: 1 or true is the checkbox, anything else the notice', () => {
  assert.equal(consentModeFromFlag('1'), 'checkbox');
  assert.equal(consentModeFromFlag('true'), 'checkbox');
  for (const f of [undefined, '', '0', 'false', 'TRUE', ' 1', 'yes', 'on']) assert.equal(consentModeFromFlag(f), 'notice', String(f));
});

test('webAuthError: wrong credentials', () => {
  assert.equal(webAuthError(new Error('Invalid login credentials')), WEB_AUTH_COPY.wrongCredentials);
  assert.equal(webAuthError({ code: 'invalid_credentials', message: 'x' }), WEB_AUTH_COPY.wrongCredentials);
  assert.equal(webAuthError({ message: 'Wrong email or password' }), 'Wrong email or password');
});

test('webAuthError: an existing account gets the same reply as a new email', () => {
  for (const e of [new Error('User already registered'), { message: 'That email already has an account' }, { code: 'user_already_exists' }, { code: 'email_exists', status: 422 }]) {
    assert.equal(webAuthError(e), 'If this email is new, we have sent next steps.');
  }
});

test('webAuthNotice: the existing-account errors become the neutral notice, anything else null', () => {
  for (const e of [new Error('User already registered'), { code: 'user_already_exists' }, { code: 'email_exists', status: 422 }, { message: 'That email already has an account' }]) {
    assert.equal(webAuthNotice(e), 'If this email is new, we have sent next steps.');
  }
  for (const e of [new Error('Invalid login credentials'), { status: 429 }, { code: 'otp_expired' }, undefined, null, {}, 'x', Object.create({ code: 'user_already_exists' })]) {
    assert.equal(webAuthNotice(e), null);
  }
});

test('webAuthError: in the code step an expired or invalid token is a code that did not match', () => {
  const want = "That code didn't match or has expired. Request a new one.";
  const expired = { code: 'otp_expired', message: 'Token has expired or is invalid' };
  assert.equal(webAuthError(expired, 'code'), want);
  assert.equal(webAuthError({ code: 'otp_expired' }, 'code'), want);
  assert.equal(webAuthError(new Error('Token has expired or is invalid'), 'code'), want);
  assert.equal(webAuthError(expired, 'auth'), AUTH_COPY.expired, 'the link copy stays outside the code step');
  assert.equal(webAuthError(expired), AUTH_COPY.expired);
  assert.equal(webAuthError({ status: 429 }, 'code'), AUTH_COPY.rateLimited);
});

test('webAuthError: the client timeout, in either step', () => {
  const want = 'That took too long. Check your connection and try again.';
  assert.ok(TIMEOUT.length > 0);
  assert.equal(webAuthError(new Error(TIMEOUT)), want);
  assert.equal(webAuthError(new Error(TIMEOUT), 'code'), want);
  assert.equal(webAuthError(TIMEOUT), want);
});

test('webAuthError: expired and rate limited, from code, status or message', () => {
  assert.equal(webAuthError({ code: 'otp_expired', message: 'Token has expired or is invalid' }), AUTH_COPY.expired);
  assert.equal(webAuthError({ status: 429, message: 'hello' }), AUTH_COPY.rateLimited);
  assert.equal(webAuthError({ code: 'over_email_send_rate_limit' }), AUTH_COPY.rateLimited);
  assert.equal(webAuthError(new Error('Email rate limit exceeded')), AUTH_COPY.rateLimited);
});

test('webAuthError: never echoes a raw message', () => {
  const raw = 'Database error saving new user: secret detail <script>';
  for (const e of [new Error(raw), { message: raw }, raw, { code: raw }]) {
    const out = webAuthError(e);
    assert.equal(out, AUTH_COPY.generic);
    assert.ok(!out.includes('secret'));
  }
  for (const e of [undefined, null, 42, {}, [], () => {}, Object.create({ message: 'Invalid login credentials' })]) {
    assert.equal(webAuthError(e), AUTH_COPY.generic, 'inherited or missing fields are not read');
  }
});

test('webAuthError: copy has no em dash', () => {
  for (const s of [...Object.values(WEB_AUTH_COPY), ...Object.values(AUTH_COPY)]) assert.ok(!s.includes('—'), s);
});

test('accountKeyForEmail: SHA-256 of the trimmed lowercase email, hex, 32 characters', async () => {
  const want = createHash('sha256').update('ada@example.com').digest('hex').slice(0, 32);
  assert.equal(await accountKeyForEmail('  Ada@Example.COM '), want);
  assert.equal(await accountKeyForEmail('ada@example.com'), want);
  assert.notEqual(await accountKeyForEmail('bob@example.com'), want);
  assert.equal(want.length, 32);
});

test('accountKeyForEmail: NFKC-normalises before lowercase and trim', async () => {
  const want = createHash('sha256').update('ada@example.com').digest('hex').slice(0, 32);
  // Fullwidth ADA@EXAMPLE.COM: NFKC folds it to ASCII, lowercase alone would not.
  const fullwidth = Array.from('ADA@EXAMPLE.COM', (ch) => String.fromCharCode(ch.charCodeAt(0) + 0xfee0)).join('');
  assert.notEqual(fullwidth.toLowerCase(), 'ada@example.com');
  assert.equal(await accountKeyForEmail(' ' + fullwidth + ' '), want);
});

test('accountKeyForEmail: rejects a blank or non-string email', async () => {
  for (const e of ['', '   ', '\t\n']) await assert.rejects(accountKeyForEmail(e), JSON.stringify(e));
  for (const e of [undefined, null, 42, {}, ['ada@example.com']]) await assert.rejects(accountKeyForEmail(e as any), String(e));
});

test('accountKeyForEmail: fails closed without Web Crypto', async () => {
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  try {
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
    await assert.rejects(accountKeyForEmail('ada@example.com'));
    Object.defineProperty(globalThis, 'crypto', { value: { subtle: undefined }, configurable: true, writable: true });
    await assert.rejects(accountKeyForEmail('ada@example.com'));
  } finally {
    if (desc) Object.defineProperty(globalThis, 'crypto', desc);
  }
  assert.equal((await accountKeyForEmail('ada@example.com')).length, 32, 'restored');
});

test('webAuth.ts stays pure: no React Native, no console, no em dash', () => {
  const src = readFileSync(join(__dirname, '..', 'src', 'lib', 'webAuth.ts'), 'utf8');
  assert.doesNotMatch(src, /from 'react(-native)?'/);
  assert.ok(!src.includes('console.'));
  assert.ok(!src.includes('—'));
});
