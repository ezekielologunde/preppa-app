import { test, expect, sheet, followButton, storePath } from '../support/fixtures';
import { TEST_EMAIL, TEST_PASSWORD, GOOD_CODE } from '../support/mocks';

const CODE_ERROR = "That code didn't match or has expired. Request a new one.";

test.describe('sign in from Follow, then resume', () => {
  test.beforeEach(async ({ page, mocks }) => {
    void mocks;
    await page.goto(storePath);
    await (await followButton(page)).click();
    await expect(sheet(page)).toBeVisible();
  });

  test('password sign-in shows success, closes, then Follow runs once', async ({ page, mocks }) => {
    const dialog = sheet(page);
    await dialog.getByLabel('Email address').fill(TEST_EMAIL);
    await dialog.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
    await dialog.getByRole('button', { name: /^Sign in/ }).click();
    await expect(dialog.getByText('You are signed in.')).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Following', exact: true })).toBeVisible();
    expect(mocks.calls['rpc:toggle_follow']).toBe(1);
    await page.waitForTimeout(1200);
    await expect(sheet(page)).toHaveCount(0);
  });

  test('wrong code shows the alert copy and clears the field; a good code signs in and Follow runs', async ({ page, mocks }) => {
    const dialog = sheet(page);
    await dialog.getByLabel('Email address').fill(TEST_EMAIL);
    await dialog.getByRole('button', { name: 'Email me a sign-in code instead' }).click();
    const code = dialog.getByLabel('Six digit verification code');
    await expect(code).toBeVisible();
    expect(mocks.calls['auth:otp']).toBe(1);

    await code.fill('000000');
    await expect(page.locator('[aria-live="assertive"]')).toHaveText(CODE_ERROR);
    await expect(dialog.getByText(CODE_ERROR).first()).toBeVisible();
    await expect(code).toHaveValue('');
    expect(mocks.calls['rpc:toggle_follow'] ?? 0).toBe(0);

    await code.fill(GOOD_CODE);
    await expect(dialog.getByText('You are signed in.')).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Following', exact: true })).toBeVisible();
    expect(mocks.calls['rpc:toggle_follow']).toBe(1);
    await page.waitForTimeout(1200);
    await expect(sheet(page)).toHaveCount(0);
  });
});
