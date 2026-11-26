// Pure decisions for the web sign-in sheet host (SIGNIN-DESIGN.md, part B).
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SHEET_TITLES,
  SHEET_COPY,
  SUCCESS_MS,
  FIRST_STEP,
  canDismiss,
  isSameOpenRequest,
  mayBindIntent,
  nextStep,
  onSignedIn,
  sheetTitle,
  type SheetStep,
} from '../src/lib/authSheetLogic';
import {
  __resetForTests,
  dismissSignIn,
  getSignInState,
  requestSignIn,
  resolveSignIn,
  subscribe,
} from '../src/lib/authRequest';

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

// Stale callbacks: the host captures getSignInState() when it starts async work and checks it again.
test('isSameOpenRequest: a request that closed and a new one that opened are told apart', async () => {
  __resetForTests();
  const off = subscribe(() => {});
  try {
    const first = requestSignIn('checkout');
    const captured = getSignInState();
    assert.equal(isSameOpenRequest(captured, getSignInState()), true);
    resolveSignIn(false);
    assert.equal(await first, false);
    assert.equal(isSameOpenRequest(captured, getSignInState()), false, 'closed');
    const second = requestSignIn('follow');
    assert.equal(getSignInState().open, true);
    assert.equal(isSameOpenRequest(captured, getSignInState()), false, 'a later request is not the captured one');
    // The host's success timer for the first request must therefore never settle the second.
    dismissSignIn();
    assert.equal(await second, false);
  } finally {
    off();
    __resetForTests();
  }
});

test('isSameOpenRequest is false for null and for a closed state', () => {
  const closed = Object.freeze({ open: false });
  assert.equal(isSameOpenRequest(null, closed), false);
  assert.equal(isSameOpenRequest(closed, closed), false);
});

test('resolve once: a second resolveSignIn(true) after a dismiss has no effect', async () => {
  __resetForTests();
  const off = subscribe(() => {});
  try {
    const p = requestSignIn('book');
    dismissSignIn();
    resolveSignIn(true);
    assert.equal(await p, false);
    assert.equal(getSignInState().open, false);
  } finally {
    off();
    __resetForTests();
  }
});

test('mayBindIntent: only the latest email of the same open request, and never while finishing', () => {
  const open = Object.freeze({ open: true });
  const other = Object.freeze({ open: true });
  const closed = Object.freeze({ open: false });
  const base = { callSeq: 3, currentSeq: 3, captured: open, current: open, finishing: false };
  assert.equal(mayBindIntent(base), true);
  assert.equal(mayBindIntent({ ...base, currentSeq: 4 }), false, 'a later email superseded it');
  assert.equal(mayBindIntent({ ...base, current: closed }), false, 'the sheet closed');
  assert.equal(mayBindIntent({ ...base, current: other }), false, 'a different request is open now');
  assert.equal(mayBindIntent({ ...base, finishing: true }), false, 'the host is finishing and has cleared the intent');
  assert.equal(mayBindIntent({ ...base, captured: null }), false);
});
