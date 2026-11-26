import { test, expect, sheet } from '../support/fixtures';
import { KITCHEN_ID, TEST_EMAIL, TEST_PASSWORD } from '../support/mocks';

// The cart as the store persists it (AsyncStorage on web is localStorage, key 'preppa.v1').
// Pickup mode, so Pay needs no delivery address. Seeded once per test, before the app boots.
const SEED = {
  onboarded: true,
  cart: [{
    key: 'meal-fixture', name: 'Fixture Jollof', cook: KITCHEN_ID, price: 12, grad: 'g1', qty: 1,
    mealUuid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', kitchenUuid: KITCHEN_ID, kitchenName: 'Test Kitchen',
    supportsDelivery: true, supportsPickup: true,
  }],
  tip: 0,
  mode: 'pickup',
};

test('Pay as a guest opens the sheet; after sign-in nothing is charged until Pay is tapped again', async ({ page, mocks }) => {
  await page.addInitScript((seed) => {
    if (!sessionStorage.getItem('e2e.seeded')) {
      localStorage.setItem('preppa.v1', seed);
      sessionStorage.setItem('e2e.seeded', '1');
    }
  }, JSON.stringify(SEED));
  await page.goto(`/checkout?cook=${KITCHEN_ID}`);
  const pay = page.getByRole('button', { name: /^Continue to secure payment/ });
  await expect(pay).toBeVisible();
  await expect(pay).toBeEnabled();
  const before = page.url();

  await pay.click();
  const dialog = sheet(page);
  await expect(dialog).toBeVisible();
  expect(page.url()).toBe(before);
  expect(mocks.calls['fn:create-order'] ?? 0).toBe(0);

  await dialog.getByLabel('Email address').fill(TEST_EMAIL);
  await dialog.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
  await dialog.getByRole('button', { name: /^Sign in/ }).click();
  await expect(dialog.getByText('You are signed in.')).toBeVisible();
  await expect(dialog).toHaveCount(0);

  // Money never moves on resume: Pay is enabled again and create-order was not called.
  await expect(pay).toBeEnabled();
  await page.waitForTimeout(1500);
  expect(mocks.calls['fn:create-order'] ?? 0).toBe(0);
  expect(page.url()).toBe(before);

  await pay.click();
  await expect.poll(() => mocks.calls['fn:create-order'] ?? 0).toBe(1);
  await expect(page).toHaveURL(/\/track\?/);
  await page.waitForTimeout(800);
  expect(mocks.calls['fn:create-order']).toBe(1);
});
