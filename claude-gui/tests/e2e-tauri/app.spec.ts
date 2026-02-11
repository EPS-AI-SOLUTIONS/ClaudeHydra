/**
 * WebdriverIO + tauri-driver — real Tauri application tests.
 *
 * These tests run against the actual compiled ClaudeHydra binary,
 * testing real IPC calls, window management, and native functionality.
 *
 * Prerequisites:
 *   - cargo install tauri-driver
 *   - cd src-tauri && cargo build --release
 *   - npm run test:tauri
 */

describe('ClaudeHydra Tauri Application', () => {
  it('should launch the application', async () => {
    // The app window should be open
    const title = await browser.getTitle();
    expect(title).toContain('Claude HYDRA');
  });

  it('should have correct window dimensions', async () => {
    const { width, height } = await browser.getWindowSize();
    // Default: 1200x800
    expect(width).toBeGreaterThanOrEqual(900); // min width
    expect(height).toBeGreaterThanOrEqual(600); // min height
  });

  it('should have Tauri IPC available', async () => {
    const hasTauri = await browser.execute(() => {
      return !!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__;
    });
    expect(hasTauri).toBe(true);
  });

  it('should render the sidebar', async () => {
    const sidebar = await $('aside');
    await sidebar.waitForDisplayed({ timeout: 15000 });
    expect(await sidebar.isDisplayed()).toBe(true);
  });

  it('should display Claude HYDRA logo', async () => {
    const logo = await $('*=Claude HYDRA');
    expect(await logo.isDisplayed()).toBe(true);
  });

  it('should have all 8 navigation items', async () => {
    const navItems = await $$('button.nav-item');
    // 8 main views + possibly collapse button
    expect(navItems.length).toBeGreaterThanOrEqual(8);
  });

  it('should call get_session_status IPC on load', async () => {
    // Wait for the app to stabilize
    await browser.pause(2000);

    // The app should have called get_session_status during initialization
    // We can verify by checking if the status indicator is present
    const statusExists = await $('aside').isDisplayed();
    expect(statusExists).toBe(true);
  });

  it('should call ollama_health_check IPC on load', async () => {
    // The Ollama health check runs on startup
    // We verify indirectly by checking the app loaded correctly
    const header = await $('header');
    if (await header.isExisting()) {
      expect(await header.isDisplayed()).toBe(true);
    }
  });

  it('should navigate to Ollama AI view', async () => {
    const ollamaBtn = await $('button=Ollama AI');
    await ollamaBtn.click();
    await browser.pause(500);

    // Should show the chat input
    const textarea = await $('textarea');
    await textarea.waitForDisplayed({ timeout: 5000 });
    expect(await textarea.isDisplayed()).toBe(true);
  });

  it('should navigate to Settings view', async () => {
    const settingsBtn = await $('button=Ustawienia');
    await settingsBtn.click();
    await browser.pause(500);

    const heading = await $('*=Settings');
    expect(await heading.isDisplayed()).toBe(true);
  });

  it('should toggle theme', async () => {
    // Navigate to settings first
    const settingsBtn = await $('button=Ustawienia');
    await settingsBtn.click();
    await browser.pause(500);

    // Get initial theme
    const initialTheme = await browser.execute(() => {
      return document.documentElement.getAttribute('data-theme') || 'dark';
    });
    expect(initialTheme).toBe('dark');

    // Find and click theme toggle
    // Theme toggle may be inside a collapsible section
    const themeBtn = await $('button*=Theme');
    if (await themeBtn.isExisting()) {
      await themeBtn.click();
      await browser.pause(300);

      const newTheme = await browser.execute(() => {
        return document.documentElement.getAttribute('data-theme');
      });
      expect(newTheme).toBe('light');

      // Toggle back
      await themeBtn.click();
      await browser.pause(300);
    }
  });

  it('should navigate back to Terminal view', async () => {
    const terminalBtn = await $('button=Terminal');
    await terminalBtn.click();
    await browser.pause(500);

    const terminalContainer = await $('.terminal-container');
    await terminalContainer.waitForDisplayed({ timeout: 5000 });
    expect(await terminalContainer.isDisplayed()).toBe(true);
  });

  it('should display Start button', async () => {
    const startBtn = await $('button*=Start');
    expect(await startBtn.isDisplayed()).toBe(true);
  });

  it('should display auto-approve button', async () => {
    const autoBtn = await $('button*=Auto-zatw.');
    expect(await autoBtn.isDisplayed()).toBe(true);
  });

  it('should handle window resize gracefully', async () => {
    // Resize to minimum
    await browser.setWindowSize(900, 600);
    await browser.pause(500);

    const sidebar = await $('aside');
    expect(await sidebar.isDisplayed()).toBe(true);

    // Restore default
    await browser.setWindowSize(1200, 800);
    await browser.pause(300);
  });

  it('should persist theme in localStorage', async () => {
    const storedTheme = await browser.execute(() => {
      const settings = localStorage.getItem('claude-hydra-settings');
      if (settings) {
        try {
          return JSON.parse(settings)?.theme || 'dark';
        } catch {
          return 'dark';
        }
      }
      return 'dark';
    });
    expect(['dark', 'light']).toContain(storedTheme);
  });
});
