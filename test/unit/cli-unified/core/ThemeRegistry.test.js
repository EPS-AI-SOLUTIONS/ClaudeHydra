/**
 * Theme Registry Tests
 * @module test/unit/cli-unified/core/ThemeRegistry.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  HydraTheme,
  MinimalTheme,
  NeonTheme,
  MonokaiTheme,
  DraculaTheme,
  WitcherTheme,
  CyberpunkTheme,
  ThemeRegistry,
  getTheme,
  getAvailableThemes,
  supportsUnicode,
  getAutoTheme,
  themeRegistry
} from '../../../../src/cli-unified/core/ThemeRegistry.js';

describe('Theme Registry', () => {
  let registry;

  beforeEach(() => {
    registry = new ThemeRegistry();
  });

  // ===========================================================================
  // Theme Definitions Tests
  // ===========================================================================

  describe('Theme Definitions', () => {
    const themes = [
      ['HydraTheme', HydraTheme, 'hydra'],
      ['MinimalTheme', MinimalTheme, 'minimal'],
      ['NeonTheme', NeonTheme, 'neon'],
      ['MonokaiTheme', MonokaiTheme, 'monokai'],
      ['DraculaTheme', DraculaTheme, 'dracula'],
      ['WitcherTheme', WitcherTheme, 'witcher'],
      ['CyberpunkTheme', CyberpunkTheme, 'cyberpunk']
    ];

    themes.forEach(([themeName, theme, expectedName]) => {
      describe(themeName, () => {
        it(`should have name "${expectedName}"`, () => {
          expect(theme.name).toBe(expectedName);
        });

        it('should have colors object', () => {
          expect(theme.colors).toBeDefined();
          expect(typeof theme.colors).toBe('object');
        });

        it('should have required color properties', () => {
          expect(theme.colors.primary).toBeDefined();
          expect(theme.colors.secondary).toBeDefined();
          expect(theme.colors.success).toBeDefined();
          expect(theme.colors.error).toBeDefined();
          expect(theme.colors.warning).toBeDefined();
          expect(theme.colors.info).toBeDefined();
          expect(theme.colors.dim).toBeDefined();
          expect(theme.colors.highlight).toBeDefined();
          expect(theme.colors.prompt).toBeDefined();
          expect(theme.colors.border).toBeDefined();
        });

        it('should have symbols object', () => {
          expect(theme.symbols).toBeDefined();
          expect(typeof theme.symbols).toBe('object');
        });

        it('should have required symbol properties', () => {
          expect(theme.symbols.prompt).toBeDefined();
          expect(theme.symbols.check).toBeDefined();
          expect(theme.symbols.cross).toBeDefined();
          expect(theme.symbols.warning).toBeDefined();
          expect(theme.symbols.info).toBeDefined();
        });

        it('should have box property', () => {
          expect(theme.box).toBeDefined();
        });

        it('should have spinner array', () => {
          expect(Array.isArray(theme.spinner)).toBe(true);
          expect(theme.spinner.length).toBeGreaterThan(0);
        });

        it('should have spinnerType', () => {
          expect(theme.spinnerType).toBeDefined();
          expect(typeof theme.spinnerType).toBe('string');
        });
      });
    });
  });

  // ===========================================================================
  // ThemeRegistry Class Tests
  // ===========================================================================

  describe('ThemeRegistry', () => {
    describe('constructor', () => {
      it('should initialize with HydraTheme as default', () => {
        expect(registry.current).toBe(HydraTheme);
      });

      it('should initialize with empty custom themes', () => {
        expect(registry.custom.size).toBe(0);
      });
    });

    describe('get()', () => {
      it('should return HydraTheme for "hydra"', () => {
        expect(registry.get('hydra')).toBe(HydraTheme);
      });

      it('should return MinimalTheme for "minimal"', () => {
        expect(registry.get('minimal')).toBe(MinimalTheme);
      });

      it('should return NeonTheme for "neon"', () => {
        expect(registry.get('neon')).toBe(NeonTheme);
      });

      it('should return MonokaiTheme for "monokai"', () => {
        expect(registry.get('monokai')).toBe(MonokaiTheme);
      });

      it('should return DraculaTheme for "dracula"', () => {
        expect(registry.get('dracula')).toBe(DraculaTheme);
      });

      it('should return WitcherTheme for "witcher"', () => {
        expect(registry.get('witcher')).toBe(WitcherTheme);
      });

      it('should return CyberpunkTheme for "cyberpunk"', () => {
        expect(registry.get('cyberpunk')).toBe(CyberpunkTheme);
      });

      it('should return HydraTheme for unknown theme', () => {
        expect(registry.get('unknown')).toBe(HydraTheme);
      });

      it('should return custom theme if registered', () => {
        const customTheme = { name: 'custom', colors: {}, symbols: {} };
        registry.custom.set('custom', customTheme);

        expect(registry.get('custom')).toBe(customTheme);
      });

      it('should prioritize custom theme over built-in', () => {
        const customHydra = { name: 'hydra-custom', colors: {}, symbols: {} };
        registry.custom.set('hydra', customHydra);

        expect(registry.get('hydra')).toBe(customHydra);
      });
    });

    describe('set()', () => {
      it('should set current theme', () => {
        registry.set('minimal');

        expect(registry.current).toBe(MinimalTheme);
      });

      it('should return the set theme', () => {
        const result = registry.set('neon');

        expect(result).toBe(NeonTheme);
      });

      it('should default to HydraTheme for unknown theme', () => {
        registry.set('nonexistent');

        expect(registry.current).toBe(HydraTheme);
      });
    });

    describe('register()', () => {
      it('should register custom theme', () => {
        const customTheme = {
          name: 'myTheme',
          colors: { primary: 'red' },
          symbols: { prompt: '>' }
        };

        registry.register('myTheme', customTheme);

        expect(registry.custom.has('myTheme')).toBe(true);
      });

      it('should merge with HydraTheme by default', () => {
        const customTheme = {
          name: 'myTheme',
          colors: { primary: 'red' }
        };

        registry.register('myTheme', customTheme);
        const registered = registry.custom.get('myTheme');

        // Should have colors from HydraTheme merged with custom
        expect(registered.colors.primary).toBe('red');
        expect(registered.colors.secondary).toBe(HydraTheme.colors.secondary);
        expect(registered.symbols).toBeDefined();
      });

      it('should extend from specified base theme', () => {
        const customTheme = {
          name: 'myTheme',
          extends: 'minimal',
          colors: { primary: 'blue' }
        };

        registry.register('myTheme', customTheme);
        const registered = registry.custom.get('myTheme');

        expect(registered.colors.primary).toBe('blue');
        expect(registered.box).toBe(MinimalTheme.box);
      });
    });

    describe('list()', () => {
      it('should return all built-in theme names', () => {
        const names = registry.list();

        expect(names).toContain('hydra');
        expect(names).toContain('minimal');
        expect(names).toContain('neon');
        expect(names).toContain('monokai');
        expect(names).toContain('dracula');
        expect(names).toContain('witcher');
        expect(names).toContain('cyberpunk');
      });

      it('should include custom themes', () => {
        registry.register('custom1', { name: 'custom1' });
        registry.register('custom2', { name: 'custom2' });

        const names = registry.list();

        expect(names).toContain('custom1');
        expect(names).toContain('custom2');
      });
    });

    describe('getCurrent()', () => {
      it('should return current theme', () => {
        expect(registry.getCurrent()).toBe(HydraTheme);

        registry.set('neon');
        expect(registry.getCurrent()).toBe(NeonTheme);
      });
    });
  });

  // ===========================================================================
  // Utility Functions Tests
  // ===========================================================================

  describe('Utility Functions', () => {
    describe('getTheme()', () => {
      it('should return theme by name', () => {
        expect(getTheme('hydra')).toBe(HydraTheme);
        expect(getTheme('minimal')).toBe(MinimalTheme);
      });

      it('should return HydraTheme for unknown name', () => {
        expect(getTheme('unknown')).toBe(HydraTheme);
      });
    });

    describe('getAvailableThemes()', () => {
      it('should return array of theme names', () => {
        const themes = getAvailableThemes();

        expect(Array.isArray(themes)).toBe(true);
        expect(themes).toContain('hydra');
        expect(themes).toContain('minimal');
        expect(themes).toContain('neon');
        expect(themes).toContain('monokai');
        expect(themes).toContain('dracula');
        expect(themes).toContain('witcher');
        expect(themes).toContain('cyberpunk');
      });

      it('should return 7 built-in themes', () => {
        expect(getAvailableThemes().length).toBe(7);
      });
    });

    describe('supportsUnicode()', () => {
      it('should return boolean', () => {
        const result = supportsUnicode();

        expect(typeof result).toBe('boolean');
      });
    });

    describe('getAutoTheme()', () => {
      it('should return HydraTheme or MinimalTheme', () => {
        const theme = getAutoTheme();

        expect([HydraTheme, MinimalTheme]).toContain(theme);
      });

      it('should return theme with correct structure', () => {
        const theme = getAutoTheme();

        expect(theme.name).toBeDefined();
        expect(theme.colors).toBeDefined();
        expect(theme.symbols).toBeDefined();
        expect(theme.box).toBeDefined();
        expect(theme.spinner).toBeDefined();
      });
    });
  });

  // ===========================================================================
  // Singleton Tests
  // ===========================================================================

  describe('themeRegistry singleton', () => {
    it('should be a ThemeRegistry instance', () => {
      expect(themeRegistry).toBeInstanceOf(ThemeRegistry);
    });

    it('should have all ThemeRegistry methods', () => {
      expect(typeof themeRegistry.get).toBe('function');
      expect(typeof themeRegistry.set).toBe('function');
      expect(typeof themeRegistry.register).toBe('function');
      expect(typeof themeRegistry.list).toBe('function');
      expect(typeof themeRegistry.getCurrent).toBe('function');
    });
  });
});
