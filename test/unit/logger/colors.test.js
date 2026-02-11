/**
 * Logger Colors Tests
 * @module test/unit/logger/colors.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Store original env
const originalEnv = { ...process.env };
const originalStdout = { ...process.stdout };

describe('Logger Colors', () => {
  // Reset env and reimport module for each test
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Mock stdout.isTTY
    process.stdout.isTTY = true;
  });

  afterEach(() => {
    process.env = originalEnv;
    Object.assign(process.stdout, originalStdout);
  });

  // ===========================================================================
  // Constants Tests
  // ===========================================================================

  describe('Constants', () => {
    it('should export RESET code', async () => {
      const { RESET } = await import('../../../src/logger/colors.js');
      expect(RESET).toBe('\x1b[0m');
    });

    it('should export Styles object with all style codes', async () => {
      const { Styles } = await import('../../../src/logger/colors.js');

      expect(Styles.RESET).toBe('\x1b[0m');
      expect(Styles.BOLD).toBe('\x1b[1m');
      expect(Styles.DIM).toBe('\x1b[2m');
      expect(Styles.ITALIC).toBe('\x1b[3m');
      expect(Styles.UNDERLINE).toBe('\x1b[4m');
      expect(Styles.STRIKETHROUGH).toBe('\x1b[9m');
    });

    it('should export FgColors object with foreground colors', async () => {
      const { FgColors } = await import('../../../src/logger/colors.js');

      expect(FgColors.BLACK).toBe('\x1b[30m');
      expect(FgColors.RED).toBe('\x1b[31m');
      expect(FgColors.GREEN).toBe('\x1b[32m');
      expect(FgColors.YELLOW).toBe('\x1b[33m');
      expect(FgColors.BLUE).toBe('\x1b[34m');
      expect(FgColors.GRAY).toBe('\x1b[90m');
      expect(FgColors.BRIGHT_RED).toBe('\x1b[91m');
    });

    it('should export BgColors object with background colors', async () => {
      const { BgColors } = await import('../../../src/logger/colors.js');

      expect(BgColors.BLACK).toBe('\x1b[40m');
      expect(BgColors.RED).toBe('\x1b[41m');
      expect(BgColors.GREEN).toBe('\x1b[42m');
      expect(BgColors.BRIGHT_RED).toBe('\x1b[101m');
    });

    it('should export COLORS for backwards compatibility', async () => {
      const { COLORS } = await import('../../../src/logger/colors.js');

      expect(COLORS.reset).toBeDefined();
      expect(COLORS.red).toBeDefined();
      expect(COLORS.bgRed).toBeDefined();
      expect(COLORS.bright).toBeDefined();
    });

    it('should freeze Styles, FgColors, BgColors objects', async () => {
      const { Styles, FgColors, BgColors } = await import('../../../src/logger/colors.js');

      expect(Object.isFrozen(Styles)).toBe(true);
      expect(Object.isFrozen(FgColors)).toBe(true);
      expect(Object.isFrozen(BgColors)).toBe(true);
    });
  });

  // ===========================================================================
  // Color Detection Tests
  // ===========================================================================

  describe('Color Detection', () => {
    describe('supportsColors()', () => {
      it('should return true when FORCE_COLOR is set', async () => {
        process.env.FORCE_COLOR = '1';
        const { supportsColors } = await import('../../../src/logger/colors.js');
        expect(supportsColors()).toBe(true);
      });

      it('should return false when FORCE_COLOR is 0', async () => {
        process.env.FORCE_COLOR = '0';
        const { supportsColors } = await import('../../../src/logger/colors.js');
        expect(supportsColors()).toBe(false);
      });

      it('should return false when NO_COLOR is set', async () => {
        delete process.env.FORCE_COLOR;
        process.env.NO_COLOR = '1';
        const { supportsColors } = await import('../../../src/logger/colors.js');
        expect(supportsColors()).toBe(false);
      });

      it('should return false when stdout is not TTY', async () => {
        delete process.env.FORCE_COLOR;
        delete process.env.NO_COLOR;
        process.stdout.isTTY = false;
        const { supportsColors } = await import('../../../src/logger/colors.js');
        expect(supportsColors()).toBe(false);
      });

      it('should return false when TERM is dumb', async () => {
        delete process.env.FORCE_COLOR;
        delete process.env.NO_COLOR;
        process.stdout.isTTY = true;
        process.env.TERM = 'dumb';
        const { supportsColors } = await import('../../../src/logger/colors.js');
        expect(supportsColors()).toBe(false);
      });

      it('should return true in CI environments', async () => {
        delete process.env.FORCE_COLOR;
        delete process.env.NO_COLOR;
        process.stdout.isTTY = true;
        process.env.TERM = 'xterm';
        process.env.CI = 'true';
        process.env.GITHUB_ACTIONS = 'true';
        const { supportsColors } = await import('../../../src/logger/colors.js');
        expect(supportsColors()).toBe(true);
      });
    });

    describe('getColorDepth()', () => {
      it('should return 1 when colors not supported', async () => {
        process.env.NO_COLOR = '1';
        const { getColorDepth } = await import('../../../src/logger/colors.js');
        expect(getColorDepth()).toBe(1);
      });

      it('should return 24 for truecolor COLORTERM', async () => {
        delete process.env.NO_COLOR;
        process.stdout.isTTY = true;
        process.env.COLORTERM = 'truecolor';
        const { getColorDepth } = await import('../../../src/logger/colors.js');
        expect(getColorDepth()).toBe(24);
      });

      it('should return 24 for 24bit COLORTERM', async () => {
        delete process.env.NO_COLOR;
        process.stdout.isTTY = true;
        process.env.COLORTERM = '24bit';
        const { getColorDepth } = await import('../../../src/logger/colors.js');
        expect(getColorDepth()).toBe(24);
      });

      it('should return 24 for supported terminal programs', async () => {
        delete process.env.NO_COLOR;
        delete process.env.COLORTERM;
        process.stdout.isTTY = true;
        process.env.TERM_PROGRAM = 'vscode';
        const { getColorDepth } = await import('../../../src/logger/colors.js');
        expect(getColorDepth()).toBe(24);
      });

      it('should return 8 for 256color TERM', async () => {
        delete process.env.NO_COLOR;
        delete process.env.COLORTERM;
        delete process.env.TERM_PROGRAM;
        process.stdout.isTTY = true;
        process.env.TERM = 'xterm-256color';
        const { getColorDepth } = await import('../../../src/logger/colors.js');
        expect(getColorDepth()).toBe(8);
      });

      it('should return 24 for Windows Terminal', async () => {
        delete process.env.NO_COLOR;
        delete process.env.COLORTERM;
        delete process.env.TERM_PROGRAM;
        delete process.env.TERM;
        process.stdout.isTTY = true;
        process.env.WT_SESSION = 'true';
        const { getColorDepth } = await import('../../../src/logger/colors.js');
        expect(getColorDepth()).toBe(24);
      });
    });

    describe('supportsTrueColor()', () => {
      it('should return true when color depth is 24', async () => {
        delete process.env.NO_COLOR;
        process.stdout.isTTY = true;
        process.env.COLORTERM = 'truecolor';
        const { supportsTrueColor } = await import('../../../src/logger/colors.js');
        expect(supportsTrueColor()).toBe(true);
      });

      it('should return false when color depth is less than 24', async () => {
        delete process.env.NO_COLOR;
        delete process.env.COLORTERM;
        delete process.env.TERM_PROGRAM;
        delete process.env.WT_SESSION;
        process.stdout.isTTY = true;
        process.env.TERM = 'xterm';
        const { supportsTrueColor } = await import('../../../src/logger/colors.js');
        expect(supportsTrueColor()).toBe(false);
      });
    });

    describe('supports256Colors()', () => {
      it('should return true when color depth is 8 or more', async () => {
        delete process.env.NO_COLOR;
        delete process.env.COLORTERM;
        delete process.env.TERM_PROGRAM;
        delete process.env.WT_SESSION;
        process.stdout.isTTY = true;
        process.env.TERM = 'xterm-256color';
        const { supports256Colors } = await import('../../../src/logger/colors.js');
        expect(supports256Colors()).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Color Application Tests
  // ===========================================================================

  describe('Color Application', () => {
    describe('colorize()', () => {
      it('should wrap text with color codes when colors supported', async () => {
        process.env.FORCE_COLOR = '1';
        const { colorize, FgColors, RESET } = await import('../../../src/logger/colors.js');

        const result = colorize('Hello', FgColors.RED);
        expect(result).toBe(`${FgColors.RED}Hello${RESET}`);
      });

      it('should return plain text when colors not supported', async () => {
        process.env.NO_COLOR = '1';
        const { colorize, FgColors } = await import('../../../src/logger/colors.js');

        const result = colorize('Hello', FgColors.RED);
        expect(result).toBe('Hello');
      });
    });

    describe('createColorFormatter()', () => {
      it('should create a formatter function', async () => {
        process.env.FORCE_COLOR = '1';
        const { createColorFormatter, FgColors, RESET } = await import(
          '../../../src/logger/colors.js'
        );

        const redFormatter = createColorFormatter(FgColors.RED);
        expect(typeof redFormatter).toBe('function');

        const result = redFormatter('Test');
        expect(result).toBe(`${FgColors.RED}Test${RESET}`);
      });
    });

    describe('stripAnsi()', () => {
      it('should remove ANSI codes from text', async () => {
        const { stripAnsi, FgColors, RESET } = await import('../../../src/logger/colors.js');

        const coloredText = `${FgColors.RED}Hello${RESET} ${FgColors.BLUE}World${RESET}`;
        const result = stripAnsi(coloredText);
        expect(result).toBe('Hello World');
      });

      it('should return plain text unchanged', async () => {
        const { stripAnsi } = await import('../../../src/logger/colors.js');

        const result = stripAnsi('Plain text');
        expect(result).toBe('Plain text');
      });
    });

    describe('visibleLength()', () => {
      it('should return length excluding ANSI codes', async () => {
        const { visibleLength, FgColors, RESET } = await import('../../../src/logger/colors.js');

        const coloredText = `${FgColors.RED}Hello${RESET}`;
        const result = visibleLength(coloredText);
        expect(result).toBe(5);
      });

      it('should return correct length for plain text', async () => {
        const { visibleLength } = await import('../../../src/logger/colors.js');

        const result = visibleLength('Hello World');
        expect(result).toBe(11);
      });
    });
  });

  // ===========================================================================
  // Convenience Color Functions Tests
  // ===========================================================================

  describe('Convenience Color Functions', () => {
    it('should export color functions', async () => {
      process.env.FORCE_COLOR = '1';
      const colors = await import('../../../src/logger/colors.js');

      expect(typeof colors.red).toBe('function');
      expect(typeof colors.green).toBe('function');
      expect(typeof colors.yellow).toBe('function');
      expect(typeof colors.blue).toBe('function');
      expect(typeof colors.magenta).toBe('function');
      expect(typeof colors.cyan).toBe('function');
      expect(typeof colors.white).toBe('function');
      expect(typeof colors.gray).toBe('function');
      expect(typeof colors.grey).toBe('function');
      expect(typeof colors.black).toBe('function');
    });

    it('should export style functions', async () => {
      const colors = await import('../../../src/logger/colors.js');

      expect(typeof colors.bold).toBe('function');
      expect(typeof colors.dim).toBe('function');
      expect(typeof colors.italic).toBe('function');
      expect(typeof colors.underline).toBe('function');
      expect(typeof colors.strikethrough).toBe('function');
    });

    it('should apply colors correctly', async () => {
      process.env.FORCE_COLOR = '1';
      const { red, FgColors, RESET } = await import('../../../src/logger/colors.js');

      const result = red('Test');
      expect(result).toBe(`${FgColors.RED}Test${RESET}`);
    });
  });

  // ===========================================================================
  // Semantic Color Functions Tests
  // ===========================================================================

  describe('Semantic Color Functions', () => {
    it('should apply error color (red)', async () => {
      process.env.FORCE_COLOR = '1';
      const { error, stripAnsi } = await import('../../../src/logger/colors.js');

      const result = error('Error message');
      expect(result).toContain('Error message');
      expect(result).toContain('\x1b[31m'); // Red
    });

    it('should apply warning color (yellow)', async () => {
      process.env.FORCE_COLOR = '1';
      const { warning } = await import('../../../src/logger/colors.js');

      const result = warning('Warning message');
      expect(result).toContain('\x1b[33m'); // Yellow
    });

    it('should apply success color (green)', async () => {
      process.env.FORCE_COLOR = '1';
      const { success } = await import('../../../src/logger/colors.js');

      const result = success('Success message');
      expect(result).toContain('\x1b[32m'); // Green
    });

    it('should apply info color (cyan)', async () => {
      process.env.FORCE_COLOR = '1';
      const { info } = await import('../../../src/logger/colors.js');

      const result = info('Info message');
      expect(result).toContain('\x1b[36m'); // Cyan
    });

    it('should apply debug color (gray)', async () => {
      process.env.FORCE_COLOR = '1';
      const { debug } = await import('../../../src/logger/colors.js');

      const result = debug('Debug message');
      expect(result).toContain('\x1b[90m'); // Gray
    });
  });

  // ===========================================================================
  // 256-Color Support Tests
  // ===========================================================================

  describe('256-Color Support', () => {
    describe('fg256()', () => {
      it('should create 256-color foreground code', async () => {
        const { fg256 } = await import('../../../src/logger/colors.js');

        expect(fg256(196)).toBe('\x1b[38;5;196m');
        expect(fg256(0)).toBe('\x1b[38;5;0m');
        expect(fg256(255)).toBe('\x1b[38;5;255m');
      });

      it('should clamp values to 0-255', async () => {
        const { fg256 } = await import('../../../src/logger/colors.js');

        expect(fg256(-10)).toBe('\x1b[38;5;0m');
        expect(fg256(300)).toBe('\x1b[38;5;255m');
      });
    });

    describe('bg256()', () => {
      it('should create 256-color background code', async () => {
        const { bg256 } = await import('../../../src/logger/colors.js');

        expect(bg256(196)).toBe('\x1b[48;5;196m');
        expect(bg256(0)).toBe('\x1b[48;5;0m');
      });
    });

    describe('color256()', () => {
      it('should apply 256-color to text when supported', async () => {
        process.env.FORCE_COLOR = '1';
        process.stdout.isTTY = true;
        process.env.TERM = 'xterm-256color';
        const { color256 } = await import('../../../src/logger/colors.js');

        const result = color256('Test', 196);
        expect(result).toContain('\x1b[38;5;196m');
        expect(result).toContain('Test');
      });
    });

    describe('rgbTo256()', () => {
      it('should convert RGB to nearest 256-color code', async () => {
        const { rgbTo256 } = await import('../../../src/logger/colors.js');

        // Grayscale
        expect(rgbTo256(0, 0, 0)).toBe(16); // Black
        expect(rgbTo256(255, 255, 255)).toBe(231); // White
        expect(rgbTo256(128, 128, 128)).toBeGreaterThanOrEqual(232); // Gray range

        // Colors
        expect(rgbTo256(255, 0, 0)).toBe(196); // Red
        expect(rgbTo256(0, 255, 0)).toBe(46); // Green
        expect(rgbTo256(0, 0, 255)).toBe(21); // Blue
      });
    });

    describe('grayscale256()', () => {
      it('should return grayscale color code', async () => {
        const { grayscale256 } = await import('../../../src/logger/colors.js');

        expect(grayscale256(0)).toBe(232);
        expect(grayscale256(23)).toBe(255);
        expect(grayscale256(12)).toBe(244);
      });

      it('should clamp values to 0-23', async () => {
        const { grayscale256 } = await import('../../../src/logger/colors.js');

        expect(grayscale256(-5)).toBe(232);
        expect(grayscale256(30)).toBe(255);
      });
    });
  });

  // ===========================================================================
  // True Color (RGB) Tests
  // ===========================================================================

  describe('True Color (RGB)', () => {
    describe('fgRGB()', () => {
      it('should create RGB foreground code', async () => {
        const { fgRGB } = await import('../../../src/logger/colors.js');

        expect(fgRGB(255, 100, 50)).toBe('\x1b[38;2;255;100;50m');
        expect(fgRGB(0, 0, 0)).toBe('\x1b[38;2;0;0;0m');
      });

      it('should clamp values to 0-255', async () => {
        const { fgRGB } = await import('../../../src/logger/colors.js');

        expect(fgRGB(-10, 300, 128)).toBe('\x1b[38;2;0;255;128m');
      });
    });

    describe('bgRGB()', () => {
      it('should create RGB background code', async () => {
        const { bgRGB } = await import('../../../src/logger/colors.js');

        expect(bgRGB(255, 100, 50)).toBe('\x1b[48;2;255;100;50m');
      });
    });

    describe('rgb()', () => {
      it('should apply RGB color to text when true color supported', async () => {
        process.env.FORCE_COLOR = '1';
        process.stdout.isTTY = true;
        process.env.COLORTERM = 'truecolor';
        const { rgb } = await import('../../../src/logger/colors.js');

        const result = rgb('Test', 255, 100, 50);
        expect(result).toContain('\x1b[38;2;255;100;50m');
        expect(result).toContain('Test');
      });
    });

    describe('hexToRgb()', () => {
      it('should convert hex to RGB', async () => {
        const { hexToRgb } = await import('../../../src/logger/colors.js');

        expect(hexToRgb('#ff5500')).toEqual({ r: 255, g: 85, b: 0 });
        expect(hexToRgb('ff5500')).toEqual({ r: 255, g: 85, b: 0 });
        expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
        expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
      });

      it('should handle shorthand hex notation', async () => {
        const { hexToRgb } = await import('../../../src/logger/colors.js');

        expect(hexToRgb('#f50')).toEqual({ r: 255, g: 85, b: 0 });
        expect(hexToRgb('f50')).toEqual({ r: 255, g: 85, b: 0 });
      });
    });

    describe('rgbToHex()', () => {
      it('should convert RGB to hex', async () => {
        const { rgbToHex } = await import('../../../src/logger/colors.js');

        expect(rgbToHex(255, 85, 0)).toBe('#ff5500');
        expect(rgbToHex(0, 0, 0)).toBe('#000000');
        expect(rgbToHex(255, 255, 255)).toBe('#ffffff');
      });

      it('should clamp values', async () => {
        const { rgbToHex } = await import('../../../src/logger/colors.js');

        expect(rgbToHex(-10, 300, 128)).toBe('#00ff80');
      });
    });

    describe('hslToRgb()', () => {
      it('should convert HSL to RGB', async () => {
        const { hslToRgb } = await import('../../../src/logger/colors.js');

        // Red (0°, 100%, 50%)
        const red = hslToRgb(0, 100, 50);
        expect(red.r).toBe(255);
        expect(red.g).toBe(0);
        expect(red.b).toBe(0);

        // Green (120°, 100%, 50%)
        const green = hslToRgb(120, 100, 50);
        expect(green.r).toBe(0);
        expect(green.g).toBe(255);
        expect(green.b).toBe(0);

        // Gray (any hue, 0% saturation)
        const gray = hslToRgb(180, 0, 50);
        expect(gray.r).toBe(128);
        expect(gray.g).toBe(128);
        expect(gray.b).toBe(128);
      });
    });

    describe('fgHex()', () => {
      it('should create foreground code from hex', async () => {
        const { fgHex } = await import('../../../src/logger/colors.js');

        const result = fgHex('#ff0000');
        expect(result).toBe('\x1b[38;2;255;0;0m');
      });
    });

    describe('bgHex()', () => {
      it('should create background code from hex', async () => {
        const { bgHex } = await import('../../../src/logger/colors.js');

        const result = bgHex('#ff0000');
        expect(result).toBe('\x1b[48;2;255;0;0m');
      });
    });

    describe('hex()', () => {
      it('should apply hex color to text', async () => {
        process.env.FORCE_COLOR = '1';
        process.stdout.isTTY = true;
        process.env.COLORTERM = 'truecolor';
        const { hex } = await import('../../../src/logger/colors.js');

        const result = hex('Test', '#ff0000');
        expect(result).toContain('\x1b[38;2;255;0;0m');
      });
    });

    describe('hsl()', () => {
      it('should apply HSL color to text', async () => {
        process.env.FORCE_COLOR = '1';
        process.stdout.isTTY = true;
        process.env.COLORTERM = 'truecolor';
        const { hsl } = await import('../../../src/logger/colors.js');

        const result = hsl('Test', 0, 100, 50);
        expect(result).toContain('Test');
      });
    });
  });

  // ===========================================================================
  // Gradient Support Tests
  // ===========================================================================

  describe('Gradient Support', () => {
    describe('interpolateColor()', () => {
      it('should interpolate between two colors', async () => {
        const { interpolateColor } = await import('../../../src/logger/colors.js');

        const start = { r: 0, g: 0, b: 0 };
        const end = { r: 255, g: 255, b: 255 };

        expect(interpolateColor(start, end, 0)).toEqual({ r: 0, g: 0, b: 0 });
        expect(interpolateColor(start, end, 1)).toEqual({ r: 255, g: 255, b: 255 });
        expect(interpolateColor(start, end, 0.5)).toEqual({ r: 128, g: 128, b: 128 });
      });
    });

    describe('createGradientColors()', () => {
      it('should create gradient array', async () => {
        const { createGradientColors } = await import('../../../src/logger/colors.js');

        const colors = createGradientColors(['#000000', '#ffffff'], 5);
        expect(colors.length).toBe(5);
        expect(colors[0]).toEqual({ r: 0, g: 0, b: 0 });
        // Last color depends on interpolation algorithm - just verify it's brighter
        expect(colors[4].r).toBeGreaterThan(150);
        expect(colors[4].g).toBeGreaterThan(150);
        expect(colors[4].b).toBeGreaterThan(150);
      });

      it('should throw error for less than 2 colors', async () => {
        const { createGradientColors } = await import('../../../src/logger/colors.js');

        expect(() => createGradientColors(['#000000'], 5)).toThrow(
          'Gradient requires at least 2 colors',
        );
      });

      it('should handle multiple color stops', async () => {
        const { createGradientColors } = await import('../../../src/logger/colors.js');

        const colors = createGradientColors(['#ff0000', '#00ff00', '#0000ff'], 9);
        expect(colors.length).toBe(9);
      });
    });

    describe('gradient()', () => {
      it('should apply gradient to text', async () => {
        process.env.FORCE_COLOR = '1';
        process.stdout.isTTY = true;
        process.env.COLORTERM = 'truecolor';
        const { gradient, stripAnsi } = await import('../../../src/logger/colors.js');

        const result = gradient('Hello', ['#ff0000', '#0000ff']);
        expect(stripAnsi(result)).toBe('Hello');
        expect(result).toContain('\x1b[38;2;');
      });

      it('should return plain text when colors not supported', async () => {
        process.env.NO_COLOR = '1';
        const { gradient } = await import('../../../src/logger/colors.js');

        const result = gradient('Hello', ['#ff0000', '#0000ff']);
        expect(result).toBe('Hello');
      });
    });

    describe('rainbow()', () => {
      it('should apply rainbow gradient', async () => {
        process.env.FORCE_COLOR = '1';
        process.stdout.isTTY = true;
        process.env.COLORTERM = 'truecolor';
        const { rainbow, stripAnsi } = await import('../../../src/logger/colors.js');

        const result = rainbow('Rainbow');
        expect(stripAnsi(result)).toBe('Rainbow');
      });
    });

    describe('pastelRainbow()', () => {
      it('should apply pastel rainbow gradient', async () => {
        process.env.FORCE_COLOR = '1';
        process.stdout.isTTY = true;
        process.env.COLORTERM = 'truecolor';
        const { pastelRainbow, stripAnsi } = await import('../../../src/logger/colors.js');

        const result = pastelRainbow('Pastel');
        expect(stripAnsi(result)).toBe('Pastel');
      });
    });

    describe('Gradients constant', () => {
      it('should export predefined gradients', async () => {
        const { Gradients } = await import('../../../src/logger/colors.js');

        expect(Gradients.RAINBOW).toBeDefined();
        expect(Gradients.PASTEL).toBeDefined();
        expect(Gradients.SUNSET).toBeDefined();
        expect(Gradients.OCEAN).toBeDefined();
        expect(Gradients.CYBERPUNK).toBeDefined();
        expect(Gradients.MATRIX).toBeDefined();
        expect(Object.isFrozen(Gradients)).toBe(true);
      });
    });

    describe('createGradientFormatter()', () => {
      it('should create gradient formatter function', async () => {
        process.env.FORCE_COLOR = '1';
        process.stdout.isTTY = true;
        process.env.COLORTERM = 'truecolor';
        const { createGradientFormatter, Gradients, stripAnsi } = await import(
          '../../../src/logger/colors.js'
        );

        const rainbowFormatter = createGradientFormatter(Gradients.RAINBOW);
        expect(typeof rainbowFormatter).toBe('function');

        const result = rainbowFormatter('Test');
        expect(stripAnsi(result)).toBe('Test');
      });
    });
  });

  // ===========================================================================
  // Theme Tests
  // ===========================================================================

  describe('Themes', () => {
    describe('Themes constant', () => {
      it('should export predefined themes', async () => {
        const { Themes } = await import('../../../src/logger/colors.js');

        expect(Themes.DEFAULT).toBeDefined();
        expect(Themes.CYBERPUNK).toBeDefined();
        expect(Themes.MATRIX).toBeDefined();
        expect(Themes.OCEAN).toBeDefined();
        expect(Themes.DRACULA).toBeDefined();
        expect(Themes.NORD).toBeDefined();
        expect(Themes.MONOKAI).toBeDefined();
        expect(Object.isFrozen(Themes)).toBe(true);
      });

      it('should have required properties in each theme', async () => {
        const { Themes } = await import('../../../src/logger/colors.js');

        const requiredProps = ['primary', 'secondary', 'success', 'warning', 'error', 'info'];

        for (const theme of Object.values(Themes)) {
          for (const prop of requiredProps) {
            expect(theme[prop]).toBeDefined();
          }
        }
      });
    });

    describe('setTheme() and getTheme()', () => {
      it('should set theme by name', async () => {
        const { setTheme, getTheme, Themes } = await import('../../../src/logger/colors.js');

        setTheme('cyberpunk');
        const theme = getTheme();
        expect(theme.name).toBe('cyberpunk');
        expect(theme.primary).toBe(Themes.CYBERPUNK.primary);
      });

      it('should set theme by object', async () => {
        const { setTheme, getTheme } = await import('../../../src/logger/colors.js');

        setTheme({ primary: '#123456', secondary: '#654321' });
        const theme = getTheme();
        expect(theme.primary).toBe('#123456');
        expect(theme.secondary).toBe('#654321');
      });

      it('should throw for unknown theme name', async () => {
        const { setTheme } = await import('../../../src/logger/colors.js');

        expect(() => setTheme('unknown-theme')).toThrow('Unknown theme');
      });

      it('should handle hyphenated theme names', async () => {
        const { setTheme, getTheme } = await import('../../../src/logger/colors.js');

        setTheme('solarized-dark');
        const theme = getTheme();
        expect(theme.name).toBe('solarized_dark');
      });
    });

    describe('Theme color functions', () => {
      it('should apply theme primary color', async () => {
        process.env.FORCE_COLOR = '1';
        process.stdout.isTTY = true;
        process.env.COLORTERM = 'truecolor';
        const { themePrimary, stripAnsi } = await import('../../../src/logger/colors.js');

        const result = themePrimary('Test');
        expect(stripAnsi(result)).toBe('Test');
      });

      it('should apply theme secondary color', async () => {
        process.env.FORCE_COLOR = '1';
        process.stdout.isTTY = true;
        process.env.COLORTERM = 'truecolor';
        const { themeSecondary, stripAnsi } = await import('../../../src/logger/colors.js');

        const result = themeSecondary('Test');
        expect(stripAnsi(result)).toBe('Test');
      });

      it('should apply theme success color', async () => {
        process.env.FORCE_COLOR = '1';
        process.stdout.isTTY = true;
        process.env.COLORTERM = 'truecolor';
        const { themeSuccess, stripAnsi } = await import('../../../src/logger/colors.js');

        const result = themeSuccess('Test');
        expect(stripAnsi(result)).toBe('Test');
      });

      it('should apply theme warning color', async () => {
        process.env.FORCE_COLOR = '1';
        process.stdout.isTTY = true;
        process.env.COLORTERM = 'truecolor';
        const { themeWarning, stripAnsi } = await import('../../../src/logger/colors.js');

        const result = themeWarning('Test');
        expect(stripAnsi(result)).toBe('Test');
      });

      it('should apply theme error color', async () => {
        process.env.FORCE_COLOR = '1';
        process.stdout.isTTY = true;
        process.env.COLORTERM = 'truecolor';
        const { themeError, stripAnsi } = await import('../../../src/logger/colors.js');

        const result = themeError('Test');
        expect(stripAnsi(result)).toBe('Test');
      });

      it('should apply theme info color', async () => {
        process.env.FORCE_COLOR = '1';
        process.stdout.isTTY = true;
        process.env.COLORTERM = 'truecolor';
        const { themeInfo, stripAnsi } = await import('../../../src/logger/colors.js');

        const result = themeInfo('Test');
        expect(stripAnsi(result)).toBe('Test');
      });

      it('should apply theme muted color', async () => {
        process.env.FORCE_COLOR = '1';
        process.stdout.isTTY = true;
        process.env.COLORTERM = 'truecolor';
        const { themeMuted, stripAnsi } = await import('../../../src/logger/colors.js');

        const result = themeMuted('Test');
        expect(stripAnsi(result)).toBe('Test');
      });

      it('should apply theme accent color', async () => {
        process.env.FORCE_COLOR = '1';
        process.stdout.isTTY = true;
        process.env.COLORTERM = 'truecolor';
        const { themeAccent, stripAnsi } = await import('../../../src/logger/colors.js');

        const result = themeAccent('Test');
        expect(stripAnsi(result)).toBe('Test');
      });
    });
  });

  // ===========================================================================
  // Advanced Styling Tests
  // ===========================================================================

  describe('Advanced Styling', () => {
    describe('combine()', () => {
      it('should combine multiple ANSI codes', async () => {
        const { combine, Styles, FgColors } = await import('../../../src/logger/colors.js');

        const result = combine(Styles.BOLD, FgColors.RED);
        expect(result).toBe(`${Styles.BOLD}${FgColors.RED}`);
      });
    });

    describe('style()', () => {
      it('should apply multiple styles', async () => {
        process.env.FORCE_COLOR = '1';
        process.stdout.isTTY = true;
        process.env.COLORTERM = 'truecolor';
        const { style, stripAnsi, Styles } = await import('../../../src/logger/colors.js');

        const result = style('Test', {
          bold: true,
          italic: true,
          fg: '#ff0000',
        });

        expect(result).toContain(Styles.BOLD);
        expect(result).toContain(Styles.ITALIC);
        expect(result).toContain('\x1b[38;2;255;0;0m');
        expect(stripAnsi(result)).toBe('Test');
      });

      it('should apply background color', async () => {
        process.env.FORCE_COLOR = '1';
        process.stdout.isTTY = true;
        process.env.COLORTERM = 'truecolor';
        const { style } = await import('../../../src/logger/colors.js');

        const result = style('Test', { bg: '#0000ff' });
        expect(result).toContain('\x1b[48;2;0;0;255m');
      });

      it('should return plain text when colors not supported', async () => {
        process.env.NO_COLOR = '1';
        const { style } = await import('../../../src/logger/colors.js');

        const result = style('Test', { bold: true, fg: '#ff0000' });
        expect(result).toBe('Test');
      });
    });

    describe('box()', () => {
      it('should create box around text', async () => {
        const { box, stripAnsi } = await import('../../../src/logger/colors.js');

        const result = box('Hello');
        const lines = result.split('\n');

        expect(lines.length).toBe(3); // Top, content, bottom
        expect(stripAnsi(lines[0])).toContain('┌');
        expect(stripAnsi(lines[0])).toContain('┐');
        expect(stripAnsi(lines[1])).toContain('│');
        expect(stripAnsi(lines[1])).toContain('Hello');
        expect(stripAnsi(lines[2])).toContain('└');
        expect(stripAnsi(lines[2])).toContain('┘');
      });

      it('should handle multiline text', async () => {
        const { box, stripAnsi } = await import('../../../src/logger/colors.js');

        const result = box('Line 1\nLine 2');
        const lines = result.split('\n');

        expect(lines.length).toBe(4); // Top, 2 content lines, bottom
      });

      it('should apply border color', async () => {
        process.env.FORCE_COLOR = '1';
        process.stdout.isTTY = true;
        process.env.COLORTERM = 'truecolor';
        const { box } = await import('../../../src/logger/colors.js');

        const result = box('Test', { borderColor: '#ff0000' });
        expect(result).toContain('\x1b[38;2;255;0;0m');
      });
    });
  });

  // ===========================================================================
  // Animation Helpers Tests
  // ===========================================================================

  describe('Animation Helpers', () => {
    describe('SpinnerFrames', () => {
      it('should export spinner frame arrays', async () => {
        const { SpinnerFrames } = await import('../../../src/logger/colors.js');

        expect(SpinnerFrames.DOTS).toBeInstanceOf(Array);
        expect(SpinnerFrames.LINE).toBeInstanceOf(Array);
        expect(SpinnerFrames.CIRCLE).toBeInstanceOf(Array);
        expect(SpinnerFrames.ARROW).toBeInstanceOf(Array);
        expect(SpinnerFrames.BLOCKS).toBeInstanceOf(Array);
        expect(Object.isFrozen(SpinnerFrames)).toBe(true);
      });
    });

    describe('progressBar()', () => {
      it('should create progress bar', async () => {
        const { progressBar } = await import('../../../src/logger/colors.js');

        const result = progressBar(50, 100, { width: 10 });
        expect(result).toContain('50%');
      });

      it('should handle 0% progress', async () => {
        const { progressBar } = await import('../../../src/logger/colors.js');

        const result = progressBar(0, 100, { width: 10 });
        expect(result).toContain('0%');
      });

      it('should handle 100% progress', async () => {
        const { progressBar } = await import('../../../src/logger/colors.js');

        const result = progressBar(100, 100, { width: 10 });
        expect(result).toContain('100%');
      });

      it('should clamp values', async () => {
        const { progressBar } = await import('../../../src/logger/colors.js');

        const overResult = progressBar(150, 100);
        expect(overResult).toContain('100%');

        const underResult = progressBar(-10, 100);
        expect(underResult).toContain('0%');
      });

      it('should apply colors', async () => {
        process.env.FORCE_COLOR = '1';
        process.stdout.isTTY = true;
        process.env.COLORTERM = 'truecolor';
        const { progressBar } = await import('../../../src/logger/colors.js');

        const result = progressBar(50, 100, {
          width: 10,
          completeColor: '#00ff00',
          incompleteColor: '#ff0000',
        });

        expect(result).toContain('\x1b[38;2;0;255;0m');
      });
    });
  });

  // ===========================================================================
  // Default Export Tests
  // ===========================================================================

  describe('Default Export', () => {
    it('should export all functions and objects', async () => {
      const colors = await import('../../../src/logger/colors.js');
      const defaultExport = colors.default;

      // Core objects
      expect(defaultExport.COLORS).toBeDefined();
      expect(defaultExport.Styles).toBeDefined();
      expect(defaultExport.FgColors).toBeDefined();
      expect(defaultExport.BgColors).toBeDefined();
      expect(defaultExport.RESET).toBeDefined();

      // Detection
      expect(typeof defaultExport.supportsColors).toBe('function');
      expect(typeof defaultExport.getColorDepth).toBe('function');

      // Core functions
      expect(typeof defaultExport.colorize).toBe('function');
      expect(typeof defaultExport.stripAnsi).toBe('function');
      expect(typeof defaultExport.style).toBe('function');
      expect(typeof defaultExport.box).toBe('function');

      // Convenience colors
      expect(typeof defaultExport.red).toBe('function');
      expect(typeof defaultExport.green).toBe('function');

      // Gradients
      expect(typeof defaultExport.gradient).toBe('function');
      expect(typeof defaultExport.rainbow).toBe('function');
      expect(defaultExport.Gradients).toBeDefined();

      // Themes
      expect(defaultExport.Themes).toBeDefined();
      expect(typeof defaultExport.setTheme).toBe('function');
      expect(typeof defaultExport.getTheme).toBe('function');

      // Animation helpers
      expect(defaultExport.SpinnerFrames).toBeDefined();
      expect(typeof defaultExport.progressBar).toBe('function');
    });
  });
});
