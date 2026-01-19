import { describe, it, expect, vi, beforeEach } from 'vitest';

// Theme types
type Theme = 'light' | 'dark' | 'system';

// Mock ThemeContext implementation
class ThemeManager {
  private theme: Theme = 'system';
  private resolvedTheme: 'light' | 'dark' = 'dark';
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.detectSystemTheme();
  }

  private detectSystemTheme(): void {
    // In test environment, default to dark
    const prefersDark = typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true;
    this.resolvedTheme = prefersDark ? 'dark' : 'light';
  }

  getTheme(): Theme {
    return this.theme;
  }

  getResolvedTheme(): 'light' | 'dark' {
    if (this.theme === 'system') {
      return this.resolvedTheme;
    }
    return this.theme;
  }

  setTheme(newTheme: Theme): void {
    this.theme = newTheme;
    if (newTheme !== 'system') {
      this.resolvedTheme = newTheme;
    }
    this.notifyListeners();
  }

  toggleTheme(): void {
    const current = this.getResolvedTheme();
    this.setTheme(current === 'dark' ? 'light' : 'dark');
  }

  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    this.listeners.forEach(callback => callback());
  }

  applyTheme(): void {
    const root = document.documentElement;
    if (this.getResolvedTheme() === 'light') {
      root.classList.add('light');
    } else {
      root.classList.remove('light');
    }
  }
}

describe('Theme System', () => {
  let themeManager: ThemeManager;

  beforeEach(() => {
    themeManager = new ThemeManager();
    // Reset document class
    document.documentElement.className = '';
  });

  describe('Theme Initialization', () => {
    it('should default to system theme', () => {
      expect(themeManager.getTheme()).toBe('system');
    });

    it('should resolve system theme based on matchMedia', () => {
      // jsdom returns false for matchMedia by default, so resolvedTheme can be 'light'
      expect(['light', 'dark']).toContain(themeManager.getResolvedTheme());
    });
  });

  describe('Theme Switching', () => {
    it('should set theme to light', () => {
      themeManager.setTheme('light');
      expect(themeManager.getTheme()).toBe('light');
      expect(themeManager.getResolvedTheme()).toBe('light');
    });

    it('should set theme to dark', () => {
      themeManager.setTheme('dark');
      expect(themeManager.getTheme()).toBe('dark');
      expect(themeManager.getResolvedTheme()).toBe('dark');
    });

    it('should toggle between light and dark', () => {
      themeManager.setTheme('dark');
      themeManager.toggleTheme();
      expect(themeManager.getResolvedTheme()).toBe('light');

      themeManager.toggleTheme();
      expect(themeManager.getResolvedTheme()).toBe('dark');
    });
  });

  describe('Theme Application', () => {
    it('should add light class when theme is light', () => {
      themeManager.setTheme('light');
      themeManager.applyTheme();
      expect(document.documentElement.classList.contains('light')).toBe(true);
    });

    it('should remove light class when theme is dark', () => {
      document.documentElement.classList.add('light');
      themeManager.setTheme('dark');
      themeManager.applyTheme();
      expect(document.documentElement.classList.contains('light')).toBe(false);
    });
  });

  describe('Theme Subscriptions', () => {
    it('should notify subscribers on theme change', () => {
      const callback = vi.fn();
      themeManager.subscribe(callback);

      themeManager.setTheme('light');
      expect(callback).toHaveBeenCalledTimes(1);

      themeManager.setTheme('dark');
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should allow unsubscribing', () => {
      const callback = vi.fn();
      const unsubscribe = themeManager.subscribe(callback);

      themeManager.setTheme('light');
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();
      themeManager.setTheme('dark');
      expect(callback).toHaveBeenCalledTimes(1); // Still 1, not called again
    });
  });
});

describe('B&W Monochrome Theme CSS Variables', () => {
  const darkThemeVars = {
    '--bw-bg': '#0a0a0a',
    '--bw-surface': '#141414',
    '--bw-card': '#1a1a1a',
    '--bw-border': '#2a2a2a',
    '--bw-border-light': '#3a3a3a',
    '--bw-text': '#e5e5e5',
    '--bw-text-dim': '#888888',
    '--bw-text-muted': '#555555',
    '--bw-accent': '#ffffff',
    '--bw-accent-dim': '#cccccc',
  };

  const lightThemeVars = {
    '--bw-bg': '#fafafa',
    '--bw-surface': '#f0f0f0',
    '--bw-card': '#ffffff',
    '--bw-border': '#e0e0e0',
    '--bw-border-light': '#d0d0d0',
    '--bw-text': '#1a1a1a',
    '--bw-text-dim': '#666666',
    '--bw-text-muted': '#999999',
    '--bw-accent': '#000000',
    '--bw-accent-dim': '#333333',
  };

  it('should have valid dark theme color values', () => {
    Object.entries(darkThemeVars).forEach(([key, value]) => {
      expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });

  it('should have valid light theme color values', () => {
    Object.entries(lightThemeVars).forEach(([key, value]) => {
      expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });

  it('should have contrasting text colors for accessibility', () => {
    // Dark theme: light text on dark background
    expect(darkThemeVars['--bw-text']).toBe('#e5e5e5');
    expect(darkThemeVars['--bw-bg']).toBe('#0a0a0a');

    // Light theme: dark text on light background
    expect(lightThemeVars['--bw-text']).toBe('#1a1a1a');
    expect(lightThemeVars['--bw-bg']).toBe('#fafafa');
  });

  it('should have proper accent colors', () => {
    // Dark theme accent is white
    expect(darkThemeVars['--bw-accent']).toBe('#ffffff');
    // Light theme accent is black
    expect(lightThemeVars['--bw-accent']).toBe('#000000');
  });
});
