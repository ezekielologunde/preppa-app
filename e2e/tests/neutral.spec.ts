import { test, expect, sheet, followButton, storePath } from '../support/fixtures';
import type { Page } from '@playwright/test';
import { TEST_EMAIL, TEST_PASSWORD } from '../support/mocks';

const NEUTRAL = 'If this email is new, we have sent next steps.';
const TERMS_URL = 'https://help.preppa.live/legal/terms';
const PRIVACY_URL = 'https://help.preppa.live/legal/privacy';

async function openSheet(page: Page) {
  // Record window.open instead of opening a real tab (a popup would leave the mocked page).
  await page.addInitScript(() => {
    (window as unknown as { __opened: unknown[][] }).__opened = [];
    window.open = (...args: unknown[]) => { (window as unknown as { __opened: unknown[][] }).__opened.push(args); return null; };
  });
  await page.goto(storePath);
  await (await followButton(page)).click();
  await expect(sheet(page)).toBeVisible();
  return sheet(page);
}

/** Samples the computed transform of the form block every frame for `ms`; returns the distinct values. */
function sampleTransforms(page: Page, ms: number): Promise<string[]> {
  return page.evaluate((dur) => new Promise<string[]>((resolve) => {
    const input = document.querySelector('[role="dialog"] input[aria-label="Email address"]');
    const seen = new Set<string>();
    const t0 = performance.now();
    const tick = () => {
      for (let el = input?.parentElement; el && !el.matches('[role="dialog"]'); el = el.parentElement) {
        const tr = getComputedStyle(el).transform;
        if (tr && tr !== 'none') seen.add(tr);
      }
      if (performance.now() - t0 < dur) requestAnimationFrame(tick); else resolve([...seen]);
    };
    tick();
  }), ms);
}

test('duplicate-email sign-up shows the neutral notice: not red, no shake, no error alert', async ({ page, mocks }) => {
  const dialog = await openSheet(page);
  await dialog.getByRole('button', { name: 'New here? Create an account' }).click();
  await dialog.getByLabel('Your name').fill('Test Person');
  const email = dialog.getByLabel('Email address');
  await email.fill(TEST_EMAIL);
  await dialog.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
  const borderBefore = await email.evaluate((el) => getComputedStyle(el).borderColor);

  await dialog.getByRole('button', { name: /^Create account/ }).click();
  const transforms = sampleTransforms(page, 900);
  // The visible notice (the visually hidden aria-live copy is checked separately).
  const note = dialog.getByText(NEUTRAL, { exact: true }).and(page.locator(':not([aria-live] *)'));
  await expect(note).toBeVisible();
  expect(mocks.calls['auth:signup']).toBe(1);
  // The live region carries the notice, never an error.
  await expect(page.locator('[aria-live="assertive"]')).toHaveText(NEUTRAL);

  // Green info, not the red error: the text is green-dominant and the field border is unchanged.
  const [r, g] = (await note.evaluate((el) => getComputedStyle(el).color)).match(/\d+/g)!.map(Number);
  expect(g, 'notice colour is green-dominant').toBeGreaterThan(r);
  expect(await email.evaluate((el) => getComputedStyle(el).borderColor)).toBe(borderBefore);
  expect((await transforms).filter((tr) => !/^matrix\(1, 0, 0, 1, 0, 0\)$/.test(tr)), 'no shake').toEqual([]);
  // Nothing that reads as "this account exists".
  await expect(dialog.getByText(/already|Couldn.t create/i)).toHaveCount(0);
  // Still on the create-account step, nothing signed in.
  await expect(dialog.getByRole('button', { name: /^Create account/ })).toBeVisible();
  expect(mocks.signedIn).toBe(false);
});

for (const shape of ['signupsNotAllowed', 'notFound'] as const) {
  test(`password recovery for an unknown email (${shape}) advances exactly like a known one`, async ({ page, mocks }) => {
    mocks.unknownOtpError = shape;
    const steps: string[] = [];
    for (const addr of [TEST_EMAIL, 'nobody-here@example.com']) {
      const dialog = await openSheet(page);
      await dialog.getByRole('button', { name: 'Forgot password?' }).click();
      await dialog.getByLabel('Email address').fill(addr);
      await dialog.getByLabel('New password').fill(TEST_PASSWORD);
      await dialog.getByRole('button', { name: /^Send recovery code/ }).click();
      const code = dialog.getByLabel('Six digit verification code');
      await expect(code).toBeVisible();
      await expect(dialog.getByText(/Couldn.t send|no account|not found/i)).toHaveCount(0);
      steps.push((await dialog.innerText()).replace(addr, '<email>'));
      await page.keyboard.press('Escape');
    }
    expect(mocks.calls['auth:otp']).toBe(2);
    expect(steps[1], 'unknown-email screen matches the known-email screen').toBe(steps[0]);
  });
}

test('consent flag off: the "By continuing" notice links Terms and Privacy Policy and a tap changes nothing else', async ({ page, mocks }) => {
  const dialog = await openSheet(page);
  await dialog.getByRole('button', { name: 'New here? Create an account' }).click();
  await expect(dialog.getByText('By continuing you agree to the', { exact: false })).toBeVisible();
  await expect(dialog.getByRole('checkbox')).toHaveCount(0);
  await dialog.getByLabel('Your name').fill('Test Person');
  await dialog.getByLabel('Email address').fill(TEST_EMAIL);
  const url = page.url();

  for (const [name, href] of [['Terms', TERMS_URL], ['Privacy Policy', PRIVACY_URL]] as const) {
    const link = dialog.getByRole('link', { name, exact: true });
    await expect(link).toBeVisible();
    await link.click();
    const opened = await page.evaluate(() => (window as unknown as { __opened: unknown[][] }).__opened.slice(-1)[0]);
    expect(opened?.[0]).toBe(href);
    expect(opened?.[1]).toBe('_blank');
    expect(String(opened?.[2] ?? '')).toContain('noopener');
  }
  // The tap changed nothing else: same step, fields kept, URL unchanged, no auth call.
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Your name')).toHaveValue('Test Person');
  await expect(dialog.getByLabel('Email address')).toHaveValue(TEST_EMAIL);
  expect(page.url()).toBe(url);
  expect(mocks.calls['auth:signup'] ?? 0).toBe(0);
  expect(Object.keys(mocks.calls).filter((k) => k.startsWith('auth:token'))).toEqual([]);
});
