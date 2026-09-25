import assert from 'node:assert/strict';
import test from 'node:test';
import { customerWeeklyCents, estimateBox, estimateCycle } from '../src/data/subscriptionTotals';

test('applies the advertised box discount and service fee in cents', () => {
  const estimate = estimateBox([
    { priceCents: 1250, qty: 2 },
    { priceCents: 875, qty: 1 },
  ]);

  assert.deepEqual(estimate, {
    subtotalCents: 3375,
    discountCents: 338,
    feeCents: 506,
    totalCents: 3543,
  });
});

test('rounds discount and fee independently like the billing functions', () => {
  const estimate = estimateBox([{ priceCents: 999, qty: 1 }]);

  assert.equal(estimate.discountCents, 100);
  assert.equal(estimate.feeCents, 150);
  assert.equal(estimate.totalCents, 1049);
});

test('preserves quantities when pricing a custom box', () => {
  const estimate = estimateBox([
    { priceCents: 500, qty: 3 },
    { priceCents: 750, qty: 2 },
  ]);

  assert.equal(estimate.subtotalCents, 3000);
  assert.equal(estimate.totalCents, 3150);
});

test('waives the box service fee for an active PrepPlus member', () => {
  const estimate = estimateBox([{ priceCents: 2000, qty: 2 }], true);

  assert.equal(estimate.subtotalCents, 4000);
  assert.equal(estimate.discountCents, 400);
  assert.equal(estimate.feeCents, 0);
  assert.equal(estimate.totalCents, 3600);
});

test('shows the server-matched fixed plan price for members and nonmembers', () => {
  assert.equal(customerWeeklyCents(2500, 1000), 2750);
  assert.equal(customerWeeklyCents(2500, 1000, true), 2500);
});

test('waives the full plan service fee after per-delivery pricing', () => {
  const plan = {
    priceCents: 0,
    selectionModel: 'customer_choice' as const,
    perMealCents: 1125,
    perDeliveryCents: 250,
    serviceFeeBps: 1000,
    items: [],
  };
  const selection = [{ qty: 3 }];

  assert.deepEqual(estimateCycle(plan, selection), {
    subtotalCents: 3625,
    feeCents: 363,
    totalCents: 3988,
  });
  assert.deepEqual(estimateCycle(plan, selection, true), {
    subtotalCents: 3625,
    feeCents: 0,
    totalCents: 3625,
  });
});
