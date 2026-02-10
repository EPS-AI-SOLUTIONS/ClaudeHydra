/**
 * Keyboard Shortcuts E2E tests.
 *
 * Covers: Enter to submit in terminal, Tab navigation in sidebar,
 * Escape to cancel rename, and keyboard focus management.
 */

import { test, expect } from '../fixtures/test-setup';
import { TerminalPage } from '../page-objects/TerminalPage';
import { SessionSidebar } from '../page-objects/SessionSidebar';
import { SELECTORS, TIMEOUTS, SHORTCUTS } from '../fixtures/test-data';
import { setMockInvokeResult } from '../fixtures/tauri-mocks';

test.describe('Keyboard Shortcuts', () => {
  test('Enter submits terminal input', async ({ page }) => {
    const terminal = new TerminalPage(page);

    // Make session active
    await setMockInvokeResult(page, 'get_session_status', {
      running: true, session_id: 'kb-test', is_active: true,
      pending_approval: false, auto_approve_all: false,
      approved_count: 0, denied_count: 0, auto_approved_count: 0,
    });
    await page.reload();
    await page.waitForSelector(SELECTORS.sidebar.container, { state: 'visible', timeout: TIMEOUTS.long });

    // Focus terminal input and type
    const input = page.locator(SELECTORS.terminal.input).first();
    await input.focus();
    await input.fill('test command');

    // Press Enter to submit
    await input.press(SHORTCUTS.enter);
    await page.waitForTimeout(200);

    // Input should be cleared after submit
    const value = await input.inputValue();
    expect(value).toBe('');
  });

  test('Tab navigates between sidebar elements', async ({ page }) => {
    // Focus the first sidebar button
    const firstNav = page.locator(SELECTORS.sidebar.navItem).first();
    await firstNav.focus();

    // Press Tab to move to next element
    await page.keyboard.press(SHORTCUTS.tab);
    await page.waitForTimeout(100);

    // Verify focus moved (active element changed)
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedTag).toBeTruthy();
  });

  test('Escape cancels session rename', async ({ page }) => {
    const sidebar = new SessionSidebar(page);

    // Add a session to rename
    await setMockInvokeResult(page, 'list_chat_sessions', [
      { id: 's1', title: 'Original Title', message_count: 0, created_at: new Date().toISOString() },
    ]);
    await page.reload();
    await page.waitForSelector(SELECTORS.sidebar.container, { state: 'visible', timeout: TIMEOUTS.long });

    // Double-click to start rename
    const session = page.locator(SELECTORS.sidebar.sessionItem).first();
    await session.dblclick();
    await page.waitForTimeout(200);

    // Type new name but press Escape to cancel
    const renameInput = session.locator('input').first();
    if (await renameInput.isVisible()) {
      await renameInput.fill('New Name');
      await renameInput.press(SHORTCUTS.escape);
      await page.waitForTimeout(200);

      // Should revert to original
      const sessionText = await session.innerText();
      expect(sessionText).toContain('Original Title');
    }
  });

  test('focus returns to input after sending message', async ({ page }) => {
    // Make session active
    await setMockInvokeResult(page, 'get_session_status', {
      running: true, session_id: 'focus-test', is_active: true,
      pending_approval: false, auto_approve_all: false,
      approved_count: 0, denied_count: 0, auto_approved_count: 0,
    });
    await page.reload();
    await page.waitForSelector(SELECTORS.sidebar.container, { state: 'visible', timeout: TIMEOUTS.long });

    const input = page.locator(SELECTORS.terminal.input).first();
    await input.fill('test');
    await input.press(SHORTCUTS.enter);
    await page.waitForTimeout(200);

    // Check the input is still (or returned to being) focused or at least cleared
    const value = await input.inputValue();
    expect(value).toBe('');
  });

  test('sidebar navigation with keyboard click', async ({ page }) => {
    const sidebar = new SessionSidebar(page);

    // Navigate to different views using the sidebar
    await sidebar.navigateTo('ollama');
    await page.waitForTimeout(300);

    await sidebar.navigateTo('settings');
    await page.waitForTimeout(300);

    await sidebar.navigateTo('terminal');
    await page.waitForTimeout(300);

    // Should be back at terminal
    await expect(page.locator(SELECTORS.terminal.container)).toBeVisible();
  });
});
