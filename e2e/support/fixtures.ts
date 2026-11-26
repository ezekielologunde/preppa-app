// Test fixture: every test gets the mocks installed before the first navigation, and fails
// afterwards if any request tried to reach a host outside the allow-list (gate G5).
import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { installMocks, KITCHEN_ID, type MockState } from './mocks';

export const PORT = Number(process.env.E2E_PORT || 4173);

export const test = base.extend<{ mocks: MockState }>({
  mocks: [async ({ page }, use) => {
    const state = await installMocks(page, { port: PORT });
    await use(state);
    expect(state.blocked, 'requests to hosts outside the allow-list').toEqual([]);
  }, { auto: true }],
});
export { expect };

export const storePath = `/store/${KITCHEN_ID}`;

/** The sign-in sheet (react-native-web renders the Modal as role=dialog). */
export const sheet = (page: Page): Locator => page.getByRole('dialog');

/** The Follow button on the kitchen store page, once the follow status has loaded. */
export async function followButton(page: Page): Promise<Locator> {
  const btn = page.getByRole('button', { name: /^(Follow|Following)$/ });
  await expect(btn).toBeVisible();
  await expect(btn).toBeEnabled();
  return btn;
}

/** True when document.activeElement is inside the open dialog. */
export function focusInDialog(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    return !!d && !!document.activeElement && d.contains(document.activeElement);
  });
}
