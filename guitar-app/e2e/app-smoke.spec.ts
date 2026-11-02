import { expect, test } from '@playwright/test';

test.describe('Guitar Companion smoke tests', () => {
  test('loads the home page', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Guitar Companion' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Song Sheets/ }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Grips/ }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Playing Patterns/ }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Metronome/ }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Tuner/ }).first()).toBeVisible();
  });

  test('opens primary workflow pages from the main navigation', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('link', { name: /Song Sheets/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Song Sheets' })).toBeVisible();

    await page.getByRole('link', { name: /Grips/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Grips' })).toBeVisible();

    await page.getByRole('link', { name: /Playing Patterns/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Playing Patterns' })).toBeVisible();

    await page.getByRole('link', { name: /Metronome/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Metronome' })).toBeVisible();

    await page.getByRole('link', { name: /Tuner/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Tuner' })).toBeVisible();
  });
});
