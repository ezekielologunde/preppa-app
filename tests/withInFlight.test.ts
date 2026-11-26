// DESIGN docs/web-launch/SIGNIN-DESIGN.md (part C1b, review fix 3): the in-flight flag behind
// FeedReel like, save and follow is set while the action runs and cleared however it ends, so a
// tap is never locked out; a tap while one is in flight runs nothing.
import assert from 'node:assert/strict';
import test from 'node:test';
import { withInFlight } from '../src/lib/requireAuthLogic';

test('sets the flag while the action runs and clears it after a success', async () => {
  const ref = { current: false };
  let seen: boolean | undefined;
  let release!: () => void;
  const p = withInFlight(ref, async () => {
    seen = ref.current;
    await new Promise<void>((r) => { release = r; });
  });
  assert.equal(seen, true);
  assert.equal(ref.current, true, 'set while running');
  release();
  await p;
  assert.equal(ref.current, false, 'cleared after a success');
});

test('clears the flag after a thrown error and passes the error through', async () => {
  const ref = { current: false };
  await assert.rejects(withInFlight(ref, async () => { throw new Error('boom'); }), /boom/);
  assert.equal(ref.current, false, 'cleared after an async throw');
  await assert.rejects(withInFlight(ref, () => { throw new Error('sync'); }), /sync/);
  assert.equal(ref.current, false, 'cleared after a sync throw');
});

test('clears the flag after an early return (the abort branch), so the next tap runs', async () => {
  const ref = { current: false };
  let reached = false;
  await withInFlight(ref, async () => {
    if (ref.current) return;
    reached = true;
  });
  assert.equal(reached, false);
  assert.equal(ref.current, false, 'cleared after an early return');
  let ran = 0;
  await withInFlight(ref, () => { ran++; });
  assert.equal(ran, 1);
  assert.equal(ref.current, false);
});

test('a call while one is in flight runs nothing and leaves the flag to the first', async () => {
  const ref = { current: false };
  let release!: () => void;
  const first = withInFlight(ref, () => new Promise<void>((r) => { release = r; }));
  let ran = 0;
  await withInFlight(ref, () => { ran++; });
  assert.equal(ran, 0, 'dropped');
  assert.equal(ref.current, true, 'still held by the first');
  release();
  await first;
  assert.equal(ref.current, false);
});
