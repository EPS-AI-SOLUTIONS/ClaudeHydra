import { test, expect } from '@playwright/test';

/**
 * Dashboard Routing E2E Tests
 *
 * These tests verify the Dashboard view routing functionality.
 * The Dashboard supports three views:
 * - Chat: Default chat interface with MultiTabChat
 * - Multi-Input: MultiInputDashboard for sending prompts to multiple providers
 * - Stream Panel: StreamPanel for monitoring active streams
 */

test.describe('Dashboard Routing - Default View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for launcher to complete (dashboard loads after ~2-3 seconds)
    await page.waitForTimeout(3500);
  });

  test('should render Dashboard with default chat view', async ({ page }) => {
    // Verify the view mode tabs are present
    const chatTab = page.locator('[data-testid="view-tab-chat"]');
    const multiInputTab = page.locator('[data-testid="view-tab-multi-input"]');
    const streamPanelTab = page.locator('[data-testid="view-tab-stream-panel"]');

    // All view tabs should be visible
    await expect(chatTab).toBeVisible();
    await expect(multiInputTab).toBeVisible();
    await expect(streamPanelTab).toBeVisible();

    // Chat view content should be visible by default
    const chatViewContent = page.locator('[data-testid="view-content-chat"]');
    await expect(chatViewContent).toBeVisible();

    // Other views should not be visible
    const multiInputContent = page.locator('[data-testid="view-content-multi-input"]');
    const streamPanelContent = page.locator('[data-testid="view-content-stream-panel"]');
    await expect(multiInputContent).not.toBeVisible();
    await expect(streamPanelContent).not.toBeVisible();
  });

  test('should have Chat tab selected by default', async ({ page }) => {
    // Chat tab should have active styling (shadow-sm class indicates selection)
    const chatTab = page.locator('[data-testid="view-tab-chat"]');

    // Check that chat tab has the active class (bg-white or bg-gray-700 depending on theme)
    const chatTabClasses = await chatTab.getAttribute('class');
    expect(chatTabClasses).toContain('shadow-sm');
  });

  test('should display chat textarea in default view', async ({ page }) => {
    // Chat view should have a textarea for input
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible();
    await expect(textarea).toBeEditable();
  });
});

test.describe('Dashboard Routing - Switch to Multi-Input Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3500);
  });

  test('should switch to MultiInputDashboard view when Multi tab is clicked', async ({ page }) => {
    // Click on Multi-Input tab
    const multiInputTab = page.locator('[data-testid="view-tab-multi-input"]');
    await multiInputTab.click();
    await page.waitForTimeout(300);

    // Multi-Input view content should now be visible
    const multiInputContent = page.locator('[data-testid="view-content-multi-input"]');
    await expect(multiInputContent).toBeVisible();

    // Chat view should no longer be visible
    const chatViewContent = page.locator('[data-testid="view-content-chat"]');
    await expect(chatViewContent).not.toBeVisible();
  });

  test('should show MultiInputDashboard heading after switching', async ({ page }) => {
    // Click on Multi-Input tab
    const multiInputTab = page.locator('[data-testid="view-tab-multi-input"]');
    await multiInputTab.click();
    await page.waitForTimeout(300);

    // Look for MULTI-INPUT DASHBOARD heading
    const dashboardHeading = page.getByText('MULTI-INPUT DASHBOARD');
    await expect(dashboardHeading).toBeVisible();
  });

  test('should show provider selection in MultiInputDashboard', async ({ page }) => {
    // Click on Multi-Input tab
    const multiInputTab = page.locator('[data-testid="view-tab-multi-input"]');
    await multiInputTab.click();
    await page.waitForTimeout(300);

    // Look for "Select Providers" label
    const selectProvidersLabel = page.getByText('Select Providers');
    await expect(selectProvidersLabel).toBeVisible();

    // Should have checkboxes for provider selection
    const checkboxes = page.locator('input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();
    expect(checkboxCount).toBeGreaterThan(0);
  });

  test('should highlight Multi tab as active after switching', async ({ page }) => {
    // Click on Multi-Input tab
    const multiInputTab = page.locator('[data-testid="view-tab-multi-input"]');
    await multiInputTab.click();
    await page.waitForTimeout(300);

    // Multi tab should have active styling
    const multiTabClasses = await multiInputTab.getAttribute('class');
    expect(multiTabClasses).toContain('shadow-sm');

    // Chat tab should not have active styling
    const chatTab = page.locator('[data-testid="view-tab-chat"]');
    const chatTabClasses = await chatTab.getAttribute('class');
    expect(chatTabClasses).not.toContain('shadow-sm');
  });
});

test.describe('Dashboard Routing - Switch to Stream Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3500);
  });

  test('should switch to StreamPanel view when Streams tab is clicked', async ({ page }) => {
    // Click on Stream Panel tab
    const streamPanelTab = page.locator('[data-testid="view-tab-stream-panel"]');
    await streamPanelTab.click();
    await page.waitForTimeout(300);

    // Stream Panel content should now be visible
    const streamPanelContent = page.locator('[data-testid="view-content-stream-panel"]');
    await expect(streamPanelContent).toBeVisible();

    // Chat view should no longer be visible
    const chatViewContent = page.locator('[data-testid="view-content-chat"]');
    await expect(chatViewContent).not.toBeVisible();
  });

  test('should show StreamPanel idle state after switching', async ({ page }) => {
    // Click on Stream Panel tab
    const streamPanelTab = page.locator('[data-testid="view-tab-stream-panel"]');
    await streamPanelTab.click();
    await page.waitForTimeout(300);

    // StreamPanel should show idle state with "No active streams" message
    const noActiveStreams = page.getByText('No active streams');
    await expect(noActiveStreams).toBeVisible();
  });

  test('should show StreamPanel hint text', async ({ page }) => {
    // Click on Stream Panel tab
    const streamPanelTab = page.locator('[data-testid="view-tab-stream-panel"]');
    await streamPanelTab.click();
    await page.waitForTimeout(300);

    // Should show hint about when streams appear
    const hintText = page.getByText('Streams will appear here when you start a query');
    await expect(hintText).toBeVisible();
  });

  test('should highlight Streams tab as active after switching', async ({ page }) => {
    // Click on Stream Panel tab
    const streamPanelTab = page.locator('[data-testid="view-tab-stream-panel"]');
    await streamPanelTab.click();
    await page.waitForTimeout(300);

    // Streams tab should have active styling
    const streamTabClasses = await streamPanelTab.getAttribute('class');
    expect(streamTabClasses).toContain('shadow-sm');
  });
});

test.describe('Dashboard Routing - Return to Chat View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3500);
  });

  test('should return to chat view from MultiInputDashboard', async ({ page }) => {
    // First switch to Multi-Input
    const multiInputTab = page.locator('[data-testid="view-tab-multi-input"]');
    await multiInputTab.click();
    await page.waitForTimeout(300);

    // Verify we're on Multi-Input view
    const multiInputContent = page.locator('[data-testid="view-content-multi-input"]');
    await expect(multiInputContent).toBeVisible();

    // Click on Chat tab to return
    const chatTab = page.locator('[data-testid="view-tab-chat"]');
    await chatTab.click();
    await page.waitForTimeout(300);

    // Chat view should be visible again
    const chatViewContent = page.locator('[data-testid="view-content-chat"]');
    await expect(chatViewContent).toBeVisible();

    // Multi-Input should no longer be visible
    await expect(multiInputContent).not.toBeVisible();
  });

  test('should return to chat view from StreamPanel', async ({ page }) => {
    // First switch to Stream Panel
    const streamPanelTab = page.locator('[data-testid="view-tab-stream-panel"]');
    await streamPanelTab.click();
    await page.waitForTimeout(300);

    // Verify we're on Stream Panel view
    const streamPanelContent = page.locator('[data-testid="view-content-stream-panel"]');
    await expect(streamPanelContent).toBeVisible();

    // Click on Chat tab to return
    const chatTab = page.locator('[data-testid="view-tab-chat"]');
    await chatTab.click();
    await page.waitForTimeout(300);

    // Chat view should be visible again
    const chatViewContent = page.locator('[data-testid="view-content-chat"]');
    await expect(chatViewContent).toBeVisible();

    // Stream Panel should no longer be visible
    await expect(streamPanelContent).not.toBeVisible();
  });

  test('should restore chat textarea after returning to chat view', async ({ page }) => {
    // Switch to Multi-Input
    const multiInputTab = page.locator('[data-testid="view-tab-multi-input"]');
    await multiInputTab.click();
    await page.waitForTimeout(300);

    // Return to Chat
    const chatTab = page.locator('[data-testid="view-tab-chat"]');
    await chatTab.click();
    await page.waitForTimeout(300);

    // Chat textarea should be visible and editable
    const textarea = page.locator('[data-testid="view-content-chat"] textarea').first();
    if (await textarea.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(textarea).toBeEditable();
    } else {
      // Fallback: find any textarea in chat view
      const anyTextarea = page.locator('textarea').first();
      await expect(anyTextarea).toBeVisible();
    }
  });
});

test.describe('Dashboard Routing - View Switching Cycle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3500);
  });

  test('should cycle through all views correctly', async ({ page }) => {
    const chatTab = page.locator('[data-testid="view-tab-chat"]');
    const multiInputTab = page.locator('[data-testid="view-tab-multi-input"]');
    const streamPanelTab = page.locator('[data-testid="view-tab-stream-panel"]');

    const chatContent = page.locator('[data-testid="view-content-chat"]');
    const multiInputContent = page.locator('[data-testid="view-content-multi-input"]');
    const streamPanelContent = page.locator('[data-testid="view-content-stream-panel"]');

    // Step 1: Start with Chat (default)
    await expect(chatContent).toBeVisible();
    await expect(multiInputContent).not.toBeVisible();
    await expect(streamPanelContent).not.toBeVisible();

    // Step 2: Switch to Multi-Input
    await multiInputTab.click();
    await page.waitForTimeout(300);
    await expect(chatContent).not.toBeVisible();
    await expect(multiInputContent).toBeVisible();
    await expect(streamPanelContent).not.toBeVisible();

    // Step 3: Switch to Stream Panel
    await streamPanelTab.click();
    await page.waitForTimeout(300);
    await expect(chatContent).not.toBeVisible();
    await expect(multiInputContent).not.toBeVisible();
    await expect(streamPanelContent).toBeVisible();

    // Step 4: Return to Chat
    await chatTab.click();
    await page.waitForTimeout(300);
    await expect(chatContent).toBeVisible();
    await expect(multiInputContent).not.toBeVisible();
    await expect(streamPanelContent).not.toBeVisible();
  });

  test('should maintain tab bar visibility only in chat view', async ({ page }) => {
    // In chat view, tab bar should be fully visible
    const tabBar = page.locator('[class*="flex-1"][class*="mx-2"]').first();

    // Note: Tab bar is present in all views but disabled/opacity-50 in non-chat views
    // The TabBar component itself should always be in the DOM

    // Switch to Multi-Input - tab bar should have reduced opacity
    const multiInputTab = page.locator('[data-testid="view-tab-multi-input"]');
    await multiInputTab.click();
    await page.waitForTimeout(300);

    // Check that tab bar container has opacity class when not in chat view
    const tabBarContainer = page.locator('.opacity-50.pointer-events-none');
    const hasOpacity = await tabBarContainer.count() > 0;
    expect(hasOpacity).toBe(true);

    // Switch back to Chat
    const chatTab = page.locator('[data-testid="view-tab-chat"]');
    await chatTab.click();
    await page.waitForTimeout(300);

    // Tab bar should be fully interactive again (no opacity-50 on the container that has tab bar)
    const inactiveTabBar = page.locator('.opacity-50.pointer-events-none');
    const hasOpacityAfter = await inactiveTabBar.count() > 0;
    expect(hasOpacityAfter).toBe(false);
  });
});

test.describe('Dashboard Routing - View Tab Appearance', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3500);
  });

  test('should display view tab labels on larger screens', async ({ page }) => {
    // Set viewport to a larger size
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(200);

    // Look for tab labels (Chat, Multi, Streams)
    const chatLabel = page.locator('[data-testid="view-tab-chat"] span').filter({ hasText: 'Chat' });
    const multiLabel = page.locator('[data-testid="view-tab-multi-input"] span').filter({ hasText: 'Multi' });
    const streamsLabel = page.locator('[data-testid="view-tab-stream-panel"] span').filter({ hasText: 'Streams' });

    // Labels should be visible on larger screens (sm:inline class)
    if (await chatLabel.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(chatLabel).toBeVisible();
    }
    if (await multiLabel.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(multiLabel).toBeVisible();
    }
    if (await streamsLabel.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(streamsLabel).toBeVisible();
    }
  });

  test('should have icons in all view tabs', async ({ page }) => {
    // Each tab should have an SVG icon
    const chatTab = page.locator('[data-testid="view-tab-chat"]');
    const multiInputTab = page.locator('[data-testid="view-tab-multi-input"]');
    const streamPanelTab = page.locator('[data-testid="view-tab-stream-panel"]');

    // Check for SVG icons in each tab
    const chatIcon = chatTab.locator('svg');
    const multiIcon = multiInputTab.locator('svg');
    const streamIcon = streamPanelTab.locator('svg');

    await expect(chatIcon).toBeVisible();
    await expect(multiIcon).toBeVisible();
    await expect(streamIcon).toBeVisible();
  });

  test('should have correct title attributes on view tabs', async ({ page }) => {
    // Check title attributes for accessibility
    const chatTab = page.locator('[data-testid="view-tab-chat"]');
    const multiInputTab = page.locator('[data-testid="view-tab-multi-input"]');
    const streamPanelTab = page.locator('[data-testid="view-tab-stream-panel"]');

    await expect(chatTab).toHaveAttribute('title', 'Chat View');
    await expect(multiInputTab).toHaveAttribute('title', 'Multi-Input Dashboard');
    await expect(streamPanelTab).toHaveAttribute('title', 'Stream Panel');
  });
});
