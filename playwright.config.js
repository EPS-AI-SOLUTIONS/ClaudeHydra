// @ts-check
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30000,

  /* Configure projects */
  projects: [
    // Dashboard tests (require web server)
    {
      name: 'dashboard',
      testMatch: '**/dashboard.spec.js',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:8080',
        trace: 'on-first-retry',
      },
    },
    // CLI tests (no web server needed)
    {
      name: 'cli',
      testMatch: '**/cli.spec.js',
      use: {
        // CLI tests don't need a browser
      },
    },
  ],

  /* Run your local dev server before starting the dashboard tests */
  webServer: {
    command: 'node scripts/mock-dashboard-server.js',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
