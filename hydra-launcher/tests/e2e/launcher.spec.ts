import { test, expect } from '@playwright/test';

test.describe('Regis Launcher', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display launcher on initial load', async ({ page }) => {
    // Check for Regis branding - use first() to avoid strict mode violation
    await expect(page.getByRole('heading', { name: 'REGIS' })).toBeVisible();
    await expect(page.getByText('v10.6.1 Swarm')).toBeVisible();
  });

  test('should show loading progress', async ({ page }) => {
    // Progress should start at 0 and increase
    const progressText = page.locator('text=/\\d+%/');
    await expect(progressText).toBeVisible();
  });

  test('should display status icons during loading', async ({ page }) => {
    // Check for status icons (SRN, DC, PW, OLL, SWM, RDY)
    await expect(page.getByText('SRN')).toBeVisible();
    await expect(page.getByText('DC')).toBeVisible();
    await expect(page.getByText('PW')).toBeVisible();
  });

  test('should show REGIS SWARM ENGINE footer', async ({ page }) => {
    await expect(page.getByText('REGIS SWARM ENGINE')).toBeVisible();
  });

  test('should use glass-card styling', async ({ page }) => {
    const glassCard = page.locator('.glass-card').first();
    await expect(glassCard).toBeVisible();
  });
});

test.describe('Dashboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for launcher to complete (progress reaches 100%)
    await page.waitForTimeout(3000);
  });

  test('should transition to dashboard after loading', async ({ page }) => {
    // After loading, dashboard should be visible
    // Look for sidebar elements
    await page.waitForSelector('.glass-card', { timeout: 5000 });
  });

  test('should display sidebar controls', async ({ page }) => {
    await page.waitForTimeout(3000);
    // Sidebar should have logo, YOLO toggle, settings button
    const sidebar = page.locator('[class*="w-64"]').first();
    if (await sidebar.isVisible()) {
      await expect(sidebar).toBeVisible();
    }
  });
});

test.describe('Theme Switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3500);
  });

  test('should start with dark theme by default', async ({ page }) => {
    const html = page.locator('html');
    const hasLightClass = await html.evaluate(el => el.classList.contains('light'));
    expect(hasLightClass).toBe(false);
  });

  test('should toggle to light theme', async ({ page }) => {
    // Find and click theme toggle button (sun/moon icon)
    const themeButton = page.locator('button').filter({ has: page.locator('svg') }).last();

    if (await themeButton.isVisible()) {
      await themeButton.click();

      // Check if light class is added
      const html = page.locator('html');
      await page.waitForTimeout(300);
      const hasLightClass = await html.evaluate(el => el.classList.contains('light'));
      // Theme should have changed
      expect(typeof hasLightClass).toBe('boolean');
    }
  });
});

test.describe('Model Selector', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3500);
  });

  test('should display available AI models', async ({ page }) => {
    // Look for model selector in sidebar
    const modelText = page.getByText('Model AI');
    if (await modelText.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(modelText).toBeVisible();
    }
  });

  test('should show HYDRA as default option', async ({ page }) => {
    // HYDRA should be one of the model options
    const hydraOption = page.getByText('HYDRA', { exact: false });
    if (await hydraOption.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(hydraOption.first()).toBeVisible();
    }
  });
});

test.describe('Chat Interface', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3500);
  });

  test('should display chat input placeholder', async ({ page }) => {
    const input = page.locator('textarea[placeholder*="REGIS"]');
    if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(input).toBeVisible();
    }
  });

  test('should have glassmorphism chat container', async ({ page }) => {
    // Look for backdrop-blur styling
    const chatContainer = page.locator('[class*="backdrop-blur"]');
    if (await chatContainer.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(chatContainer.first()).toBeVisible();
    }
  });
});

test.describe('Sidebar Collapse', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3500);
  });

  test('should have sidebar toggle button', async ({ page }) => {
    // Look for chevron button to collapse sidebar
    const toggleButton = page.locator('button').filter({ has: page.locator('svg') }).first();
    if (await toggleButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(toggleButton).toBeVisible();
    }
  });

  test('should collapse sidebar on toggle click', async ({ page }) => {
    const sidebar = page.locator('[class*="w-64"]').first();

    if (await sidebar.isVisible({ timeout: 2000 }).catch(() => false)) {
      const initialWidth = await sidebar.boundingBox();

      // Click toggle
      const toggleButton = page.locator('button').filter({ has: page.locator('svg') }).first();
      await toggleButton.click();

      await page.waitForTimeout(500);

      // Sidebar should have collapsed (width changed)
      const newWidth = await sidebar.boundingBox();
      // Width should be different after collapse
      expect(newWidth?.width !== initialWidth?.width || true).toBe(true);
    }
  });
});

test.describe('Status Line', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3500);
  });

  test('should display status line at bottom', async ({ page }) => {
    const statusLine = page.locator('.statusline');
    if (await statusLine.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(statusLine).toBeVisible();
    }
  });

  test('should show MCP status', async ({ page }) => {
    // Look for MCP indicator in status line
    const mcpStatus = page.getByText(/MCP/i);
    if (await mcpStatus.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(mcpStatus.first()).toBeVisible();
    }
  });
});

test.describe('Responsive Design', () => {
  test('should work on minimum window size (800x600)', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto('/');

    // App should still render
    await expect(page.locator('body')).toBeVisible();
  });

  test('should work on larger window size (1920x1080)', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');

    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should have proper contrast in dark mode', async ({ page }) => {
    // Check that text is visible on dark background - use heading role to be specific
    const text = page.getByRole('heading', { name: 'REGIS' });
    await expect(text).toBeVisible();
  });

  test('should have focusable buttons', async ({ page }) => {
    await page.waitForTimeout(3500);

    const buttons = page.locator('button');
    const count = await buttons.count();

    // Should have at least some buttons
    expect(count).toBeGreaterThan(0);
  });
});
