import { test, expect } from '@playwright/test';

test.describe('aim trainer e2e', () => {
  test('menu → game → results flow renders', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Aim Trainer', { exact: false }).first()).toBeVisible();
    // 9 built-in scenarios
    await expect(page.getByText('Gridshot')).toBeVisible();
    await expect(page.getByText('Custom / Sandbox')).toBeVisible();

    // Start gridshot → pointer-lock overlay appears
    await page.getByRole('button', { name: 'start Gridshot' }).click();
    await expect(page.getByText('Click to lock mouse')).toBeVisible();

    // Canvas arena present
    await expect(page.getByLabel('Aim training arena')).toBeVisible();

    // Quit back to menu
    await page.getByText('Quit (ESC)').click();
    await expect(page.getByText('Gridshot')).toBeVisible();
  });

  test('settings + dashboard render', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'settings' }).click();
    await expect(page.getByText('In-game sens')).toBeVisible();
    await page.getByRole('button', { name: 'Back to menu' }).click();
    await page.getByRole('button', { name: 'dashboard' }).click();
    // Fresh profile: empty state (lazy-loaded chunk + Dexie query)
    await expect(page.getByText('No sessions yet')).toBeVisible({ timeout: 15_000 });
  });

  test('sandbox editor validates and starts a custom drill', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'customize sandbox' }).click();
    await expect(page.getByText('Sandbox editor')).toBeVisible();
    await expect(page.getByText('valid scenario')).toBeVisible();
    // Break validation: negative duration is rejected by Zod live.
    await page.getByLabel('duration').fill('-5');
    await expect(page.getByText('Fix the problems above to start.')).toBeVisible();
    await page.getByLabel('duration').fill('30');
    await expect(page.getByText('valid scenario')).toBeVisible();
    // Start → pointer-lock overlay with the custom title.
    await page.getByRole('button', { name: 'start custom drill' }).click();
    await expect(page.getByText('Click to lock mouse')).toBeVisible();
  });
});
