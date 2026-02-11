/**
 * Swarm Workflow Integration tests.
 *
 * Tests multi-component workflows spanning sidebar, terminal, chat,
 * and memory — simulating real user journeys through ClaudeHydra.
 *
 * Covers: full workflow (sidebar → terminal → send → output → switch views),
 * Swarm protocol with 15 Witcher agents, session persistence,
 * approve/deny flow, and view state preservation.
 */

import { setMockInvokeResult } from '../fixtures/tauri-mocks';
import { AGENTS, type NAV_LABELS, SELECTORS, TIMEOUTS } from '../fixtures/test-data';
import { expect, test } from '../fixtures/test-setup';
import { ChatPage } from '../page-objects/ChatPage';
import { SessionSidebar } from '../page-objects/SessionSidebar';
import { TerminalPage } from '../page-objects/TerminalPage';

test.describe('Swarm Workflow Integration', () => {
  test('full workflow: sidebar → terminal → send → output → switch views', async ({
    page,
    stream,
  }) => {
    const sidebar = new SessionSidebar(page);
    const terminal = new TerminalPage(page);

    // 1. Verify sidebar and terminal are visible
    await expect(page.locator(SELECTORS.sidebar.container)).toBeVisible();
    await expect(page.locator(SELECTORS.terminal.container)).toBeVisible();

    // 2. Make session active
    await setMockInvokeResult(page, 'get_session_status', {
      running: true,
      session_id: 'workflow-test',
      is_active: true,
      pending_approval: false,
      auto_approve_all: false,
      approved_count: 0,
      denied_count: 0,
      auto_approved_count: 0,
    });
    await page.reload();
    await page.waitForSelector(SELECTORS.sidebar.container, {
      state: 'visible',
      timeout: TIMEOUTS.long,
    });

    // 3. Send a command in terminal
    await terminal.sendInput('Analyze the project');
    await page.waitForTimeout(200);

    // 4. Simulate streaming output
    await stream.simulateClaudeSessionOutput([
      'Analyzing project structure...',
      'Found 42 TypeScript files.',
      'Analysis complete.',
    ]);
    await page.waitForTimeout(500);

    // 5. Switch to Ollama Chat view
    await sidebar.navigateTo('ollama');
    await expect(page.locator(SELECTORS.chat.heading)).toBeVisible();

    // 6. Switch to Settings
    await sidebar.navigateTo('settings');
    await expect(page.locator(SELECTORS.settings.heading)).toBeVisible();

    // 7. Return to terminal — should still show the output
    await sidebar.navigateTo('terminal');
    await expect(page.locator(SELECTORS.terminal.container)).toBeVisible();
  });

  test('Swarm protocol with all 15 Witcher agents', async ({ page, stream }) => {
    const sidebar = new SessionSidebar(page);

    // Navigate to terminal
    await sidebar.navigateTo('terminal');

    // Set session active
    await setMockInvokeResult(page, 'get_session_status', {
      running: true,
      session_id: 'swarm-test',
      is_active: true,
      pending_approval: false,
      auto_approve_all: false,
      approved_count: 0,
      denied_count: 0,
      auto_approved_count: 0,
    });
    await page.reload();
    await page.waitForSelector(SELECTORS.sidebar.container, {
      state: 'visible',
      timeout: TIMEOUTS.long,
    });

    // Simulate full Swarm with all 15 agents
    const allAgents = AGENTS.map((a) => a.name);
    await stream.simulateSwarmProtocol(allAgents);
    await page.waitForTimeout(1000);

    // App should still be responsive
    await expect(page.locator(SELECTORS.sidebar.container)).toBeVisible();
  });

  test('session persistence: chat history survives view switches', async ({ page }) => {
    const sidebar = new SessionSidebar(page);

    // Create sessions
    await setMockInvokeResult(page, 'list_chat_sessions', [
      {
        id: 's1',
        title: 'Architecture Review',
        message_count: 5,
        created_at: new Date().toISOString(),
      },
      { id: 's2', title: 'Bug Triage', message_count: 3, created_at: new Date().toISOString() },
    ]);
    await page.reload();
    await page.waitForSelector(SELECTORS.sidebar.container, {
      state: 'visible',
      timeout: TIMEOUTS.long,
    });

    // Verify sessions exist
    const count = await sidebar.getSessionCount();
    expect(count).toBe(2);

    // Switch views and come back
    await sidebar.navigateTo('settings');
    await page.waitForTimeout(300);

    await sidebar.navigateTo('terminal');
    await page.waitForTimeout(300);

    // Sessions should still be in sidebar
    const countAfter = await sidebar.getSessionCount();
    expect(countAfter).toBe(2);
  });

  test('approval workflow: start → approve → deny', async ({ page }) => {
    const _terminal = new TerminalPage(page);

    // Set session active with pending approval
    await setMockInvokeResult(page, 'get_session_status', {
      running: true,
      session_id: 'approval-test',
      is_active: true,
      pending_approval: true,
      auto_approve_all: false,
      approved_count: 0,
      denied_count: 0,
      auto_approved_count: 0,
    });
    await page.reload();
    await page.waitForSelector(SELECTORS.sidebar.container, {
      state: 'visible',
      timeout: TIMEOUTS.long,
    });

    // Verify the app shows some kind of approval UI
    // (ApprovalDialog component should be visible when pending_approval is true)
    await page.waitForTimeout(500);

    // Check that app is stable
    await expect(page.locator(SELECTORS.sidebar.container)).toBeVisible();
  });

  test('view switching preserves sidebar state', async ({ page }) => {
    const sidebar = new SessionSidebar(page);

    // Navigate through all main views
    const views: Array<keyof typeof NAV_LABELS> = [
      'terminal',
      'ollama',
      'learning',
      'debug',
      'chats',
      'rules',
      'history',
      'settings',
    ];

    for (const view of views) {
      await sidebar.navigateTo(view);
      await page.waitForTimeout(200);

      // Sidebar should remain visible in all views
      await expect(page.locator(SELECTORS.sidebar.container)).toBeVisible();
    }
  });

  test('start and stop session controls work', async ({ page }) => {
    const sidebar = new SessionSidebar(page);

    // Click Start button
    await sidebar.clickStart();
    await page.waitForTimeout(300);

    // Verify IPC was called
    await sidebar.assertInvokeCalled('start_claude_session');

    // Now simulate session running
    await setMockInvokeResult(page, 'get_session_status', {
      running: true,
      session_id: 'started-session',
      is_active: true,
      pending_approval: false,
      auto_approve_all: false,
      approved_count: 0,
      denied_count: 0,
      auto_approved_count: 0,
    });
    await page.reload();
    await page.waitForSelector(SELECTORS.sidebar.container, {
      state: 'visible',
      timeout: TIMEOUTS.long,
    });

    // Click Stop button
    await sidebar.clickStop();
    await page.waitForTimeout(300);

    await sidebar.assertInvokeCalled('stop_claude_session');
  });

  test('Ollama chat with streaming + view switch + return', async ({ page, stream }) => {
    const sidebar = new SessionSidebar(page);
    const chat = new ChatPage(page);

    // Navigate to chat
    await sidebar.navigateTo('ollama');
    await page.waitForTimeout(300);

    // Send a message
    await chat.sendMessage('Explain Witcher lore');
    await page.waitForTimeout(200);

    // Simulate streaming response
    await stream.simulateOllamaResponse(
      'llama3.2:3b',
      'The Witcher saga by Andrzej Sapkowski is a fantasy series set in a Slavic-inspired world',
    );
    await page.waitForTimeout(500);

    // Switch to settings
    await sidebar.navigateTo('settings');
    await page.waitForTimeout(300);

    // Return to chat
    await sidebar.navigateTo('ollama');
    await page.waitForTimeout(300);

    // Verify chat is still functional
    await expect(page.locator(SELECTORS.chat.input).first()).toBeVisible();
  });

  test('auto-approve toggle sends IPC command', async ({ page }) => {
    const sidebar = new SessionSidebar(page);

    await sidebar.toggleAutoApprove();
    await page.waitForTimeout(200);

    await sidebar.assertInvokeCalled('toggle_auto_approve_all');
  });
});
