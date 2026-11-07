import assert from 'node:assert/strict';
import test from 'node:test';
import { requireSucceededPayment } from '../src/lib/payment-status';

test('only settled web and native payment states report success', () => {
  for (const status of ['succeeded', 'Succeeded']) assert.doesNotThrow(() => requireSucceededPayment(status));
  for (const status of [undefined, '', 'requires_action', 'RequiresAction', 'RequiresPaymentMethod', 'Canceled', 'RequiresCapture']) {
    assert.throws(() => requireSucceededPayment(status), /not been confirmed/);
  }
});
test('processing payments do not prompt an immediate new charge', () => {
  for (const status of ['processing', 'Processing']) assert.throws(() => requireSucceededPayment(status), /Check your order before trying again/);
});
