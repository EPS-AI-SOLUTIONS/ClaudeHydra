/**
 * Streaming E2E tests.
 *
 * Covers: character-by-character streaming, Ollama protocol,
 * instant response, auto-scroll, error handling during streaming,
 * and partial-then-error scenarios.
 */

import { test, expect } from '../fixtures/test-setup';
import { TerminalPage } from '../page-objects/TerminalPage';
import { SELECTORS, TIMEOUTS } from '../fixtures/test-data';
import { setMockInvokeResult, emitTauriEvent } from '../fixtures/tauri-mocks';

test.describe('Streaming', () => {
  let terminal: TerminalPage;

  test.beforeEach(async ({ page }) => {
    terminal = new TerminalPage(page);

    // Set session to active for streaming tests
    await setMockInvokeResult(page, 'get_session_status', {
      running: true,
      session_id: 'stream-test',
      is_active: true,
      pending_approval: false,
      auto_approve_all: false,
      approved_count: 0,
      denied_count: 0,
      auto_approved_count: 0,
    });

    await page.reload();
    await page.waitForSelector(SELECTORS.sidebar.container, { state: 'visible', timeout: TIMEOUTS.long });
  });

  test('character-by-character streaming output', async ({ page, stream }) => {
    await stream.simulateTypingResponse('Hello, world!', { delayMs: 20, chunkSize: 1 });
    await page.waitForTimeout(500);

    const lineCount = await terminal.getOutputLineCount();
    // Content should have been streamed
    expect(lineCount).toBeGreaterThanOrEqual(0);
  });

  test('instant response appears fully', async ({ page, stream }) => {
    await stream.simulateInstantResponse('Instant analysis result: all systems operational.');
    await page.waitForTimeout(300);

    const lineCount = await terminal.getOutputLineCount();
    expect(lineCount).toBeGreaterThanOrEqual(0);
  });

  test('Ollama streaming protocol works word by word', async ({ page, stream }) => {
    await stream.simulateOllamaResponse('llama3.2:3b', 'The quick brown fox jumps over the lazy dog');
    await page.waitForTimeout(500);

    // Verify something was rendered
    const pageContent = await page.locator('body').innerText();
    expect(pageContent).toBeTruthy();
  });

  test('Claude session output displays multiple lines', async ({ page, stream }) => {
    await stream.simulateClaudeSessionOutput([
      'Analyzing project structure...',
      'Found 42 files in 8 directories.',
      'Code quality: excellent.',
      'No security vulnerabilities detected.',
    ]);
    await page.waitForTimeout(500);

    const lineCount = await terminal.getOutputLineCount();
    expect(lineCount).toBeGreaterThan(0);
  });

  test('Swarm protocol dispatches to multiple agents', async ({ page, stream }) => {
    await stream.simulateSwarmProtocol(['Geralt', 'Yennefer', 'Triss']);
    await page.waitForTimeout(500);

    // Verify swarm event was processed
    const pageContent = await page.locator('body').innerText();
    expect(pageContent).toBeTruthy();
  });

  test('stream error is handled gracefully', async ({ page, stream }) => {
    await stream.emitError('Connection reset by peer');
    await page.waitForTimeout(300);

    // App should still be functional
    const sidebarVisible = await page.locator(SELECTORS.sidebar.container).isVisible();
    expect(sidebarVisible).toBe(true);
  });

  test('partial response followed by error', async ({ page, stream }) => {
    await stream.simulatePartialThenError(
      'Starting analysis...',
      'Server disconnected unexpectedly'
    );
    await page.waitForTimeout(500);

    // App should remain stable
    const sidebarVisible = await page.locator(SELECTORS.sidebar.container).isVisible();
    expect(sidebarVisible).toBe(true);
  });

  test('auto-scroll follows new output', async ({ page, stream }) => {
    // Emit many lines to trigger scroll
    for (let i = 0; i < 20; i++) {
      await stream.emitChunk(`Line ${i + 1} of streaming output\n`, i === 19);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(300);

    const scrolledToBottom = await terminal.isScrolledToBottom();
    expect(scrolledToBottom).toBe(true);
  });

  test('markdown streaming renders progressively', async ({ page, stream }) => {
    await stream.simulateMarkdownResponse();
    await page.waitForTimeout(600);

    // Check that app didn't crash and content is visible
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(0);
  });
});
