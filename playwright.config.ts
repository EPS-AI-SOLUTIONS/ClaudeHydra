import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['list']],
  timeout: 30_000,
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.05 },
  },
  use: {
    baseURL: 'http://localhost:5199',
    trace: 'on-first-retry',
    actionTimeout: 10_000,
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5199',
    reuseExistingServer: !process.env.CI,
  },
});
