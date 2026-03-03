/**
 * Home view E2E tests for ClaudeHydra-v4.
 * Verifies the glass card, title, subtitle, badges, and CTA button.
 */

import { test, expect } from './fixtures/base.fixture';
import { HomePage } from './pages/HomePage';
import { SEL } from './selectors/constants';

test.describe('Home View', () => {
  let home: HomePage;

  test.beforeEach(async ({ page }) => {
    home = new HomePage(page);
    await home.waitForVisible();
  });

  // ── Layout ──────────────────────────────────────────────────────────

  test('should display the glass card container', async ({ page }) => {
    await expect(page.locator('[data-testid="welcome-hero"]')).toBeVisible();
  });

  // ── Title & subtitle ───────────────────────────────────────────────

  test('should show ClaudeHydra title', async ({ page }) => {
    await expect(page.locator('text=ClaudeHydra').first()).toBeVisible();
  });

  test('should show "AI Swarm Control Center" subtitle', async ({ page }) => {
    await expect(page.locator('text=AI Swarm Control Center').first()).toBeVisible();
  });

  // ── Feature badges ─────────────────────────────────────────────────

  test('should show 4 feature badges', async ({ page }) => {
    const expectedBadges = [
      '12 Agents',
      'Claude API',
      'MCP Integration',
      'Streaming Chat',
    ];

    for (const label of expectedBadges) {
      await expect(page.locator(`text=${label}`).first()).toBeVisible();
    }
  });

  // ── CTA buttons ────────────────────────────────────────────────────

  test('should have visible CTA Start Chat button', async ({ page }) => {
    const startChatBtn = page.locator('[data-testid="btn-new-chat"]');
    await expect(startChatBtn).toBeVisible();
    await expect(startChatBtn).toBeEnabled();
    await expect(startChatBtn).toContainText('Start Chat');
  });
});
