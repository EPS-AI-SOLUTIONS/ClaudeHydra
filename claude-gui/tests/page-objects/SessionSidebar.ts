/**
 * SessionSidebar — page object for the sidebar navigation and session management.
 *
 * Wraps sidebar interactions: view navigation, session CRUD,
 * start/stop controls, auto-approve toggle, and connection status.
 */

import { expect } from '@playwright/test';
import { NAV_LABELS, SELECTORS, type ViewId } from '../fixtures/test-data';
import { BasePage } from './BasePage';

export class SessionSidebar extends BasePage {
  // ── View Navigation ─────────────────────────────────────────────────────────

  /**
   * Navigate to a specific view by clicking the sidebar nav item.
   */
  async navigateTo(view: ViewId): Promise<void> {
    const label = NAV_LABELS[view];
    await this.page.locator(SELECTORS.sidebar.navItem, { hasText: label }).click();
    await this.page.waitForTimeout(300);
  }

  /**
   * Get the active view by finding which nav item has active styling.
   * Returns the nav label text of the active item.
   */
  async getActiveNavLabel(): Promise<string> {
    // The active nav item typically has a different background class
    const items = this.page.locator(SELECTORS.sidebar.navItem);
    const count = await items.count();

    for (let i = 0; i < count; i++) {
      const item = items.nth(i);
      const classes = await item.getAttribute('class');
      if (classes?.includes('bg-matrix-accent') || classes?.includes('active')) {
        return item.innerText();
      }
    }
    return '';
  }

  /**
   * Get all navigation labels from the sidebar.
   */
  async getNavLabels(): Promise<string[]> {
    return this.page.locator(SELECTORS.sidebar.navItem).allInnerTexts();
  }

  // ── Collapse ────────────────────────────────────────────────────────────────

  /**
   * Toggle sidebar collapse.
   */
  async toggleCollapse(): Promise<void> {
    await this.page.locator(SELECTORS.sidebar.collapseBtn).click();
  }

  /**
   * Check if sidebar is collapsed (narrow width).
   */
  async isCollapsed(): Promise<boolean> {
    const aside = this.page.locator(SELECTORS.sidebar.container);
    const width = await aside.evaluate((el) => (el as HTMLElement).offsetWidth);
    return width < 100;
  }

  // ── Session Management ──────────────────────────────────────────────────────

  /**
   * Create a new session by clicking the "Nowy czat" button.
   */
  async createNewSession(): Promise<void> {
    await this.page.locator(SELECTORS.sidebar.newSessionBtn).click();
    await this.page.waitForTimeout(300);
  }

  /**
   * Get the count of session items in the sidebar.
   */
  async getSessionCount(): Promise<number> {
    return this.page.locator(SELECTORS.sidebar.sessionItem).count();
  }

  /**
   * Get all session titles from the sidebar.
   */
  async getSessionTitles(): Promise<string[]> {
    const items = this.page.locator(SELECTORS.sidebar.sessionItem);
    const count = await items.count();
    const titles: string[] = [];

    for (let i = 0; i < count; i++) {
      // Session title is typically in a span or the first text node
      const text = await items.nth(i).innerText();
      // Take first line only (may have "X wiadomości" below)
      titles.push(text.split('\n')[0].trim());
    }
    return titles;
  }

  /**
   * Select a session by its title text.
   */
  async selectSession(title: string): Promise<void> {
    await this.page.locator(SELECTORS.sidebar.sessionItem, { hasText: title }).first().click();
    await this.page.waitForTimeout(200);
  }

  /**
   * Select a session by its index (0-based).
   */
  async selectSessionByIndex(index: number): Promise<void> {
    await this.page.locator(SELECTORS.sidebar.sessionItem).nth(index).click();
    await this.page.waitForTimeout(200);
  }

  /**
   * Delete a session by hovering and clicking the delete button.
   */
  async deleteSession(title: string): Promise<void> {
    const session = this.page.locator(SELECTORS.sidebar.sessionItem, { hasText: title }).first();
    await session.hover();
    // The delete button (Trash2 icon) appears on hover
    await session.locator('button').last().click();
    await this.page.waitForTimeout(200);
  }

  /**
   * Rename a session by double-clicking, typing, and confirming.
   */
  async renameSession(oldTitle: string, newTitle: string): Promise<void> {
    const session = this.page.locator(SELECTORS.sidebar.sessionItem, { hasText: oldTitle }).first();
    await session.dblclick();
    await this.page.waitForTimeout(100);

    // Find the input that appeared for rename
    const input = session.locator('input').first();
    await input.fill(newTitle);
    await input.press('Enter');
    await this.page.waitForTimeout(200);
  }

  /**
   * Assert the empty session state is shown.
   */
  async assertNoSessions(): Promise<void> {
    await expect(this.page.locator(SELECTORS.sidebar.sessionEmpty)).toBeVisible();
  }

  // ── Connection Controls ─────────────────────────────────────────────────────

  /**
   * Click the Start button.
   */
  async clickStart(): Promise<void> {
    await this.page.locator(SELECTORS.sidebar.startBtn).click();
  }

  /**
   * Click the Stop button.
   */
  async clickStop(): Promise<void> {
    await this.page.locator(SELECTORS.sidebar.stopBtn).click();
  }

  /**
   * Toggle the auto-approve button.
   */
  async toggleAutoApprove(): Promise<void> {
    await this.page.locator(SELECTORS.sidebar.autoApproveBtn).click();
  }

  /**
   * Check if the status dot indicates "active".
   */
  async isStatusActive(): Promise<boolean> {
    return this.page.locator(SELECTORS.sidebar.statusActive).isVisible();
  }

  /**
   * Check if the status dot indicates "inactive".
   */
  async isStatusInactive(): Promise<boolean> {
    return this.page.locator(SELECTORS.sidebar.statusInactive).isVisible();
  }

  /**
   * Get the connection status text.
   */
  async getConnectionStatus(): Promise<string> {
    const statusDot = this.page.locator(SELECTORS.sidebar.statusDot);
    if ((await statusDot.count()) === 0) return 'unknown';

    // Check adjacent text
    const parent = statusDot.first().locator('..');
    return parent.innerText();
  }

  // ── Logo ────────────────────────────────────────────────────────────────────

  /**
   * Check that the Claude HYDRA logo is visible.
   */
  async isLogoVisible(): Promise<boolean> {
    return this.page.locator(SELECTORS.sidebar.logoText).isVisible();
  }
}
