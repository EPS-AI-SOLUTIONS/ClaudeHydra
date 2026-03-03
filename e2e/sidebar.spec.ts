/**
 * Sidebar E2E tests for ClaudeHydra-v4.
 * Verifies sidebar display, collapse/expand, nav items, version,
 * theme toggle, settings button, session management, and chats section.
 */

import { test, expect } from './fixtures/base.fixture';
import { SidebarComponent } from './pages/SidebarComponent';
import { SEL } from './selectors/constants';

test.describe('Sidebar', () => {
  let sidebar: SidebarComponent;

  test.beforeEach(async ({ page }) => {
    sidebar = new SidebarComponent(page);
  });

  // ── Visibility ──────────────────────────────────────────────────────

  test('should display the sidebar on desktop', async () => {
    await expect(sidebar.sidebar).toBeVisible();
    const box = await sidebar.sidebar.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(200);
  });

  test('should show logo in expanded state', async () => {
    await sidebar.expand();
    await expect(sidebar.logo).toBeVisible();
  });

  // ── Navigation items ────────────────────────────────────────────────

  test('should show all nav items (home, chat)', async () => {
    const navIds = ['home', 'chat'];
    for (const id of navIds) {
      await expect(sidebar.navButton(id)).toBeVisible();
    }
  });

  // ── Collapse / Expand ───────────────────────────────────────────────

  test('should show collapse toggle button', async () => {
    await expect(sidebar.collapseToggle).toBeVisible();
  });

  test('should collapse sidebar when toggle clicked (width < 100px)', async () => {
    // Ensure expanded first
    await sidebar.expand();
    const expandedWidth = await sidebar.sidebar.evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    expect(expandedWidth).toBeGreaterThan(100);

    // Collapse
    await sidebar.toggleCollapse();
    await sidebar.page.waitForTimeout(400);

    const collapsedWidth = await sidebar.sidebar.evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    expect(collapsedWidth).toBeLessThan(100);
  });

  test('should expand sidebar when toggle clicked again (width > 100px)', async () => {
    // Collapse first
    await sidebar.collapse();
    await sidebar.page.waitForTimeout(400);
    expect(await sidebar.isCollapsed()).toBe(true);

    // Expand
    await sidebar.toggleCollapse();
    await sidebar.page.waitForTimeout(400);

    const expandedWidth = await sidebar.sidebar.evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    expect(expandedWidth).toBeGreaterThan(100);
  });

  test('should hide nav labels when collapsed', async ({ page }) => {
    // First verify labels are present when expanded
    await sidebar.expand();
    await page.waitForTimeout(400);
    const expandedLabels = page.locator(`${SEL.sidebar} nav span`);
    const expandedCount = await expandedLabels.count();
    expect(expandedCount).toBeGreaterThan(0);

    // Now collapse the sidebar
    await sidebar.collapse();
    await page.waitForTimeout(400);

    // In collapsed state the nav labels are removed from the DOM entirely
    // via React conditional rendering: {!collapsed && <span>...</span>}
    // So we verify that no label spans exist inside the nav.
    const collapsedLabels = page.locator(`${SEL.sidebar} nav span`);
    const collapsedCount = await collapsedLabels.count();
    expect(collapsedCount).toBe(0);
  });

  // ── Version ─────────────────────────────────────────────────────────

  test('should show version "v4.0.0" in expanded state', async () => {
    await sidebar.expand();
    await expect(sidebar.version).toBeVisible();
    const versionText = await sidebar.getVersion();
    expect(versionText).toContain('v4.0.0');
  });

  test('should hide version when collapsed', async ({ page }) => {
    await sidebar.collapse();
    await page.waitForTimeout(400);
    await expect(sidebar.version).not.toBeVisible();
  });

  // ── Theme toggle ────────────────────────────────────────────────────

  test('should show theme toggle button', async () => {
    await expect(sidebar.themeToggle).toBeVisible();
  });

  // ── Settings button ─────────────────────────────────────────────────

  test('should show settings button in main nav group', async () => {
    await expect(sidebar.navButton('settings')).toBeVisible();
  });

  // ── Session management ──────────────────────────────────────────────

  test('should create a new chat session when + button clicked', async ({ page }) => {
    await sidebar.expand();
    await expect(sidebar.newChatBtn).toBeVisible();

    // Get initial session count
    const initialCount = await sidebar.getSessionCount();

    // Click new chat
    await sidebar.clickNewChat();
    await page.waitForTimeout(500);

    // Session count should increase by 1
    const newCount = await sidebar.getSessionCount();
    expect(newCount).toBe(initialCount + 1);
  });

  test('should show session in session list after creating', async ({ page }) => {
    await sidebar.expand();
    await sidebar.clickNewChat();
    await page.waitForTimeout(500);

    // At least one session item should exist in the list
    const sessionCount = await sidebar.getSessionCount();
    expect(sessionCount).toBeGreaterThanOrEqual(1);

    // The session list container should be visible
    await expect(sidebar.sessionList).toBeVisible();
  });

  // ── Chats toggle ────────────────────────────────────────────────────

  test('should show chats toggle button', async () => {
    await sidebar.expand();
    await expect(sidebar.chatsToggle).toBeVisible();
  });

  test('should toggle chats section visibility', async ({ page }) => {
    await sidebar.expand();
    await expect(sidebar.chatsToggle).toBeVisible();

    // Determine initial visibility of session list
    const initiallyVisible = await sidebar.sessionList.isVisible();

    // Toggle
    await sidebar.chatsToggle.click();
    await page.waitForTimeout(400);

    // Visibility should have changed
    const afterToggle = await sidebar.sessionList.isVisible();
    expect(afterToggle).toBe(!initiallyVisible);

    // Toggle back
    await sidebar.chatsToggle.click();
    await page.waitForTimeout(400);

    const afterSecondToggle = await sidebar.sessionList.isVisible();
    expect(afterSecondToggle).toBe(initiallyVisible);
  });

  // ── Empty state ─────────────────────────────────────────────────────

  test('should show "No chats yet" when session list is empty initially', async ({ page }) => {
    // Fixture clears localStorage so sessions start empty
    await sidebar.expand();
    await page.waitForTimeout(300);

    // Look for empty-state text in the sidebar session area
    const sidebarText = await sidebar.sidebar.textContent();
    expect(sidebarText).toContain('No chats yet');
  });
});
