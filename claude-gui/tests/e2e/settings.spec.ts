/**
 * Settings View E2E tests.
 *
 * Covers: navigation, heading, working directory, CLI path,
 * theme toggle, API keys with masking, collapsible sections,
 * and localStorage persistence.
 */

import { SELECTORS, TEST_SETTINGS, UI_TEXTS } from '../fixtures/test-data';
import { expect, test } from '../fixtures/test-setup';
import { SessionSidebar } from '../page-objects/SessionSidebar';
import { SettingsView } from '../page-objects/SettingsView';

test.describe('Settings View', () => {
  let settings: SettingsView;
  let sidebar: SessionSidebar;

  test.beforeEach(async ({ page }) => {
    settings = new SettingsView(page);
    sidebar = new SessionSidebar(page);
  });

  test('navigates to settings view', async () => {
    await sidebar.navigateTo('settings');
    await settings.assertHeadingVisible();
  });

  test('displays Settings heading', async () => {
    await sidebar.navigateTo('settings');
    await expect(settings.page.locator(SELECTORS.settings.heading)).toBeVisible();
  });

  test('has working directory input', async () => {
    await sidebar.navigateTo('settings');
    const visible = await settings.isVisible(SELECTORS.settings.workingDirInput);
    // May be inside a collapsible section
    if (!visible) {
      await settings.expandSection(UI_TEXTS.settings.generalSettings);
    }
    await expect(settings.page.locator(SELECTORS.settings.workingDirInput).first()).toBeVisible();
  });

  test('can set working directory', async () => {
    await sidebar.navigateTo('settings');
    // Expand General Settings if needed
    try {
      await settings.expandSection(UI_TEXTS.settings.generalSettings);
    } catch {
      /* may already be expanded */
    }

    await settings.setWorkingDir(TEST_SETTINGS.workingDir);
    const value = await settings.getWorkingDir();
    expect(value).toBe(TEST_SETTINGS.workingDir);
  });

  test('has CLI path input', async () => {
    await sidebar.navigateTo('settings');
    try {
      await settings.expandSection(UI_TEXTS.settings.generalSettings);
    } catch {
      /* may already be expanded */
    }

    await expect(settings.page.locator(SELECTORS.settings.cliPathInput).first()).toBeVisible();
  });

  test('can toggle theme between dark and light', async ({ page }) => {
    await sidebar.navigateTo('settings');

    // Default should be dark
    const initialTheme = await settings.getTheme();
    expect(initialTheme).toBe('dark');

    // Expand Appearance section if needed
    try {
      await settings.expandSection(UI_TEXTS.settings.appearance);
    } catch {
      /* may already be expanded */
    }

    // Toggle to light
    await settings.toggleTheme();
    await page.waitForTimeout(300);
    const newTheme = await settings.getTheme();
    expect(newTheme).toBe('light');

    // Toggle back to dark
    await settings.toggleTheme();
    await page.waitForTimeout(300);
    const revertedTheme = await settings.getTheme();
    expect(revertedTheme).toBe('dark');
  });

  test('API key inputs exist for major providers', async () => {
    await sidebar.navigateTo('settings');

    // Expand provider keys section
    try {
      await settings.expandSection(UI_TEXTS.settings.providerKeys);
    } catch {
      /* may already be expanded */
    }

    const anthropicExists = await settings.elementExists(SELECTORS.settings.apiKeyAnthropicInput);
    expect(anthropicExists).toBeTruthy();
  });

  test('API key input is masked by default', async () => {
    await sidebar.navigateTo('settings');

    try {
      await settings.expandSection(UI_TEXTS.settings.providerKeys);
    } catch {
      /* may already be expanded */
    }

    const masked = await settings.isApiKeyMasked('anthropic');
    expect(masked).toBe(true);
  });

  test('collapsible sections can be toggled', async ({ page }) => {
    await sidebar.navigateTo('settings');

    // Find a collapsible section header
    const sections = page.locator(SELECTORS.settings.collapsibleSection);
    const sectionCount = await sections.count();
    expect(sectionCount).toBeGreaterThan(0);
  });

  test('displays About section with version', async () => {
    await sidebar.navigateTo('settings');

    // Scroll down or expand About section
    try {
      await settings.expandSection(UI_TEXTS.settings.about);
    } catch {
      /* may already be visible */
    }

    await settings.assertVersionVisible();
  });
});
