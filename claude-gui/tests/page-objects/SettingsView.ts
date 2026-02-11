/**
 * SettingsView — page object for the Settings view.
 *
 * ClaudeHydra uses a full settings view (not a modal like GeminiHydra).
 * Wraps settings interactions: working dir, CLI path, theme toggle,
 * API keys, collapsible sections, and persistence.
 */

import { expect } from '@playwright/test';
import { NAV_LABELS, SELECTORS } from '../fixtures/test-data';
import { BasePage } from './BasePage';

export class SettingsView extends BasePage {
  // ── Navigation ──────────────────────────────────────────────────────────────

  /**
   * Navigate to the Settings view via sidebar.
   */
  async navigateToSettings(): Promise<void> {
    await this.page.locator(SELECTORS.sidebar.navItem, { hasText: NAV_LABELS.settings }).click();
    await this.waitForText('Settings');
  }

  /**
   * Assert the settings heading is visible.
   */
  async assertHeadingVisible(): Promise<void> {
    await expect(this.page.locator(SELECTORS.settings.heading)).toBeVisible();
  }

  // ── General Settings ────────────────────────────────────────────────────────

  /**
   * Set the working directory path.
   */
  async setWorkingDir(path: string): Promise<void> {
    await this.page.locator(SELECTORS.settings.workingDirInput).first().fill(path);
  }

  /**
   * Get the current working directory value.
   */
  async getWorkingDir(): Promise<string> {
    return this.page.locator(SELECTORS.settings.workingDirInput).first().inputValue();
  }

  /**
   * Set the CLI path.
   */
  async setCliPath(path: string): Promise<void> {
    await this.page.locator(SELECTORS.settings.cliPathInput).first().fill(path);
  }

  /**
   * Get the current CLI path value.
   */
  async getCliPath(): Promise<string> {
    return this.page.locator(SELECTORS.settings.cliPathInput).first().inputValue();
  }

  // ── Theme ───────────────────────────────────────────────────────────────────

  /**
   * Toggle the theme (dark ↔ light).
   */
  async toggleTheme(): Promise<void> {
    await this.page.locator(SELECTORS.settings.themeToggle).click();
  }

  /**
   * Get the current theme name from the data-theme attribute.
   */
  async getTheme(): Promise<string> {
    return this.getCurrentTheme();
  }

  /**
   * Assert the current theme is dark.
   */
  async assertDarkTheme(): Promise<void> {
    const theme = await this.getTheme();
    expect(theme).toBe('dark');
  }

  /**
   * Assert the current theme is light.
   */
  async assertLightTheme(): Promise<void> {
    const theme = await this.getTheme();
    expect(theme).toBe('light');
  }

  // ── API Endpoints ───────────────────────────────────────────────────────────

  /**
   * Set the Ollama URL.
   */
  async setOllamaUrl(url: string): Promise<void> {
    await this.page.locator(SELECTORS.settings.ollamaUrlInput).first().fill(url);
  }

  /**
   * Get the current Ollama URL value.
   */
  async getOllamaUrl(): Promise<string> {
    return this.page.locator(SELECTORS.settings.ollamaUrlInput).first().inputValue();
  }

  /**
   * Set the Anthropic API URL.
   */
  async setAnthropicUrl(url: string): Promise<void> {
    await this.page.locator(SELECTORS.settings.anthropicUrlInput).first().fill(url);
  }

  // ── API Keys ────────────────────────────────────────────────────────────────

  /**
   * Set an API key by provider.
   */
  async setApiKey(provider: 'anthropic' | 'openai' | 'google', key: string): Promise<void> {
    const selMap = {
      anthropic: SELECTORS.settings.apiKeyAnthropicInput,
      openai: SELECTORS.settings.apiKeyOpenaiInput,
      google: SELECTORS.settings.apiKeyGoogleInput,
    };
    await this.page.locator(selMap[provider]).first().fill(key);
  }

  /**
   * Get an API key value (may be masked).
   */
  async getApiKeyValue(provider: 'anthropic' | 'openai' | 'google'): Promise<string> {
    const selMap = {
      anthropic: SELECTORS.settings.apiKeyAnthropicInput,
      openai: SELECTORS.settings.apiKeyOpenaiInput,
      google: SELECTORS.settings.apiKeyGoogleInput,
    };
    return this.page.locator(selMap[provider]).first().inputValue();
  }

  /**
   * Check if an API key input has type="password" (masked).
   */
  async isApiKeyMasked(provider: 'anthropic' | 'openai' | 'google'): Promise<boolean> {
    const selMap = {
      anthropic: SELECTORS.settings.apiKeyAnthropicInput,
      openai: SELECTORS.settings.apiKeyOpenaiInput,
      google: SELECTORS.settings.apiKeyGoogleInput,
    };
    const type = await this.page.locator(selMap[provider]).first().getAttribute('type');
    return type === 'password';
  }

  // ── Collapsible Sections ────────────────────────────────────────────────────

  /**
   * Expand a collapsible section by clicking its header.
   */
  async expandSection(title: string): Promise<void> {
    const section = this.page.locator('button', { hasText: title }).first();
    // Only click if not already expanded (chevron rotated)
    await section.click();
    await this.page.waitForTimeout(200);
  }

  /**
   * Collapse a section by clicking its header.
   */
  async collapseSection(title: string): Promise<void> {
    await this.expandSection(title); // toggle
  }

  /**
   * Check if a collapsible section's content is visible.
   */
  async isSectionExpanded(title: string): Promise<boolean> {
    const header = this.page.locator('button', { hasText: title }).first();
    // After the button, the content div should be visible
    const sibling = header.locator('~ div').first();
    return sibling.isVisible();
  }

  // ── About ───────────────────────────────────────────────────────────────────

  /**
   * Assert the version string is visible.
   */
  async assertVersionVisible(): Promise<void> {
    await expect(this.page.locator(SELECTORS.settings.aboutVersion)).toBeVisible();
  }

  // ── Persistence ─────────────────────────────────────────────────────────────

  /**
   * Get all settings from localStorage (claude-hydra-settings key).
   */
  async getPersistedSettings(): Promise<Record<string, unknown> | null> {
    return this.page.evaluate(() => {
      const raw = localStorage.getItem('claude-hydra-settings');
      return raw ? JSON.parse(raw) : null;
    });
  }
}
