// DESIGN docs/web-launch/SIGNIN-DESIGN.md (Loop 2 task 2.1, part C): the wait/sign-in/run loop behind
// useRequireAuth, driven with fakes. Native runs at once; money kinds never run by themselves after
// a wait or a sign-in; the pending flag never sticks; nothing runs after the screen is gone.
import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthReason, Intent } from '../src/lib/authRequest';
import {
  liveSessionCheck,
  nextFollowState,
  runRequireAuth,
  type RequireAuthDeps,
  type RequireAuthRun,
} from '../src/lib/requireAuthLogic';

const IDEMPOTENT = ['follow', 'save', 'like', 'openThread'] as const;
const MONEY = ['checkout', 'book', 'connect'] as const;

const tick = async (n = 5) => {
  for (let i = 0; i < n; i++) await new Promise<void>((r) => setImmediate(r));
};

interface Harness {
  deps: RequireAuthDeps;
  state: { ready: boolean; accountReady: boolean; signedIn: boolean };
  runs: Array<{ resumed: boolean }>;
  run: RequireAuthRun;
  waiters: Array<() => void>;
  sheets: Array<{ reason: AuthReason; intent: Intent | undefined; resolve: (ok: boolean) => void }>;
  sessionChecks: Array<(live: boolean) => void>;
  setAlive(v: boolean): void;
  /** Make the state ready (signed in or not) and release every waiter. */
  becomeReady(signedIn: boolean): void;
}

function harness(opts: { isWeb?: boolean; ready?: boolean; signedIn?: boolean; session?: boolean | 'manual'; throwRun?: boolean } = {}): Harness {
  const state = { ready: opts.ready ?? true, accountReady: opts.ready ?? true, signedIn: opts.signedIn ?? false };
  let isAlive = true;
  const runs: Array<{ resumed: boolean }> = [];
  const waiters: Harness['waiters'] = [];
  const sheets: Harness['sheets'] = [];
  const sessionChecks: Harness['sessionChecks'] = [];
  const session = opts.session ?? false;
  const deps: RequireAuthDeps = {
    isWeb: opts.isWeb ?? true,
    getState: () => ({ ...state }),
    waitForReady: () => new Promise<void>((resolve) => { waiters.push(resolve); }),
    hasSession: () =>
      session === 'manual'
        ? new Promise<boolean>((resolve) => { sessionChecks.push(resolve); })
        : (sessionChecks.push(() => undefined), Promise.resolve(session)),
    requestSignIn: (reason, intent) => new Promise<boolean>((resolve) => { sheets.push({ reason, intent, resolve }); }),
    alive: () => isAlive,
    pending: { current: false },
  };
  const run: RequireAuthRun = async (ctx) => {
    runs.push(ctx);
    if (opts.throwRun) throw new Error('boom');
  };
  return {
    deps, state, runs, run, waiters, sheets, sessionChecks,
    setAlive: (v) => { isAlive = v; },
    becomeReady: (signedIn) => {
      state.ready = true;
      state.accountReady = true;
      state.signedIn = signedIn;
      for (const w of waiters.splice(0)) w();
    },
  };
}

test('native runs the action at once: no wait, no session check, no sheet', async () => {
  for (const ready of [true, false]) {
    for (const reason of [...IDEMPOTENT, ...MONEY]) {
      const h = harness({ isWeb: false, ready, signedIn: false });
      assert.equal(await runRequireAuth(h.deps, reason, undefined, h.run), true);
      assert.deepEqual(h.runs, [{ resumed: false }]);
      assert.equal(h.waiters.length + h.sheets.length + h.sessionChecks.length, 0);
      assert.equal(h.deps.pending.current, false);
    }
  }
});

test('native passes a thrown run through, as before', async () => {
  const h = harness({ isWeb: false, throwRun: true });
  await assert.rejects(runRequireAuth(h.deps, 'checkout', undefined, h.run), /boom/);
});

test('web, signed in: runs now with resumed false, money kinds included', async () => {
  for (const reason of [...IDEMPOTENT, ...MONEY]) {
    const h = harness({ signedIn: true });
    assert.equal(await runRequireAuth(h.deps, reason, undefined, h.run), true);
    assert.deepEqual(h.runs, [{ resumed: false }], reason);
    assert.equal(h.sheets.length, 0);
  }
});

test('a dismissed sheet returns false, runs nothing, and clears the pending flag', async () => {
  const h = harness();
  const p = runRequireAuth(h.deps, 'follow', undefined, h.run);
  await tick();
  assert.equal(h.sheets.length, 1);
  assert.equal(h.deps.pending.current, true);
  h.sheets[0].resolve(false);
  assert.equal(await p, false);
  assert.deepEqual(h.runs, []);
  assert.equal(h.deps.pending.current, false);
  // The next tap opens the sheet again.
  const again = runRequireAuth(h.deps, 'follow', undefined, h.run);
  await tick();
  assert.equal(h.sheets.length, 2);
  h.sheets[1].resolve(false);
  assert.equal(await again, false);
});

test('idempotent kinds run once after a sign-in, with resumed true, and clear the pending flag', async () => {
  for (const reason of IDEMPOTENT) {
    const h = harness();
    const p = runRequireAuth(h.deps, reason, undefined, h.run);
    await tick();
    assert.equal(h.sheets[0].reason, reason);
    h.sheets[0].resolve(true);
    assert.equal(await p, true);
    assert.deepEqual(h.runs, [{ resumed: true }], reason);
    assert.equal(h.deps.pending.current, false);
  }
});

test('money kinds never run after a sign-in and return true (the button is enabled again)', async () => {
  for (const reason of MONEY) {
    const h = harness();
    const p = runRequireAuth(h.deps, reason, undefined, h.run);
    await tick();
    h.sheets[0].resolve(true);
    assert.equal(await p, true);
    assert.deepEqual(h.runs, [], reason);
    assert.equal(h.deps.pending.current, false);
  }
});

test('an intent that disagrees with the reason never runs after a sign-in', async () => {
  const h = harness();
  const p = runRequireAuth(h.deps, 'follow', { kind: 'checkout', ids: [], path: '/checkout', t: 1 }, h.run);
  await tick();
  h.sheets[0].resolve(true);
  assert.equal(await p, true);
  assert.deepEqual(h.runs, []);
});

test('a second call while one is pending returns false and runs nothing', async () => {
  const h = harness();
  const first = runRequireAuth(h.deps, 'follow', undefined, h.run);
  await tick();
  assert.equal(await runRequireAuth(h.deps, 'follow', undefined, h.run), false);
  assert.equal(await runRequireAuth(h.deps, 'checkout', undefined, h.run), false);
  assert.equal(h.sheets.length, 1, 'no second sheet');
  h.sheets[0].resolve(true);
  assert.equal(await first, true);
  assert.deepEqual(h.runs, [{ resumed: true }]);

  // Also while waiting for the account state.
  const w = harness({ ready: false });
  const waiting = runRequireAuth(w.deps, 'follow', undefined, w.run);
  await tick();
  assert.equal(await runRequireAuth(w.deps, 'follow', undefined, w.run), false);
  assert.equal(w.waiters.length, 1);
  w.becomeReady(true);
  assert.equal(await waiting, true);
  assert.deepEqual(w.runs, [{ resumed: true }]);
});

test('a run that throws after a sign-in still clears the pending flag', async () => {
  const h = harness({ throwRun: true });
  const p = runRequireAuth(h.deps, 'follow', undefined, h.run);
  await tick();
  h.sheets[0].resolve(true);
  await assert.rejects(p, /boom/);
  assert.equal(h.deps.pending.current, false);
});

test('unmount while waiting: returns false, runs nothing, opens no sheet, clears pending', async () => {
  const h = harness({ ready: false });
  const p = runRequireAuth(h.deps, 'follow', undefined, h.run);
  await tick();
  h.setAlive(false);
  h.becomeReady(true);
  assert.equal(await p, false);
  assert.deepEqual(h.runs, []);
  assert.equal(h.sheets.length, 0);
  assert.equal(h.deps.pending.current, false);
});

test('unmount while the sheet is open: nothing runs after the sign-in', async () => {
  const h = harness();
  const p = runRequireAuth(h.deps, 'follow', undefined, h.run);
  await tick();
  h.setAlive(false);
  h.sheets[0].resolve(true);
  assert.equal(await p, false);
  assert.deepEqual(h.runs, []);
  assert.equal(h.deps.pending.current, false);
});

test('unmount during the session check: no sheet, no run', async () => {
  const h = harness({ session: 'manual' });
  const p = runRequireAuth(h.deps, 'follow', undefined, h.run);
  await tick();
  assert.equal(h.sessionChecks.length, 1);
  h.setAlive(false);
  h.sessionChecks[0](true);
  assert.equal(await p, false);
  assert.deepEqual(h.runs, []);
  assert.equal(h.sheets.length, 0);
  assert.equal(h.deps.pending.current, false);
});

// Fix 2: money kinds do not fire by themselves when an account-state wait ends signed in.
test('after a wait that ends signed in: idempotent kinds run, money kinds return true without running', async () => {
  for (const reason of IDEMPOTENT) {
    const h = harness({ ready: false });
    const p = runRequireAuth(h.deps, reason, undefined, h.run);
    await tick();
    h.becomeReady(true);
    assert.equal(await p, true);
    assert.deepEqual(h.runs, [{ resumed: true }], reason);
    assert.equal(h.sheets.length, 0);
  }
  for (const reason of MONEY) {
    const h = harness({ ready: false });
    const p = runRequireAuth(h.deps, reason, undefined, h.run);
    await tick();
    h.becomeReady(true);
    assert.equal(await p, true, reason);
    assert.deepEqual(h.runs, [], reason);
    assert.equal(h.sheets.length, 0, reason);
    assert.equal(h.deps.pending.current, false);
  }
});

// Review fix 1: a wait means the tap-time state was not verified, so the run after it is resumed
// (toggles re-read the server or change nothing instead of flipping stale state).
test('a run after a wait is resumed: one wait, several wake-ups, and a wait then a live session', async () => {
  // Settle any sheet that wrongly opens, so a regression fails instead of hanging.
  const settle = (h: Harness) => { for (const s of h.sheets) s.resolve(false); };
  for (const reason of IDEMPOTENT) {
    const h = harness({ ready: false });
    const p = runRequireAuth(h.deps, reason, undefined, h.run);
    await tick();
    h.becomeReady(true);
    await tick();
    settle(h);
    assert.equal(await p, true, reason);
    assert.deepEqual(h.runs, [{ resumed: true }], `${reason}: resumed after a wait`);
    assert.equal(h.sheets.length, 0, reason);
    assert.equal(h.deps.pending.current, false);
  }
  // Wake-ups before the state is known: nothing runs; then one run, resumed.
  const many = harness({ ready: false });
  const p2 = runRequireAuth(many.deps, 'like', undefined, many.run);
  await tick();
  for (const w of many.waiters.splice(0)) w();
  await tick();
  assert.deepEqual(many.runs, [], 'nothing runs while the state is unknown');
  many.becomeReady(true);
  await tick();
  settle(many);
  assert.equal(await p2, true);
  assert.deepEqual(many.runs, [{ resumed: true }]);
  // A wait that ends signed out by the store with a live session: resumed, no sheet.
  const live = harness({ ready: false, session: true });
  const p3 = runRequireAuth(live.deps, 'save', undefined, live.run);
  await tick();
  live.becomeReady(false);
  await tick();
  settle(live);
  assert.equal(await p3, true);
  assert.deepEqual(live.runs, [{ resumed: true }]);
  assert.equal(live.sheets.length, 0);
});

test('after a wait that ends signed out: the sheet opens', async () => {
  const h = harness({ ready: false });
  const p = runRequireAuth(h.deps, 'checkout', undefined, h.run);
  await tick();
  assert.equal(h.sheets.length, 0, 'never a sheet before the account state is known');
  h.becomeReady(false);
  await tick();
  assert.equal(h.sheets.length, 1);
  h.sheets[0].resolve(false);
  assert.equal(await p, false);
});

// Fix 3: a stale signed-out store flag after a sign-in must not open a second sheet.
test('store says signed out but a live session exists: no sheet; idempotent runs resumed, money re-enables', async () => {
  // Settle any sheet that wrongly opens, so a regression fails here instead of hanging.
  const settle = async (h: Harness, reason: AuthReason) => {
    const p = runRequireAuth(h.deps, reason, undefined, h.run);
    await tick();
    const opened = h.sheets.length;
    for (const s of h.sheets) s.resolve(false);
    const result = await p;
    assert.equal(opened, 0, `${reason}: no second sheet`);
    return result;
  };
  for (const reason of IDEMPOTENT) {
    const h = harness({ session: true });
    assert.equal(await settle(h, reason), true);
    assert.deepEqual(h.runs, [{ resumed: true }], reason);
    assert.equal(h.deps.pending.current, false);
  }
  for (const reason of MONEY) {
    const h = harness({ session: true });
    assert.equal(await settle(h, reason), true);
    assert.deepEqual(h.runs, [], reason);
  }
});

test('store says signed out and no live session: the session is checked once, then the sheet opens', async () => {
  const h = harness({ session: false });
  const p = runRequireAuth(h.deps, 'follow', undefined, h.run);
  await tick();
  assert.equal(h.sessionChecks.length, 1);
  assert.equal(h.sheets.length, 1);
  h.sheets[0].resolve(false);
  assert.equal(await p, false);
});

test('liveSessionCheck: only a resolved true within the time counts', async () => {
  assert.equal(await liveSessionCheck(async () => true, 1000), true);
  assert.equal(await liveSessionCheck(async () => false, 1000), false);
  assert.equal(await liveSessionCheck(() => Promise.reject(new Error('x')), 1000), false);
  assert.equal(await liveSessionCheck(() => { throw new Error('sync'); }, 1000), false);
  assert.equal(await liveSessionCheck(() => Promise.resolve(1 as unknown as boolean), 1000), false);
  assert.equal(await liveSessionCheck(() => new Promise<boolean>(() => undefined), 20), false);
  const late = liveSessionCheck(() => new Promise<boolean>((r) => setTimeout(() => r(true), 60)), 20);
  assert.equal(await late, false);
});

// Store Follow: a resumed follow only ever follows; a failed re-read changes nothing.
test('nextFollowState', () => {
  assert.deepEqual(nextFollowState(false, false, null), { action: 'toggle', next: true });
  assert.deepEqual(nextFollowState(false, true, null), { action: 'toggle', next: false });
  for (const following of [true, false]) {
    assert.deepEqual(nextFollowState(true, following, true), { action: 'keep' }, `already following, screen ${following}`);
    assert.deepEqual(nextFollowState(true, following, false), { action: 'toggle', next: true });
    assert.deepEqual(nextFollowState(true, following, null), { action: 'abort' }, 'fetch failure changes nothing');
  }
  for (const following of [true, false]) {
    for (const server of [true, false, null]) {
      const step = nextFollowState(true, following, server);
      assert.ok(!(step.action === 'toggle' && step.next === false), 'a resumed follow never unfollows');
    }
  }
});
