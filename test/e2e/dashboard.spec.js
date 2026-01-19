import { test, expect } from '@playwright/test';

test.describe('HYDRA Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load the dashboard title', async ({ page }) => {
    await expect(page).toHaveTitle(/HYDRA Command Center/);
    await expect(page.locator('h3').first()).toContainText('HYDRA Status');
  });

  test('should display system status (Online)', async ({ page }) => {
    const statusIndicator = page.locator('#status-indicator');
    await expect(statusIndicator).toBeVisible();
    await expect(statusIndicator).toContainText('Online');
  });

  test('should display system metrics', async ({ page }) => {
    await expect(page.locator('#cpu-val')).toContainText('%');
    await expect(page.locator('#ram-val')).toContainText('GB');
  });

  test('should display chart canvas', async ({ page }) => {
    await expect(page.locator('#resourceChart')).toBeVisible();
  });

  test('should display audit logs in terminal', async ({ page }) => {
    const terminal = page.locator('#terminal-container');
    await expect(terminal).toBeVisible();
    // Check for mock log content (might take a second to render in xterm)
    await expect(page.locator('.xterm-rows')).toContainText('Test warning log');
  });
});