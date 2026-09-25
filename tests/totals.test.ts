import assert from 'node:assert/strict';
import test from 'node:test';
import { computeTotals } from '../src/data/totals';

test('computes the customer preview with the production 10 percent service fee', () => {
  const totals = computeTotals([
    { cook: 'kitchen-a', price: 12.5, qty: 2 },
    { cook: 'kitchen-a', price: 7.25, qty: 1 },
  ], 3, 'delivery');

  assert.deepEqual(totals, {
    subtotal: 32.25,
    service: 3.23,
    delivery: 0,
    tax: 0,
    total: 38.48,
    tip: 3,
  });
});

test('rounds currency once at each displayed total boundary', () => {
  const totals = computeTotals([
    { cook: 'kitchen-a', price: 3.33, qty: 3 },
  ], 0, 'pickup');

  assert.equal(totals.subtotal, 9.99);
  assert.equal(totals.service, 1);
  assert.equal(totals.total, 10.99);
});

test('does not invent delivery or flat tax charges in either fulfillment preview', () => {
  const lines = [{ cook: 'kitchen-a', price: 20, qty: 1 }];
  const delivery = computeTotals(lines, 0, 'delivery');
  const pickup = computeTotals(lines, 0, 'pickup');

  assert.equal(delivery.delivery, 0);
  assert.equal(pickup.delivery, 0);
  assert.equal(delivery.tax, 0);
  assert.equal(pickup.tax, 0);
  assert.equal(delivery.total, pickup.total);
});

test('keeps the preview scoped to the cart lines passed for one kitchen', () => {
  const firstKitchen = computeTotals([
    { cook: 'kitchen-a', price: 15, qty: 2 },
  ], 2, 'delivery');

  assert.equal(firstKitchen.subtotal, 30);
  assert.equal(firstKitchen.service, 3);
  assert.equal(firstKitchen.total, 35);
});
