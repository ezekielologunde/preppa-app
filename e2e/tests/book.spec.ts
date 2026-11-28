import { test, expect, sheet } from '../support/fixtures';
import { EXPERIENCE_ID, SESSION_SEATS_LEFT, TEST_EMAIL, TEST_PASSWORD, THREAD_ID } from '../support/mocks';
import type { Locator, Page } from '@playwright/test';

const experiencePath = `/experience/${EXPERIENCE_ID}`;

async function signInWithPassword(page: Page, dialog: Locator) {
  await dialog.getByLabel('Email address').fill(TEST_EMAIL);
  await dialog.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
  await dialog.getByRole('button', { name: /^Sign in/ }).click();
  await expect(dialog.getByText('You are signed in.')).toBeVisible();
  await expect(dialog).toHaveCount(0);
}

test('Book as a guest opens the sheet; after sign-in nothing is booked until Book is tapped again', async ({ page, mocks }) => {
  await page.goto(experiencePath);
  await expect(page.getByText('Fixture Jollof Class')).toBeVisible();
  // Pick the one open session; the dock button turns into Book.
  await page.getByRole('button', { name: new RegExp(`${SESSION_SEATS_LEFT} left`) }).click();
  const book = page.getByRole('button', { name: /^Book · / });
  await expect(book).toBeVisible();
  await expect(book).toBeEnabled();
  const before = page.url();

  await book.click();
  const dialog = sheet(page);
  await expect(dialog).toBeVisible();
  expect(page.url()).toBe(before);
  expect(mocks.calls['fn:book-experience'] ?? 0).toBe(0);

  await signInWithPassword(page, dialog);

  // Money never moves on resume: Book is enabled again and book-experience was not called.
  await expect(book).toBeEnabled();
  await page.waitForTimeout(1500);
  expect(mocks.calls['fn:book-experience'] ?? 0).toBe(0);
  expect(page.url()).toBe(before);

  await book.click();
  await expect.poll(() => mocks.calls['fn:book-experience'] ?? 0).toBe(1);
  // alreadyPaid: the screen confirms and replaces itself with the bookings list (no card sheet).
  await expect(page).toHaveURL(/\/orders$/);
  await page.waitForTimeout(800);
  expect(mocks.calls['fn:book-experience']).toBe(1);
});

test('Message the host as a guest opens the sheet; after sign-in the thread opens exactly once', async ({ page, mocks }) => {
  await page.goto(experiencePath);
  const message = page.getByRole('button', { name: 'Message the host' });
  await expect(message).toBeVisible();
  const before = page.url();

  await message.click();
  const dialog = sheet(page);
  await expect(dialog).toBeVisible();
  expect(page.url()).toBe(before);
  expect(mocks.calls['rpc:open_thread'] ?? 0).toBe(0);

  await signInWithPassword(page, dialog);

  // openThread is idempotent, so it resumes by itself: one call, then the thread.
  await expect(page).toHaveURL(new RegExp(`/messages/${THREAD_ID}$`));
  await page.waitForTimeout(800);
  expect(mocks.calls['rpc:open_thread']).toBe(1);
});
