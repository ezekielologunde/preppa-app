import { test, expect, sheet, followButton, focusInDialog, storePath } from '../support/fixtures';

test.describe('sign-in sheet basics on Follow', () => {
  test.beforeEach(async ({ page, mocks }) => {
    void mocks;
    await page.goto(storePath);
  });

  test('guest tap opens a labelled modal dialog, keeps the URL and moves focus inside', async ({ page }) => {
    const btn = await followButton(page);
    const before = page.url();
    await btn.click();
    const dialog = sheet(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAccessibleName(/\S/);
    expect(page.url()).toBe(before);
    await expect.poll(() => focusInDialog(page)).toBe(true);
  });

  for (const how of ['Escape', 'Not now'] as const) {
    test(`${how} closes the sheet, changes nothing and returns focus to Follow`, async ({ page, mocks }) => {
      const btn = await followButton(page);
      await btn.focus();
      await btn.press('Enter');
      const dialog = sheet(page);
      await expect(dialog).toBeVisible();
      if (how === 'Escape') await page.keyboard.press('Escape');
      else await dialog.getByRole('button', { name: 'Not now', exact: true }).filter({ hasText: /^Not now$/ }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Follow', exact: true })).toBeVisible();
      expect(mocks.calls['rpc:toggle_follow'] ?? 0).toBe(0);
      await expect.poll(() => page.evaluate(() => document.activeElement?.textContent ?? '')).toBe('Follow');
    });
  }

  test('Tab stays inside the dialog', async ({ page }) => {
    await (await followButton(page)).click();
    await expect(sheet(page)).toBeVisible();
    await expect.poll(() => focusInDialog(page)).toBe(true);
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      expect(await focusInDialog(page), `focus left the dialog after Tab ${i + 1}`).toBe(true);
    }
  });
});
