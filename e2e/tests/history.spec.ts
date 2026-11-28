import { test, expect, sheet, followButton, storePath } from '../support/fixtures';
import { TEST_EMAIL } from '../support/mocks';

test('browser Back while the sheet is open dismisses it and runs nothing', async ({ page, mocks }) => {
  await page.goto(storePath);
  await followButton(page);
  // A same-path history entry, so Back fires popstate without a route change: only the host's
  // popstate listener can close the sheet here.
  await page.evaluate(() => history.pushState(history.state, '', location.href));
  await (await followButton(page)).click();
  const dialog = sheet(page);
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Email address').fill(TEST_EMAIL);

  await page.goBack();
  await expect(dialog).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe(storePath);
  await expect(page.getByRole('button', { name: 'Follow', exact: true })).toBeVisible();
  expect(mocks.calls['rpc:toggle_follow'] ?? 0).toBe(0);
  // Not stuck: the next tap opens a fresh sheet.
  await (await followButton(page)).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Email address')).toHaveValue('');
});

test('reload while the sheet is open leaves a guest with no sheet and no stuck state', async ({ page, mocks }) => {
  await page.goto(storePath);
  await (await followButton(page)).click();
  const dialog = sheet(page);
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Email address').fill(TEST_EMAIL);

  await page.reload();
  const btn = await followButton(page);
  await expect(btn).toHaveText('Follow');
  await page.waitForTimeout(1000);
  await expect(dialog).toHaveCount(0);
  expect(mocks.calls['rpc:toggle_follow'] ?? 0).toBe(0);
  expect(mocks.signedIn).toBe(false);
  // Not stuck: Follow opens a fresh sheet and Not now closes it.
  await btn.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Email address')).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(mocks.calls['rpc:toggle_follow'] ?? 0).toBe(0);
});
