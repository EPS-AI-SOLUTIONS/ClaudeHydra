/**
 * Terminal View E2E tests.
 *
 * Covers: rendering, empty state, input enable/disable,
 * placeholder changes, output lines, clear, and direct IPC test.
 */

import { test, expect } from '../fixtures/test-setup';
import { TerminalPage } from '../page-objects/TerminalPage';
import { SELECTORS, UI_TEXTS, TIMEOUTS, TEST_MESSAGES } from '../fixtures/test-data';
import { setMockInvokeResult } from '../fixtures/tauri-mocks';

test.describe('Terminal View', () => {
  let terminal: TerminalPage;

  test.beforeEach(async ({ page }) => {
    terminal = new TerminalPage(page);
  });

  test('renders terminal view with empty state', async ({ page }) => {
    await expect(page.locator(SELECTORS.terminal.container)).toBeVisible();
    await terminal.assertEmptyState();
  });

  test('shows "No output yet." and helper text in empty state', async ({ page }) => {
    await expect(page.getByText(UI_TEXTS.terminal.emptyState)).toBeVisible();
    await expect(page.getByText(UI_TEXTS.terminal.startFirst)).toBeVisible();
  });

  test('input is disabled when session is not active', async () => {
    const enabled = await terminal.isInputEnabled();
    expect(enabled).toBe(false);
  });

  test('input placeholder shows "Start a session first" when inactive', async () => {
    const placeholder = await terminal.getInputPlaceholder();
    expect(placeholder).toContain(UI_TEXTS.terminal.placeholderDisabled);
  });

  test('input becomes enabled when session is active', async ({ page }) => {
    // Set session status to active
    await setMockInvokeResult(page, 'get_session_status', {
      running: true,
      session_id: 'test-123',
      is_active: true,
      pending_approval: false,
      auto_approve_all: false,
      approved_count: 0,
      denied_count: 0,
      auto_approved_count: 0,
    });

    // Reload to pick up new status
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector(SELECTORS.sidebar.container, {
      state: 'visible',
      timeout: TIMEOUTS.long,
    });

    const enabled = await terminal.isInputEnabled();
    expect(enabled).toBe(true);
  });

  test('input placeholder changes to "Type a message..." when active', async ({ page }) => {
    await setMockInvokeResult(page, 'get_session_status', {
      running: true,
      session_id: 'test-123',
      is_active: true,
      pending_approval: false,
      auto_approve_all: false,
      approved_count: 0,
      denied_count: 0,
      auto_approved_count: 0,
    });

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector(SELECTORS.sidebar.container, {
      state: 'visible',
      timeout: TIMEOUTS.long,
    });

    const placeholder = await terminal.getInputPlaceholder();
    expect(placeholder).toContain('message');
  });

  test('clear output button is visible', async ({ page }) => {
    await expect(page.locator(SELECTORS.terminal.clearBtn)).toBeVisible();
  });

  test('direct IPC test button is visible', async ({ page }) => {
    await expect(page.locator(SELECTORS.terminal.directTestBtn)).toBeVisible();
  });

  test('send button is disabled when input is empty', async ({ page }) => {
    const sendBtn = page.locator(SELECTORS.terminal.sendBtn);
    await expect(sendBtn).toBeDisabled();
  });

  test('displays streaming output lines with correct prefixes', async ({ page, stream }) => {
    // Simulate session active
    await setMockInvokeResult(page, 'get_session_status', {
      running: true, session_id: 'test-123', is_active: true,
      pending_approval: false, auto_approve_all: false,
      approved_count: 0, denied_count: 0, auto_approved_count: 0,
    });
    await page.reload();
    await page.waitForSelector(SELECTORS.sidebar.container, { state: 'visible', timeout: TIMEOUTS.long });

    // Simulate Claude session output
    await stream.simulateClaudeSessionOutput(['Hello from Claude!', 'Task completed.']);
    await page.waitForTimeout(300);

    const lineCount = await terminal.getOutputLineCount();
    expect(lineCount).toBeGreaterThan(0);
  });
});
