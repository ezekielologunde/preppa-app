// DESIGN 2.1 (Loop 2 item 3): a hard load of a prepper-only route must not bounce an approved
// cook to Home before the account state is known, and a signed-out Stripe Connect return must
// keep its ?connect= param.
//
// The decisions live in src/lib/accountGate.ts and are tested directly. The screens and the
// store are React Native modules, so nothing here renders them; the wiring tests read them as
// text and check that each guard decides through accountGate and waits on accountReady.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  adminRouteDecision,
  connectReturnAction,
  myHubDecision,
  prepperRouteDecision,
} from '../src/lib/accountGate';

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

// Hard load: storage hydrated (ready) but the first account reconcile has not finished, so
// prepperStatus is still its initial 'none' and there is no session yet.
const hardLoad = { ready: true, accountReady: false, signedIn: false, prepperStatus: 'none' };
const approvedCook = { ready: true, accountReady: true, signedIn: true, prepperStatus: 'approved' };

test('prepper guard waits until storage and the account reconcile are both done', () => {
  assert.equal(prepperRouteDecision({ ready: false, accountReady: false, prepperStatus: 'none' }), 'wait');
  assert.equal(prepperRouteDecision(hardLoad), 'wait');
  assert.equal(prepperRouteDecision({ ready: false, accountReady: true, prepperStatus: 'approved' }), 'wait');
});

test('prepper guard keeps an approved cook and redirects everyone else once ready', () => {
  assert.equal(prepperRouteDecision(approvedCook), 'allow');
  for (const prepperStatus of ['none', 'pending', 'rejected']) {
    assert.equal(prepperRouteDecision({ ready: true, accountReady: true, prepperStatus }), 'redirect', prepperStatus);
  }
});

test('admin guard waits for the account reconcile, then allows only an admin on web', () => {
  assert.equal(adminRouteDecision({ ready: true, accountReady: false, isAdmin: false, isWeb: true }), 'wait');
  assert.equal(adminRouteDecision({ ready: false, accountReady: true, isAdmin: true, isWeb: true }), 'wait');
  assert.equal(adminRouteDecision({ ready: true, accountReady: true, isAdmin: true, isWeb: true }), 'allow');
  assert.equal(adminRouteDecision({ ready: true, accountReady: true, isAdmin: false, isWeb: true }), 'redirect');
  assert.equal(adminRouteDecision({ ready: true, accountReady: true, isAdmin: true, isWeb: false }), 'redirect');
});

test('My Hub: not ready waits, approved stays, not approved redirects', () => {
  assert.equal(myHubDecision(hardLoad), 'wait');
  assert.equal(myHubDecision({ ...hardLoad, connect: 'return' }), 'wait');
  assert.equal(myHubDecision(approvedCook), 'allow');
  assert.equal(myHubDecision({ ...approvedCook, connect: 'return' }), 'allow');
  assert.equal(myHubDecision({ ...approvedCook, prepperStatus: 'pending' }), 'redirect');
  assert.equal(myHubDecision({ ...approvedCook, signedIn: false, prepperStatus: 'none' }), 'redirect');
});

test('My Hub keeps a signed-out Connect return on the page instead of redirecting', () => {
  const signedOut = { ready: true, accountReady: true, signedIn: false, prepperStatus: 'none' };
  assert.equal(myHubDecision({ ...signedOut, connect: 'return' }), 'signInToFinish');
  assert.equal(myHubDecision({ ...signedOut, connect: 'refresh' }), 'signInToFinish');
});

test('Connect return: waits for the account, keeps the param when signed out, handles for an approved cook', () => {
  assert.equal(connectReturnAction({ ...approvedCook }), 'none');
  assert.equal(connectReturnAction({ ...hardLoad, connect: 'return' }), 'wait');
  // A session can exist before the reconcile finishes; still wait.
  assert.equal(connectReturnAction({ ...approvedCook, accountReady: false, connect: 'return' }), 'wait');
  assert.equal(connectReturnAction({ ...approvedCook, ready: false, connect: 'return' }), 'wait');
  const signedOut = { ready: true, accountReady: true, signedIn: false, prepperStatus: 'none' };
  assert.equal(connectReturnAction({ ...signedOut, connect: 'return' }), 'needSignIn');
  assert.equal(connectReturnAction({ ...signedOut, connect: 'refresh' }), 'needSignIn');
  assert.equal(connectReturnAction({ ...approvedCook, connect: 'return' }), 'handle');
  assert.equal(connectReturnAction({ ...approvedCook, connect: 'refresh' }), 'handle');
  assert.equal(connectReturnAction({ ...approvedCook, prepperStatus: 'pending', connect: 'return' }), 'ignore');
});

function reconcileBody(store: string): string {
  const start = store.indexOf('const reconcileAccount = useCallback(');
  assert.ok(start >= 0, 'reconcileAccount not found in the store');
  const end = store.indexOf('}, [refreshAddresses, refreshOrders]);', start);
  assert.ok(end > start, 'end of reconcileAccount not found in the store');
  return store.slice(start, end);
}

test('store exposes accountReady and signedIn, and only reconcileAccount sets accountReady', () => {
  const store = read('src/store/store.tsx');
  assert.match(store, /interface Store \{[^}]*\n\s*accountReady: boolean;/);
  assert.match(store, /interface Store \{[^}]*\n\s*signedIn: boolean;/);
  assert.match(store, /useState\(false\);[^\n]*\n?/);
  assert.match(store, /const \[accountReady, setAccountReady\] = useState\(false\);/);
  assert.match(store, /const value: Store = \{[^}]*\n\s*accountReady,/);
  assert.match(store, /const value: Store = \{[^}]*\n\s*signedIn: !!uid,/);

  const body = reconcileBody(store);
  const total = store.split('setAccountReady(').length - 1;
  const inReconcile = body.split('setAccountReady(true)').length - 1;
  assert.ok(inReconcile >= 2, 'reconcileAccount must set accountReady on success and on failure');
  assert.equal(total, inReconcile, 'accountReady is set outside reconcileAccount');
  // Set only after the session is known, so signedIn is final when guards start deciding.
  assert.ok(body.indexOf('setUid(') < body.indexOf('setAccountReady(true)'), 'accountReady set before uid');
  // The failure path sets it too, or a transient error would leave guards waiting forever.
  const catchAt = body.lastIndexOf('} catch {');
  assert.ok(catchAt > 0 && body.indexOf('setAccountReady(true)', catchAt) > catchAt, 'catch path does not set accountReady');
});

test('hub and admin layouts decide through accountGate and wait on accountReady', () => {
  const hub = read('app/hub/_layout.tsx');
  assert.match(hub, /prepperRouteDecision\(\{ ready, accountReady, prepperStatus \}\)/);
  assert.match(hub, /if \(decision === 'wait'\) return null;/);
  assert.doesNotMatch(hub, /if \(!ready\) return null;/);

  const admin = read('app/admin/_layout.tsx');
  assert.match(admin, /adminRouteDecision\(\{ ready, accountReady, isAdmin, isWeb: Platform\.OS === 'web' \}\)/);
  assert.match(admin, /if \(decision === 'wait'\) return null;/);
  assert.doesNotMatch(admin, /if \(!ready\) return null;/);
});

test('My Hub waits on accountReady and consumes ?connect= only when it handles it', () => {
  const hub = read('app/(tabs)/my-hub.tsx');
  assert.match(hub, /myHubDecision\(hubState\)/);
  assert.match(hub, /connectReturnAction\(hubState\)/);
  assert.match(hub, /const hubState = \{ ready, accountReady, signedIn, prepperStatus, connect \};/);
  assert.doesNotMatch(hub, /if \(prepperStatus !== 'approved'\) return <Redirect/);

  const setParams = [...hub.matchAll(/router\.setParams\(\{ connect: undefined \}\)/g)];
  assert.equal(setParams.length, 1, 'expected exactly one place that consumes ?connect=');
  const handleGate = hub.indexOf("if (connectAction !== 'handle') return;");
  const signInBranch = hub.indexOf("if (connectAction === 'needSignIn') {");
  assert.ok(signInBranch > 0 && handleGate > signInBranch, 'sign-in branch must return before the handle gate');
  assert.ok(handleGate < setParams[0].index!, '?connect= is consumed before the handle gate');
  // The sign-in branch returns without consuming the param.
  assert.doesNotMatch(hub.slice(signInBranch, handleGate), /setParams/);
  assert.match(hub.slice(signInBranch, handleGate), /toast\('Sign in to finish setting up payouts\.', 'info'\)/);
});
