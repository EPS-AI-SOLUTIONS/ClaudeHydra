import { expect, test } from '@playwright/test';

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

  test('should have correct page structure', async ({ page }) => {
    // Verify main app container exists
    const app = page.locator('#app');
    await expect(app).toBeVisible();

    // Verify all required sections are present
    await expect(page.locator('h3')).toBeVisible();
    await expect(page.locator('#status-indicator')).toBeVisible();
    await expect(page.locator('#cpu-val')).toBeVisible();
    await expect(page.locator('#ram-val')).toBeVisible();
  });

  test('should have dark theme styling', async ({ page }) => {
    const body = page.locator('body');
    // Check that dark theme is applied
    await expect(body).toHaveCSS('background-color', 'rgb(10, 31, 10)');
  });
});

test.describe('HYDRA API Endpoints', () => {
  test('health endpoint should return status ok', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.status).toBe('ok');
    expect(data.version).toBeDefined();
    expect(data.uptime).toBeDefined();
  });

  test('status endpoint should return provider info', async ({ request }) => {
    const response = await request.get('/api/status');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.providers).toBeInstanceOf(Array);
    expect(data.activeProvider).toBeDefined();
    expect(data.models).toBeInstanceOf(Array);
  });

  test('unknown endpoint should return 404', async ({ request }) => {
    const response = await request.get('/api/unknown');
    expect(response.status()).toBe(404);

    const data = await response.json();
    expect(data.error).toBe('Not found');
  });
});

test.describe('HYDRA Dashboard Responsiveness', () => {
  test('should be visible on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#status-indicator')).toBeVisible();
  });

  test('should be visible on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');

    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#resourceChart')).toBeVisible();
  });

  test('should be visible on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');

    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#terminal-container')).toBeVisible();
  });
});
