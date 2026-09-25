import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_ORDER_ITEM_QUANTITY, normalizeOrderQuantity } from '../src/config/limits';

test('keeps order quantities within the payment API range', () => {
  assert.equal(normalizeOrderQuantity(0), 1);
  assert.equal(normalizeOrderQuantity(3.9), 3);
  assert.equal(normalizeOrderQuantity(MAX_ORDER_ITEM_QUANTITY), MAX_ORDER_ITEM_QUANTITY);
  assert.equal(normalizeOrderQuantity(MAX_ORDER_ITEM_QUANTITY + 1), MAX_ORDER_ITEM_QUANTITY);
  assert.equal(normalizeOrderQuantity(Number.NaN), 1);
});
