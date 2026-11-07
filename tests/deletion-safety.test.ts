import assert from 'node:assert/strict';
import test from 'node:test';
import { cancelForDeletion, requireDeletionResult } from '../supabase/functions/delete-account/safety';

test('database failures cannot masquerade as absent memberships or eligibility', () => {
  for (const data of [null, [], { has_active_orders: false }]) {
    assert.throws(() => requireDeletionResult({ data, error: { message: 'database unavailable' } }), /dependency failed/);
  }
  assert.equal(requireDeletionResult({ data: null, error: null }), null);
});

test('confirmed canceled subscriptions make retries idempotent', async () => {
  let calls = 0;
  await cancelForDeletion({ retrieve: async () => ({ status: 'canceled' }), cancel: async () => { calls++; return { status: 'canceled' }; } }, 'sub_fixture');
  assert.equal(calls, 0);
});

test('active subscriptions must return confirmed cancellation', async () => {
  const calls: string[] = [];
  await cancelForDeletion({ retrieve: async (id) => { calls.push(`retrieve:${id}`); return { status: 'active' }; }, cancel: async (id) => { calls.push(`cancel:${id}`); return { status: 'canceled' }; } }, 'sub_fixture');
  assert.deepEqual(calls, ['retrieve:sub_fixture', 'cancel:sub_fixture']);
});

test('provider retrieval, cancellation and unconfirmed responses stop deletion', async () => {
  await assert.rejects(cancelForDeletion({ retrieve: async () => { throw new Error('unavailable'); }, cancel: async () => { assert.fail('must not cancel'); } }, 'sub_fixture'));
  await assert.rejects(cancelForDeletion({ retrieve: async () => ({ status: 'active' }), cancel: async () => { throw new Error('unavailable'); } }, 'sub_fixture'));
  await assert.rejects(cancelForDeletion({ retrieve: async () => ({ status: 'active' }), cancel: async () => ({ status: 'active' }) }, 'sub_fixture'), /not confirmed/);
});

test('only absent subscription references skip provider calls', async () => {
  const api = { retrieve: async () => { assert.fail('unexpected provider call'); }, cancel: async () => { assert.fail('unexpected provider call'); } };
  await cancelForDeletion(api, null);
  await cancelForDeletion(api, undefined);
  await assert.rejects(cancelForDeletion(api, '  '), /Invalid/);
});
