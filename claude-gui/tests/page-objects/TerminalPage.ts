/**
 * TerminalPage — page object for the Terminal view.
 *
 * Wraps terminal-specific interactions: input, output lines,
 * streaming, direct IPC test, and clear.
 */

import { expect } from '@playwright/test';
import { NAV_LABELS, SELECTORS, TIMEOUTS } from '../fixtures/test-data';
import { BasePage } from './BasePage';

export class TerminalPage extends BasePage {
  // ── Navigation ──────────────────────────────────────────────────────────────

  /**
   * Navigate to Terminal view via sidebar.
   */
  async navigateToTerminal(): Promise<void> {
    await this.page.locator(SELECTORS.sidebar.navItem, { hasText: NAV_LABELS.terminal }).click();
    await this.waitForSelector(SELECTORS.terminal.container);
  }

  // ── Input ───────────────────────────────────────────────────────────────────

  /**
   * Type a message in the terminal input and submit.
   */
  async sendInput(text: string): Promise<void> {
    const input = this.page.locator(SELECTORS.terminal.input).first();
    await input.fill(text);
    await this.page.locator(SELECTORS.terminal.sendBtn).click();
  }

  /**
   * Type a message and submit with Enter key.
   */
  async sendInputWithEnter(text: string): Promise<void> {
    const input = this.page.locator(SELECTORS.terminal.input).first();
    await input.fill(text);
    await input.press('Enter');
  }

  /**
   * Check whether the terminal input is enabled.
   */
  async isInputEnabled(): Promise<boolean> {
    return this.page.locator(SELECTORS.terminal.input).first().isEnabled();
  }

  /**
   * Get the terminal input's placeholder text.
   */
  async getInputPlaceholder(): Promise<string> {
    const attr = await this.page
      .locator(SELECTORS.terminal.input)
      .first()
      .getAttribute('placeholder');
    return attr ?? '';
  }

  /**
   * Get the current value of the terminal input.
   */
  async getInputValue(): Promise<string> {
    return this.page.locator(SELECTORS.terminal.input).first().inputValue();
  }

  // ── Output ──────────────────────────────────────────────────────────────────

  /**
   * Get all output line texts from the terminal container.
   */
  async getOutputLines(): Promise<string[]> {
    const lines = this.page.locator(SELECTORS.terminal.outputLine);
    const count = await lines.count();
    if (count === 0) return [];

    const texts: string[] = [];
    for (let i = 0; i < count; i++) {
      texts.push(await lines.nth(i).innerText());
    }
    return texts;
  }

  /**
   * Get the last output line text.
   */
  async getLastOutputLine(): Promise<string> {
    const lines = await this.getOutputLines();
    return lines.length > 0 ? lines[lines.length - 1] : '';
  }

  /**
   * Get the number of output lines.
   */
  async getOutputLineCount(): Promise<number> {
    return this.page.locator(SELECTORS.terminal.outputLine).count();
  }

  /**
   * Wait for a specific text to appear in any output line.
   */
  async waitForOutputLine(text: string, timeout = TIMEOUTS.medium): Promise<void> {
    await this.page.locator(SELECTORS.terminal.container).locator(`text=${text}`).first().waitFor({
      state: 'visible',
      timeout,
    });
  }

  /**
   * Assert that the output contains a specific text.
   */
  async assertOutputContains(text: string): Promise<void> {
    const lines = await this.getOutputLines();
    const found = lines.some((line) => line.includes(text));
    expect(found, `Expected terminal output to contain "${text}"`).toBeTruthy();
  }

  /**
   * Assert the terminal shows the empty state.
   */
  async assertEmptyState(): Promise<void> {
    await expect(this.page.locator(SELECTORS.terminal.emptyState)).toBeVisible();
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  /**
   * Click the clear output button.
   */
  async clearOutput(): Promise<void> {
    await this.page.locator(SELECTORS.terminal.clearBtn).click();
  }

  /**
   * Click the Direct IPC Test button.
   */
  async clickDirectTest(): Promise<void> {
    await this.page.locator(SELECTORS.terminal.directTestBtn).click();
  }

  // ── Output Line Type ────────────────────────────────────────────────────────

  /**
   * Check if the terminal container is scrolled to the bottom.
   */
  async isScrolledToBottom(): Promise<boolean> {
    return this.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return true;
      return Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight) < 5;
    }, SELECTORS.terminal.container);
  }
}
