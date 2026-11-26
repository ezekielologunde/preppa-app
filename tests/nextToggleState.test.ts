// DESIGN docs/web-launch/SIGNIN-DESIGN.md (Loop 2 task 2.1, part C1b): a server-side toggle (post
// like, post save) that runs after a sign-in only ever sets, never clears, and changes nothing
// without a server value it can trust.
import assert from 'node:assert/strict';
import test from 'node:test';
import { nextToggleState } from '../src/lib/requireAuthLogic';

test('a tap that is not resumed flips the shown value either way', () => {
  assert.deepEqual(nextToggleState(false, false, null), { action: 'toggle', next: true });
  assert.deepEqual(nextToggleState(false, true, null), { action: 'toggle', next: false });
  // The server value is ignored when not resumed (the shown value was read signed in).
  assert.deepEqual(nextToggleState(false, true, false), { action: 'toggle', next: false });
  assert.deepEqual(nextToggleState(false, false, true), { action: 'toggle', next: true });
});

test('resumed with no server value (read failed or no read exists) changes nothing', () => {
  assert.deepEqual(nextToggleState(true, false, null), { action: 'abort' });
  assert.deepEqual(nextToggleState(true, true, null), { action: 'abort' });
  assert.deepEqual(nextToggleState(true, false, undefined as unknown as null), { action: 'abort' });
  assert.deepEqual(nextToggleState(true, false, 'true' as unknown as boolean), { action: 'abort' });
});

test('resumed and already set on the server keeps it, whatever the screen showed', () => {
  assert.deepEqual(nextToggleState(true, false, true), { action: 'keep' });
  assert.deepEqual(nextToggleState(true, true, true), { action: 'keep' });
});

test('resumed and not set on the server sets it, even when the screen showed it set', () => {
  assert.deepEqual(nextToggleState(true, false, false), { action: 'toggle', next: true });
  assert.deepEqual(nextToggleState(true, true, false), { action: 'toggle', next: true });
});

test('a resumed toggle never clears an already-set value', () => {
  for (const current of [true, false]) {
    for (const server of [true, false, null]) {
      const step = nextToggleState(true, current, server);
      assert.ok(!(step.action === 'toggle' && step.next === false), `cleared for current=${current} server=${server}`);
    }
  }
});
