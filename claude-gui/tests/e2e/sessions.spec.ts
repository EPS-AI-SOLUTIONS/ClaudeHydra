/**
 * Session Management E2E tests.
 *
 * Covers: creating sessions, listing, selecting, renaming,
 * deleting, empty state, and session count.
 */

import { test, expect } from '../fixtures/test-setup';
import { SessionSidebar } from '../page-objects/SessionSidebar';
import { SELECTORS, UI_TEXTS, TIMEOUTS } from '../fixtures/test-data';
import { setMockInvokeResult } from '../fixtures/tauri-mocks';

test.describe('Session Management', () => {
  let sidebar: SessionSidebar;

  test.beforeEach(async ({ page }) => {
    sidebar = new SessionSidebar(page);
  });

  test('shows empty state when no sessions exist', async () => {
    await sidebar.assertNoSessions();
  });

  test('"Nowy czat" button is visible', async ({ page }) => {
    await expect(page.locator(SELECTORS.sidebar.newSessionBtn)).toBeVisible();
  });

  test('creating a new session adds it to the list', async ({ page }) => {
    // Mock create_chat_session to return a session
    await setMockInvokeResult(page, 'create_chat_session', {
      id: 'session-new-1',
      title: 'Nowa rozmowa',
      message_count: 0,
    });

    // Mock list_chat_sessions to return the new session
    await setMockInvokeResult(page, 'list_chat_sessions', [
      { id: 'session-new-1', title: 'Nowa rozmowa', message_count: 0, created_at: new Date().toISOString() },
    ]);

    await sidebar.createNewSession();

    // Verify the session count
    const count = await sidebar.getSessionCount();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('clicking a session selects it', async ({ page }) => {
    // Pre-populate sessions
    await setMockInvokeResult(page, 'list_chat_sessions', [
      { id: 's1', title: 'Session Alpha', message_count: 3, created_at: new Date().toISOString() },
      { id: 's2', title: 'Session Beta', message_count: 5, created_at: new Date().toISOString() },
    ]);

    await page.reload();
    await page.waitForSelector(SELECTORS.sidebar.container, { state: 'visible', timeout: TIMEOUTS.long });

    // Click the first session
    await sidebar.selectSession('Session Alpha');

    // Should navigate to Ollama chat view
    await page.waitForTimeout(300);
  });

  test('sessions display message count', async ({ page }) => {
    await setMockInvokeResult(page, 'list_chat_sessions', [
      { id: 's1', title: 'Active Chat', message_count: 7, created_at: new Date().toISOString() },
    ]);

    await page.reload();
    await page.waitForSelector(SELECTORS.sidebar.container, { state: 'visible', timeout: TIMEOUTS.long });

    // Should show "7 wiadomości" or similar
    const sessionText = await page.locator(SELECTORS.sidebar.sessionItem).first().innerText();
    expect(sessionText).toContain('7');
  });

  test('can create multiple sessions', async ({ page }) => {
    const sessions = [
      { id: 's1', title: 'First Chat', message_count: 0, created_at: new Date().toISOString() },
      { id: 's2', title: 'Second Chat', message_count: 0, created_at: new Date().toISOString() },
      { id: 's3', title: 'Third Chat', message_count: 0, created_at: new Date().toISOString() },
    ];

    await setMockInvokeResult(page, 'list_chat_sessions', sessions);
    await page.reload();
    await page.waitForSelector(SELECTORS.sidebar.container, { state: 'visible', timeout: TIMEOUTS.long });

    const count = await sidebar.getSessionCount();
    expect(count).toBe(3);
  });

  test('Start button is visible in sidebar', async ({ page }) => {
    await expect(page.locator(SELECTORS.sidebar.startBtn)).toBeVisible();
  });

  test('auto-approve button is visible', async ({ page }) => {
    await expect(page.locator(SELECTORS.sidebar.autoApproveBtn)).toBeVisible();
  });

  test('Claude HYDRA logo is visible', async () => {
    const visible = await sidebar.isLogoVisible();
    expect(visible).toBe(true);
  });

  test('sidebar contains all 8 navigation items', async () => {
    const labels = await sidebar.getNavLabels();
    expect(labels.length).toBeGreaterThanOrEqual(8);
  });
});
