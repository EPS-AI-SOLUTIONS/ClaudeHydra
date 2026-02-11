/**
 * BasePage — foundational page object for all ClaudeHydra E2E tests.
 *
 * Provides common utilities: DOM queries, waits, localStorage,
 * screenshot helpers, Tauri mock interaction, and keyboard shortcuts.
 */

import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { createStreamSimulator, type StreamSimulator } from '../fixtures/stream-simulator';
import {
  clearInvokeHistory,
  emitTauriEvent,
  getInvokeHistory,
  injectTauriMocks,
  setMockInvokeResult,
} from '../fixtures/tauri-mocks';
import { SELECTORS, TIMEOUTS } from '../fixtures/test-data';

export class BasePage {
  readonly page: Page;
  readonly stream: StreamSimulator;

  constructor(page: Page) {
    this.page = page;
    this.stream = createStreamSimulator(page);
  }

  // ── Initialization ──────────────────────────────────────────────────────────

  /**
   * Initialize page with Tauri mocks, navigate, and wait for app readiness.
   */
  async init(customMocks: Record<string, unknown> = {}): Promise<void> {
    await injectTauriMocks(this.page, customMocks);
    await this.page.goto('/');
    await this.page.waitForLoadState('domcontentloaded');
    await this.waitForAppReady();
  }

  /**
   * Wait for sidebar and header to become visible.
   */
  async waitForAppReady(timeout = TIMEOUTS.long): Promise<void> {
    await this.page.waitForSelector(SELECTORS.sidebar.container, {
      state: 'visible',
      timeout,
    });
  }

  // ── DOM Queries ─────────────────────────────────────────────────────────────

  /**
   * Get a Playwright locator for the given selector.
   */
  locator(selector: string): Locator {
    return this.page.locator(selector);
  }

  /**
   * Check if an element exists in the DOM.
   */
  async elementExists(selector: string): Promise<boolean> {
    return (await this.page.locator(selector).count()) > 0;
  }

  /**
   * Check if an element is visible.
   */
  async isVisible(selector: string): Promise<boolean> {
    const loc = this.page.locator(selector).first();
    return loc.isVisible();
  }

  /**
   * Get inner text of the first matching element.
   */
  async getText(selector: string): Promise<string> {
    return this.page.locator(selector).first().innerText();
  }

  /**
   * Get all inner texts for matching elements.
   */
  async getAllTexts(selector: string): Promise<string[]> {
    return this.page.locator(selector).allInnerTexts();
  }

  /**
   * Get the value attribute of an input/textarea.
   */
  async getInputValue(selector: string): Promise<string> {
    return this.page.locator(selector).first().inputValue();
  }

  /**
   * Fill an input or textarea.
   */
  async fillInput(selector: string, value: string): Promise<void> {
    await this.page.locator(selector).first().fill(value);
  }

  /**
   * Click an element.
   */
  async click(selector: string): Promise<void> {
    await this.page.locator(selector).first().click();
  }

  /**
   * Count the number of matching elements.
   */
  async count(selector: string): Promise<number> {
    return this.page.locator(selector).count();
  }

  // ── Waits ───────────────────────────────────────────────────────────────────

  /**
   * Wait for text to appear on the page.
   */
  async waitForText(text: string, timeout = TIMEOUTS.medium): Promise<void> {
    await this.page.getByText(text, { exact: false }).first().waitFor({
      state: 'visible',
      timeout,
    });
  }

  /**
   * Wait for text to disappear.
   */
  async waitForTextToDisappear(text: string, timeout = TIMEOUTS.medium): Promise<void> {
    await this.page.getByText(text, { exact: false }).first().waitFor({
      state: 'hidden',
      timeout,
    });
  }

  /**
   * Wait for a selector to be visible.
   */
  async waitForSelector(selector: string, timeout = TIMEOUTS.medium): Promise<void> {
    await this.page.waitForSelector(selector, { state: 'visible', timeout });
  }

  /**
   * Wait for a selector to be hidden.
   */
  async waitForSelectorHidden(selector: string, timeout = TIMEOUTS.medium): Promise<void> {
    await this.page.waitForSelector(selector, { state: 'hidden', timeout });
  }

  /**
   * Simple delay.
   */
  async wait(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  // ── Screenshots ─────────────────────────────────────────────────────────────

  /**
   * Take a named screenshot.
   */
  async screenshot(name: string): Promise<void> {
    await this.page.screenshot({ path: `test-results/${name}.png`, fullPage: true });
  }

  // ── Keyboard ────────────────────────────────────────────────────────────────

  /**
   * Press a keyboard shortcut (e.g. 'Enter', 'Shift+Enter', 'Escape').
   */
  async pressShortcut(combo: string): Promise<void> {
    await this.page.keyboard.press(combo);
  }

  /**
   * Type text character by character.
   */
  async type(text: string, delay = 50): Promise<void> {
    await this.page.keyboard.type(text, { delay });
  }

  // ── Dialogs ─────────────────────────────────────────────────────────────────

  /**
   * Handle a browser dialog (alert/confirm/prompt).
   */
  handleDialog(accept: boolean, promptText?: string): void {
    this.page.once('dialog', async (dialog) => {
      if (accept) {
        await dialog.accept(promptText);
      } else {
        await dialog.dismiss();
      }
    });
  }

  // ── Local Storage ───────────────────────────────────────────────────────────

  /**
   * Get a localStorage value.
   */
  async getLocalStorage(key: string): Promise<string | null> {
    return this.page.evaluate((k) => localStorage.getItem(k), key);
  }

  /**
   * Set a localStorage value.
   */
  async setLocalStorage(key: string, value: string): Promise<void> {
    await this.page.evaluate(({ k, v }) => localStorage.setItem(k, v), { k: key, v: value });
  }

  /**
   * Clear all localStorage.
   */
  async clearLocalStorage(): Promise<void> {
    await this.page.evaluate(() => localStorage.clear());
  }

  // ── Tauri Mock Integration ──────────────────────────────────────────────────

  /**
   * Emit a Tauri event on the page.
   */
  async emitEvent(eventName: string, payload: unknown): Promise<void> {
    await emitTauriEvent(this.page, eventName, payload);
  }

  /**
   * Override a mock IPC command result at runtime.
   */
  async setMockResult(command: string, result: unknown): Promise<void> {
    await setMockInvokeResult(this.page, command, result);
  }

  /**
   * Get all IPC invoke calls made by the app.
   */
  async getInvokeHistory(): Promise<Array<{ cmd: string; args: unknown; timestamp: number }>> {
    return getInvokeHistory(this.page);
  }

  /**
   * Clear the IPC invoke history.
   */
  async clearInvokeHistory(): Promise<void> {
    await clearInvokeHistory(this.page);
  }

  /**
   * Assert that a specific IPC command was called.
   */
  async assertInvokeCalled(command: string): Promise<void> {
    const history = await this.getInvokeHistory();
    const found = history.some((h) => h.cmd === command);
    expect(found, `Expected IPC command "${command}" to be called`).toBeTruthy();
  }

  /**
   * Assert that a specific IPC command was called with given args.
   */
  async assertInvokeCalledWith(
    command: string,
    expectedArgs: Record<string, unknown>,
  ): Promise<void> {
    const history = await this.getInvokeHistory();
    const call = history.find((h) => h.cmd === command);
    expect(call, `Expected IPC command "${command}" to be called`).toBeTruthy();
    expect(call?.args).toMatchObject(expectedArgs);
  }

  // ── Theme ───────────────────────────────────────────────────────────────────

  /**
   * Get the current theme from the document's data-theme attribute.
   */
  async getCurrentTheme(): Promise<string> {
    return this.page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme') || 'dark';
    });
  }
}
