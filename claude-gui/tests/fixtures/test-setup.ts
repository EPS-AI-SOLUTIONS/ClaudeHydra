/**
 * Playwright test fixtures for ClaudeHydra E2E tests.
 *
 * Provides auto-initialized page objects with Tauri mocks.
 * Usage: import { test, expect } from '../fixtures/test-setup';
 */

import { test as base, expect } from '@playwright/test';
import { injectTauriMocks } from './tauri-mocks';
import { createStreamSimulator, type StreamSimulator } from './stream-simulator';
import { SELECTORS, TIMEOUTS } from './test-data';

// ── Fixture Types ──────────────────────────────────────────────────────────────

interface TestFixtures {
  /** StreamSimulator instance for the current page */
  stream: StreamSimulator;
  /** Auto-initialized page with Tauri mocks injected */
  autoInit: void;
}

// ── Test Extension ─────────────────────────────────────────────────────────────

export const test = base.extend<TestFixtures>({
  // Auto-init: inject mocks and navigate to app
  autoInit: [
    async ({ page }, use) => {
      await injectTauriMocks(page);
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      // Wait for app to be ready (sidebar + content area visible)
      await page.waitForSelector(SELECTORS.sidebar.container, {
        state: 'visible',
        timeout: TIMEOUTS.long,
      });

      await use();
    },
    { auto: true },
  ],

  // Stream simulator
  stream: async ({ page }, use) => {
    const simulator = createStreamSimulator(page);
    await use(simulator);
  },
});

export { expect };

// ── Manual Setup Functions ─────────────────────────────────────────────────────

/**
 * Manual setup for tests that need custom mocks.
 */
export async function setupTest(
  page: import('@playwright/test').Page,
  mockOverrides: Record<string, unknown> = {}
): Promise<StreamSimulator> {
  await injectTauriMocks(page, mockOverrides);
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  await page.waitForSelector(SELECTORS.sidebar.container, {
    state: 'visible',
    timeout: TIMEOUTS.long,
  });

  return createStreamSimulator(page);
}

/**
 * Setup for theme tests — clears localStorage before loading.
 */
export async function setupThemeTest(
  page: import('@playwright/test').Page,
  mockOverrides: Record<string, unknown> = {}
): Promise<StreamSimulator> {
  await injectTauriMocks(page, mockOverrides);

  // Clear localStorage before the page loads
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      // Ignore if not available
    }
  });

  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  await page.waitForSelector(SELECTORS.sidebar.container, {
    state: 'visible',
    timeout: TIMEOUTS.long,
  });

  return createStreamSimulator(page);
}
