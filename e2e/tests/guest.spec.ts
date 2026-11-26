import { test, expect, followButton, storePath } from '../support/fixtures';

const GATED: Array<[string, RegExp]> = [
  ['/orders', /Sign in to see your orders/],
  ['/messages', /Sign in to see your messages/],
  ['/notifications', /Sign in to see your alerts/],
  ['/saved', /Sign in to see saved posts/],
];

for (const [path, heading] of GATED) {
  test(`guest sees the empty state on ${path}`, async ({ page, mocks }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    expect(mocks.calls['fn:create-order'] ?? 0).toBe(0);
  });
}

test('guest profile shows the sign-in card and keeps Help, Privacy and Terms', async ({ page }) => {
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByText('Help center')).toBeVisible();
  await expect(page.getByText('Privacy policy')).toBeVisible();
  await expect(page.getByText('Terms of service')).toBeVisible();
});

test('public kitchen store page has no guest gate', async ({ page }) => {
  await page.goto(storePath);
  await followButton(page);
  await expect(page.getByRole('heading', { name: /^Sign in to/ })).toHaveCount(0);
});
