/**
 * Theme E2E tests.
 *
 * Covers: default dark theme, toggling dark ↔ light,
 * persistence after reload, and CSS class verification.
 */

import { SELECTORS, TIMEOUTS, UI_TEXTS } from '../fixtures/test-data';
import { expect, setupThemeTest, test } from '../fixtures/test-setup';
import { SessionSidebar } from '../page-objects/SessionSidebar';
import { SettingsView } from '../page-objects/SettingsView';

test.describe('Theme', () => {
  test('default theme is dark', async ({ page }) => {
    const theme = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme') || 'dark';
    });
    expect(theme).toBe('dark');
  });

  test('can switch to light theme from settings', async ({ page }) => {
    const sidebar = new SessionSidebar(page);
    const settings = new SettingsView(page);

    await sidebar.navigateTo('settings');

    // Expand Appearance section if needed
    try {
      await settings.expandSection(UI_TEXTS.settings.appearance);
    } catch {
      /* may already be expanded */
    }

    await settings.toggleTheme();
    await page.waitForTimeout(300);

    const theme = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme');
    });
    expect(theme).toBe('light');
  });

  test('can switch back to dark theme', async ({ page }) => {
    const sidebar = new SessionSidebar(page);
    const settings = new SettingsView(page);

    await sidebar.navigateTo('settings');
    try {
      await settings.expandSection(UI_TEXTS.settings.appearance);
    } catch {
      /* may already be expanded */
    }

    // Toggle to light
    await settings.toggleTheme();
    await page.waitForTimeout(200);

    // Toggle back to dark
    await settings.toggleTheme();
    await page.waitForTimeout(200);

    const theme = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme');
    });
    expect(theme).toBe('dark');
  });

  test('theme persists after page reload', async ({ page }) => {
    const sidebar = new SessionSidebar(page);
    const settings = new SettingsView(page);

    await sidebar.navigateTo('settings');
    try {
      await settings.expandSection(UI_TEXTS.settings.appearance);
    } catch {
      /* may already be expanded */
    }

    // Switch to light
    await settings.toggleTheme();
    await page.waitForTimeout(300);

    // Reload page
    await page.reload();
    await page.waitForSelector(SELECTORS.sidebar.container, {
      state: 'visible',
      timeout: TIMEOUTS.long,
    });

    const themeAfterReload = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme') || 'dark';
    });
    // Should persist as light (via localStorage)
    expect(themeAfterReload).toBe('light');
  });

  test('fresh localStorage defaults to dark theme', async ({ page }) => {
    const _stream = await setupThemeTest(page);
    // setupThemeTest clears localStorage before loading

    const theme = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme') || 'dark';
    });
    expect(theme).toBe('dark');
  });

  test('body has correct class for dark theme', async ({ page }) => {
    const hasDarkClass = await page.evaluate(() => {
      const html = document.documentElement;
      return html.classList.contains('dark') || html.getAttribute('data-theme') === 'dark';
    });
    expect(hasDarkClass).toBe(true);
  });
});
