// Pure decisions for the web sign-in sheet host (SIGNIN-DESIGN.md, part B).
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SHEET_TITLES,
  SHEET_COPY,
  SUCCESS_MS,
  FIRST_STEP,
  canDismiss,
  nextStep,
  onSignedIn,
  sheetTitle,
  type SheetStep,
} from '../src/lib/authSheetLogic';

const KEY_A = 'a'.repeat(32);
const KEY_B = 'b'.repeat(32);

test('onSignedIn resumes when the bound key equals the signed-in account key', () => {
  assert.equal(onSignedIn({ boundKey: KEY_A, sessionEmailKey: KEY_A }), 'resume');
});

test('onSignedIn drops the intent on a key mismatch but still reports success', () => {
  assert.equal(onSignedIn({ boundKey: KEY_A, sessionEmailKey: KEY_B }), 'clear-and-continue');
});

test('onSignedIn clears when no intent was bound or the session key is unknown', () => {
  assert.equal(onSignedIn({ boundKey: null, sessionEmailKey: KEY_A }), 'clear-and-continue');
  assert.equal(onSignedIn({ boundKey: KEY_A, sessionEmailKey: null }), 'clear-and-continue');
  assert.equal(onSignedIn({ boundKey: null, sessionEmailKey: null }), 'clear-and-continue');
  assert.equal(onSignedIn({ boundKey: '', sessionEmailKey: '' }), 'clear-and-continue');
});

test('canDismiss is true on every step but success', () => {
  const steps: SheetStep[] = ['email', 'code', 'password', 'create', 'recover'];
  for (const s of steps) assert.equal(canDismiss(s), true, s);
  assert.equal(canDismiss('success'), false);
});

test('titles per reason', () => {
  assert.equal(sheetTitle('checkout'), 'Sign in to check out');
  assert.equal(sheetTitle('connect'), 'Sign in to finish setting up payouts');
  assert.equal(sheetTitle('generic'), 'Sign in to continue');
  assert.equal(sheetTitle(null), 'Sign in to continue');
  assert.equal(sheetTitle('toString' as never), 'Sign in to continue');
  for (const r of ['book', 'follow', 'save', 'like', 'openThread'] as const) {
    assert.match(sheetTitle(r), /^Sign in to /);
  }
});

test('no em dash in any sheet copy', () => {
  for (const s of [...Object.values(SHEET_TITLES), ...Object.values(SHEET_COPY)]) {
    assert.ok(!s.includes('—'), s);
  }
});

test('step machine: code first, then success', () => {
  assert.equal(FIRST_STEP, 'email');
  assert.equal(nextStep('email', 'codeSent'), 'code');
  assert.equal(nextStep('code', 'verified'), 'success');
  assert.equal(nextStep('email', 'authed'), 'success');
  assert.equal(nextStep('email', 'create'), 'create');
  assert.equal(nextStep('create', 'signin'), 'email');
  assert.equal(nextStep('create', 'codeSent'), 'code');
  assert.equal(nextStep('email', 'recoverySent'), 'recover');
  assert.equal(nextStep('recover', 'verified'), 'success');
  assert.equal(nextStep('email', 'usePassword'), 'password');
  assert.equal(nextStep('password', 'authed'), 'success');
});

test('step machine: events that do not apply leave the step, success is terminal', () => {
  assert.equal(nextStep('code', 'authed'), 'code');
  assert.equal(nextStep('create', 'recoverySent'), 'create');
  for (const e of ['codeSent', 'authed', 'verified', 'recoverySent', 'usePassword', 'create', 'signin'] as const) {
    assert.equal(nextStep('success', e), 'success');
  }
});

test('success state is brief', () => {
  assert.ok(SUCCESS_MS >= 300 && SUCCESS_MS <= 1000);
});
