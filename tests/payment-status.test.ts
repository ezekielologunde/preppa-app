import assert from 'node:assert/strict';
import test from 'node:test';
import { confirmationError, PaymentUnconfirmedError, requireSucceededPayment, unsettledPaymentMessage } from '../src/lib/payment-status';

test('only settled web and native payment states report success', () => {
  for (const status of ['succeeded', 'Succeeded']) assert.doesNotThrow(() => requireSucceededPayment(status));
  for (const status of [undefined, '', 'requires_action', 'RequiresAction', 'RequiresPaymentMethod', 'Canceled', 'RequiresCapture']) {
    assert.throws(() => requireSucceededPayment(status), /not been confirmed/);
  }
});
test('processing payments do not prompt an immediate new charge', () => {
  for (const status of ['processing', 'Processing']) assert.throws(() => requireSucceededPayment(status), /Check your order before trying again/);
});
test('checkout preserves known uncertain-payment messages without exposing arbitrary errors', () => {
  for (const reason of ['processing', 'unconfirmed', 'unavailable'] as const) {
    assert.match(unsettledPaymentMessage(new PaymentUnconfirmedError(reason))!, /Check your order before trying again/);
  }
  assert.equal(unsettledPaymentMessage(new Error('private provider detail')), undefined);
  assert.equal(unsettledPaymentMessage({ message: 'forged payment status' }), undefined);
});

test('new-card and wallet confirmation use order-check instructions for unsettled payments', () => {
  assert.equal(confirmationError('pay', 'succeeded'), null);
  for (const status of ['processing', 'requires_action', 'requires_payment_method', undefined]) {
    assert.match(confirmationError('pay', status)!, /Check your order before trying again/);
  }
  assert.equal(confirmationError('save', 'succeeded'), null);
  assert.match(confirmationError('save', 'processing')!, /card is still being verified/);
});
