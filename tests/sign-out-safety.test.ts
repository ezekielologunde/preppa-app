import assert from 'node:assert/strict';
import test from 'node:test';
import { confirmLocalSignOut } from '../src/lib/signOutSafety';

test('signs out only this device and confirms its session is absent', async () => {
  const calls: string[] = [];
  await confirmLocalSignOut({ signOut: async options => { assert.deepEqual(options, { scope: 'local' }); calls.push('signOut'); return { error: null }; },
    getSession: async () => { calls.push('getSession'); return { data: { session: null }, error: null }; } });
  assert.deepEqual(calls, ['signOut','getSession']);
});
test('a network revocation error does not negate a confirmed local logout', async () => {
  await confirmLocalSignOut({ signOut: async () => ({ error: new Error('offline') }), getSession: async () => ({ data: { session: null }, error: null }) });
});
test('a retained session or failed session read cannot report successful logout', async () => {
  for (const result of [{ data: { session: { user: 'fixture' } }, error: null }, { data: { session: null }, error: new Error('storage unavailable') }]) {
    await assert.rejects(confirmLocalSignOut({ signOut: async () => ({ error: null }), getSession: async () => result }), /could not be confirmed/);
  }
});
test('a storage exception during sign-out is propagated', async () => {
  await assert.rejects(confirmLocalSignOut({ signOut: async () => { throw new Error('storage failure'); }, getSession: async () => { assert.fail('must not confirm'); } }), /storage failure/);
});
