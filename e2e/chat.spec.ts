/**
 * Chat view E2E tests for ClaudeHydra-v4.
 * Verifies chat UI elements, offline state indicators, and input controls.
 * Backend is NOT running — chat should display offline status throughout.
 */

import { test, expect } from './fixtures/base.fixture';
import { ChatPage } from './pages/ChatPage';
import { SidebarComponent } from './pages/SidebarComponent';
import { SEL } from './selectors/constants';

test.describe('Chat View', () => {
  let chat: ChatPage;
  let sidebar: SidebarComponent;

  test.beforeEach(async ({ page }) => {
    sidebar = new SidebarComponent(page);
    chat = new ChatPage(page);

    // Navigate to chat view
    await page.locator(SEL.nav('chat')).click();
    await expect(page.locator(SEL.chatView)).toBeVisible({ timeout: 10_000 });
  });

  // ── View visibility ───────────────────────────────────────────────────

  test('should display the chat view', async () => {
    await expect(chat.root).toBeVisible();
  });

  // ── Header ────────────────────────────────────────────────────────────

  test('should show chat header with "Claude Chat" title', async () => {
    await expect(chat.header).toBeVisible();
    await expect(chat.header).toContainText('Claude Chat');
  });

  // ── Offline status ────────────────────────────────────────────────────

  test('should show offline status text', async () => {
    await expect(chat.statusText).toBeVisible();
  });

  // ── Empty state ───────────────────────────────────────────────────────

  test('should display empty state', async () => {
    // If backend is disconnected or offline, empty state might be different or standard
    const emptyState = chat.page.locator('[data-testid="chat-empty-state"]');
    await expect(emptyState).toBeVisible({ timeout: 10000 });
  });

  // ── Message area ──────────────────────────────────────────────────────

  test('should show the message area', async () => {
    await expect(chat.messageArea).toBeVisible();
  });

  // ── Textarea input (disabled when backend is offline) ─────────────────

  test('should have a disabled textarea when backend is offline', async () => {
    await expect(chat.textarea).toBeVisible();
    await expect(chat.textarea).toBeDisabled();
  });

  // ── Send button disabled ──────────────────────────────────────────────

  test('should have a disabled send button when empty', async () => {
    await expect(chat.sendBtn).toBeVisible();
    await expect(chat.sendBtn).toBeDisabled();
  });

  // ── Clear button ──────────────────────────────────────────────────────

  test('should have a clear button', async () => {
    await expect(chat.clearBtn).toBeVisible();
  });

  // ── Input area ────────────────────────────────────────────────────────

  test('should show chat input area', async () => {
    await expect(chat.inputArea).toBeVisible();
  });

  // ── Placeholder text ──────────────────────────────────────────────────

  test('should have textarea with correct placeholder text for offline state', async () => {
    const placeholder = await chat.textarea.getAttribute('placeholder');
    expect(placeholder).toContain('Configure API key in Settings');
  });

  // ── ARIA accessibility (#46) ────────────────────────────────────────────

  test('should have aria-live region on message area', async ({ page }) => {
    const messageArea = page.locator(SEL.chatMessageArea);
    await expect(messageArea).toHaveAttribute('role', 'log');
    await expect(messageArea).toHaveAttribute('aria-live', 'polite');
  });

  test('should have aria-labels on action buttons', async () => {
    const clearBtn = chat.clearBtn;
    await expect(clearBtn).toHaveAttribute('aria-label');
  });

  // ── Search overlay (#19) ────────────────────────────────────────────────

  test('should open search overlay with Ctrl+F', async ({ page }) => {
    await page.keyboard.press('Control+f');
    const searchInput = page.locator('input[aria-label="Search messages"]');
    await expect(searchInput).toBeVisible({ timeout: 3000 });
  });

  test('should close search overlay with Escape', async ({ page }) => {
    await page.keyboard.press('Control+f');
    const searchInput = page.locator('input[aria-label="Search messages"]');
    await expect(searchInput).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Escape');
    await expect(searchInput).not.toBeVisible({ timeout: 3000 });
  });
});
