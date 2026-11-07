import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runSessionTask } from '../src/lib/sessionTask';

test('a late notification response cannot restore another account data', async () => {
  let epoch = 1;
  let complete!: (value: string[]) => void;
  const pending = new Promise<string[]>(resolve => { complete = resolve; });
  const notifications: string[][] = [];
  const task = runSessionTask(() => epoch === 1, () => pending, value => notifications.push(value));
  epoch = 2;
  complete(['old account order']);
  await task;
  assert.deepEqual(notifications, []);
});
test('late failures are ignored after subscription disposal', async () => {
  let disposed = false;
  let fail!: (error: Error) => void;
  const pending = new Promise<number>((_, reject) => { fail = reject; });
  let errors = 0;
  const task = runSessionTask(() => !disposed, () => pending, () => assert.fail(), () => { errors++; });
  disposed = true;
  fail(new Error('old request'));
  await task;
  assert.equal(errors, 0);
});
test('current sessions receive results and failures; stale callbacks do not start requests', async () => {
  let value = 0;
  await runSessionTask(() => true, async () => 3, result => { value = result; });
  assert.equal(value, 3);
  await runSessionTask(() => true, async () => { throw new Error('failed'); }, () => assert.fail(), () => { value = 4; });
  assert.equal(value, 4);
  await runSessionTask(() => false, async () => { assert.fail('stale subscription must not fetch'); }, () => assert.fail());
});
