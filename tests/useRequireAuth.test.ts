// DESIGN docs/web-launch/SIGNIN-DESIGN.md (Loop 2 task 2.1, part C): the pure decisions behind
// useRequireAuth. Money kinds never run by themselves after a sign-in; idempotent kinds run once.
import assert from 'node:assert/strict';
import test from 'node:test';
import { INTENT_KINDS, type AuthReason, type Intent } from '../src/lib/authRequest';
import {
  AUTO_RUN_KINDS,
  buildIntent,
  decideAfterSignIn,
  effectiveKind,
  isAutoRunKind,
  preflightDecision,
} from '../src/lib/requireAuthLogic';

const IDEMPOTENT = ['follow', 'save', 'like', 'openThread'] as const;
const MONEY = ['checkout', 'book', 'connect'] as const;
const ALL_REASONS: AuthReason[] = [...IDEMPOTENT, ...MONEY, 'generic'];

test('auto-run kinds are exactly the idempotent ones', () => {
  assert.deepEqual([...AUTO_RUN_KINDS].sort(), [...IDEMPOTENT].sort());
  // Every intent kind is either idempotent or a money kind: nothing is left undecided.
  assert.deepEqual([...INTENT_KINDS].sort(), [...IDEMPOTENT, ...MONEY].sort());
});

test('decideAfterSignIn: every kind x ok', () => {
  for (const kind of IDEMPOTENT) {
    assert.equal(decideAfterSignIn(kind, true), 'run', kind);
    assert.equal(decideAfterSignIn(kind, false), 'cancel', kind);
  }
  for (const kind of MONEY) {
    assert.equal(decideAfterSignIn(kind, true), 'reenable', kind);
    assert.equal(decideAfterSignIn(kind, false), 'cancel', kind);
  }
  assert.equal(decideAfterSignIn('generic', true), 'reenable');
  assert.equal(decideAfterSignIn('generic', false), 'cancel');
});

test('money kinds never auto-run, whatever the sign-in result', () => {
  for (const kind of [...MONEY, 'generic' as const]) {
    for (const ok of [true, false]) assert.notEqual(decideAfterSignIn(kind, ok), 'run', `${kind} ${ok}`);
    assert.equal(isAutoRunKind(kind), false, kind);
  }
});

test('only a literal true counts as signed in', () => {
  for (const kind of ALL_REASONS) {
    for (const bad of [undefined, null, 1, 'true', {}] as unknown[]) {
      assert.equal(decideAfterSignIn(kind, bad as boolean), 'cancel', `${kind} ${String(bad)}`);
    }
  }
});

test('isAutoRunKind rejects unknown and non-string kinds', () => {
  for (const v of ['', 'Follow', 'checkout ', '__proto__', 'constructor', null, undefined, 3, {}]) {
    assert.equal(isAutoRunKind(v), false, String(v));
  }
});

test('preflightDecision waits until storage and the first account reconcile are both done', () => {
  for (const signedIn of [true, false]) {
    assert.equal(preflightDecision({ ready: false, accountReady: false, signedIn }), 'wait');
    assert.equal(preflightDecision({ ready: true, accountReady: false, signedIn }), 'wait');
    assert.equal(preflightDecision({ ready: false, accountReady: true, signedIn }), 'wait');
  }
  assert.equal(preflightDecision({ ready: true, accountReady: true, signedIn: true }), 'run');
  assert.equal(preflightDecision({ ready: true, accountReady: true, signedIn: false }), 'signIn');
});

test('effectiveKind: an intent that disagrees with the reason never auto-runs', () => {
  const intent = (kind: Intent['kind']): Intent => ({ kind, ids: [], path: '/', t: 1 });
  assert.equal(effectiveKind('follow', undefined), 'follow');
  assert.equal(effectiveKind('follow', intent('follow')), 'follow');
  assert.equal(effectiveKind('follow', intent('checkout')), 'generic');
  assert.equal(effectiveKind('checkout', intent('follow')), 'generic');
  assert.equal(decideAfterSignIn(effectiveKind('follow', intent('book')), true), 'reenable');
});

test('buildIntent keeps safe ids, drops all ids when one is unsafe, and drops an unsafe path', () => {
  const uuid = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b';
  assert.deepEqual(buildIntent('follow', [uuid], `/store/${uuid}`, 5), { kind: 'follow', ids: [uuid], path: `/store/${uuid}`, t: 5 });
  assert.deepEqual(buildIntent('openThread', [uuid, 'x/y'], '/store', 5)?.ids, []);
  assert.deepEqual(buildIntent('openThread', [uuid, 7], '/store', 5)?.ids, []);
  assert.deepEqual(buildIntent('book', Array(9).fill(uuid), '/experience', 5)?.ids, []);
  assert.equal(buildIntent('follow', [uuid], '/store/a b', 5), undefined);
  assert.equal(buildIntent('follow', [uuid], '//evil.com', 5), undefined);
  assert.equal(buildIntent('follow', [uuid], '/store/x?y=1', 5), undefined);
});
