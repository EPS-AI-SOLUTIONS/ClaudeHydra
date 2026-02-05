/**
 * @fileoverview ANSI color codes and styling utilities for terminal output
 * Provides cross-platform color support with fallback for non-TTY environments.
 * Includes true color (24-bit), 256 color palette, gradients, and themed color schemes.
 * @module logger/colors
 */

// ============================================================================
// ANSI Escape Codes
// ============================================================================

/**
 * ANSI reset code
 * @type {string}
 */
export const RESET = '\x1b[0m';

// ============================================================================
// Text Styles
// ============================================================================

/**
 * ANSI text style codes
 * @readonly
 * @enum {string}
 */
export const Styles = Object.freeze({
  /** Reset all styles */
  RESET: '\x1b[0m',
  /** Bold/bright text */
  BOLD: '\x1b[1m',
  /** Dim/faint text */
  DIM: '\x1b[2m',
  /** Italic text (not widely supported) */
  ITALIC: '\x1b[3m',
  /** Underlined text */
  UNDERLINE: '\x1b[4m',
  /** Blinking text (not widely supported) */
  BLINK: '\x1b[5m',
  /** Rapid blinking (not widely supported) */
  RAPID_BLINK: '\x1b[6m',
  /** Inverted colors */
  INVERSE: '\x1b[7m',
  /** Hidden text */
  HIDDEN: '\x1b[8m',
  /** Strikethrough text */
  STRIKETHROUGH: '\x1b[9m',
  /** Double underline */
  DOUBLE_UNDERLINE: '\x1b[21m',
  /** Overlined text */
  OVERLINE: '\x1b[53m',
  /** Framed text */
  FRAMED: '\x1b[51m',
  /** Encircled text */
  ENCIRCLED: '\x1b[52m'
});

// ============================================================================
// Foreground Colors
// ============================================================================

/**
 * ANSI foreground color codes (standard colors)
 * @readonly
 * @enum {string}
 */
export const FgColors = Object.freeze({
  BLACK: '\x1b[30m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  MAGENTA: '\x1b[35m',
  CYAN: '\x1b[36m',
  WHITE: '\x1b[37m',
  /** Default foreground color */
  DEFAULT: '\x1b[39m',
  /** Bright black (gray) */
  GRAY: '\x1b[90m',
  GREY: '\x1b[90m', // Alias
  /** Bright colors */
  BRIGHT_RED: '\x1b[91m',
  BRIGHT_GREEN: '\x1b[92m',
  BRIGHT_YELLOW: '\x1b[93m',
  BRIGHT_BLUE: '\x1b[94m',
  BRIGHT_MAGENTA: '\x1b[95m',
  BRIGHT_CYAN: '\x1b[96m',
  BRIGHT_WHITE: '\x1b[97m'
});

// ============================================================================
// Background Colors
// ============================================================================

/**
 * ANSI background color codes
 * @readonly
 * @enum {string}
 */
export const BgColors = Object.freeze({
  BLACK: '\x1b[40m',
  RED: '\x1b[41m',
  GREEN: '\x1b[42m',
  YELLOW: '\x1b[43m',
  BLUE: '\x1b[44m',
  MAGENTA: '\x1b[45m',
  CYAN: '\x1b[46m',
  WHITE: '\x1b[47m',
  /** Default background color */
  DEFAULT: '\x1b[49m',
  /** Bright backgrounds */
  BRIGHT_BLACK: '\x1b[100m',
  BRIGHT_RED: '\x1b[101m',
  BRIGHT_GREEN: '\x1b[102m',
  BRIGHT_YELLOW: '\x1b[103m',
  BRIGHT_BLUE: '\x1b[104m',
  BRIGHT_MAGENTA: '\x1b[105m',
  BRIGHT_CYAN: '\x1b[106m',
  BRIGHT_WHITE: '\x1b[107m'
});

// ============================================================================
// Combined Colors Object (Backwards Compatible)
// ============================================================================

/**
 * Combined ANSI color codes for backwards compatibility
 * @readonly
 */
export const COLORS = Object.freeze({
  // Reset
  reset: RESET,

  // Styles
  bright: Styles.BOLD,
  dim: Styles.DIM,
  italic: Styles.ITALIC,
  underline: Styles.UNDERLINE,
  inverse: Styles.INVERSE,
  hidden: Styles.HIDDEN,
  strikethrough: Styles.STRIKETHROUGH,

  // Foreground colors
  black: FgColors.BLACK,
  red: FgColors.RED,
  green: FgColors.GREEN,
  yellow: FgColors.YELLOW,
  blue: FgColors.BLUE,
  magenta: FgColors.MAGENTA,
  cyan: FgColors.CYAN,
  white: FgColors.WHITE,
  gray: FgColors.GRAY,
  grey: FgColors.GREY,

  // Bright foreground colors
  brightRed: FgColors.BRIGHT_RED,
  brightGreen: FgColors.BRIGHT_GREEN,
  brightYellow: FgColors.BRIGHT_YELLOW,
  brightBlue: FgColors.BRIGHT_BLUE,
  brightMagenta: FgColors.BRIGHT_MAGENTA,
  brightCyan: FgColors.BRIGHT_CYAN,
  brightWhite: FgColors.BRIGHT_WHITE,

  // Background colors
  bgBlack: BgColors.BLACK,
  bgRed: BgColors.RED,
  bgGreen: BgColors.GREEN,
  bgYellow: BgColors.YELLOW,
  bgBlue: BgColors.BLUE,
  bgMagenta: BgColors.MAGENTA,
  bgCyan: BgColors.CYAN,
  bgWhite: BgColors.WHITE,

  // Bright background colors
  bgBrightBlack: BgColors.BRIGHT_BLACK,
  bgBrightRed: BgColors.BRIGHT_RED,
  bgBrightGreen: BgColors.BRIGHT_GREEN,
  bgBrightYellow: BgColors.BRIGHT_YELLOW,
  bgBrightBlue: BgColors.BRIGHT_BLUE,
  bgBrightMagenta: BgColors.BRIGHT_MAGENTA,
  bgBrightCyan: BgColors.BRIGHT_CYAN,
  bgBrightWhite: BgColors.BRIGHT_WHITE
});

// ============================================================================
// Color Detection
// ============================================================================

/**
 * Detects if the terminal supports colors
 * @returns {boolean} True if colors are supported
 */
export function supportsColors() {
  // Check for force color flags
  if (process.env.FORCE_COLOR !== undefined) {
    return process.env.FORCE_COLOR !== '0';
  }

  // Check for NO_COLOR standard
  if (process.env.NO_COLOR !== undefined) {
    return false;
  }

  // Check if stdout is a TTY
  if (!process.stdout.isTTY) {
    return false;
  }

  // Check for color-supporting terminals
  const term = process.env.TERM || '';
  if (term === 'dumb') {
    return false;
  }

  // Check for CI environments that support colors
  if (process.env.CI) {
    const supportedCI = ['TRAVIS', 'CIRCLECI', 'GITHUB_ACTIONS', 'GITLAB_CI', 'BUILDKITE'];
    if (supportedCI.some(ci => process.env[ci])) {
      return true;
    }
  }

  // Check for Windows
  if (process.platform === 'win32') {
    // Windows 10 build 10586 added ANSI support
    const osRelease = require('os').release().split('.');
    if (Number(osRelease[0]) >= 10 && Number(osRelease[2]) >= 10586) {
      return true;
    }
    return false;
  }

  return true;
}

/**
 * Detects the color depth (number of colors supported)
 * @returns {number} Color depth (1, 4, 8, or 24 bits)
 */
export function getColorDepth() {
  if (!supportsColors()) {
    return 1;
  }

  // Check for 24-bit true color support
  const colorTerm = process.env.COLORTERM || '';
  if (colorTerm === 'truecolor' || colorTerm === '24bit') {
    return 24;
  }

  // Check for iTerm, Konsole, and other known true color terminals
  const termProgram = process.env.TERM_PROGRAM || '';
  if (['iTerm.app', 'Hyper', 'Apple_Terminal', 'vscode'].includes(termProgram)) {
    return 24;
  }

  // Check TERM for 256 color support
  const term = process.env.TERM || '';
  if (term.includes('256') || term.includes('256color')) {
    return 8;
  }

  // Check for Windows Terminal (supports true color)
  if (process.env.WT_SESSION) {
    return 24;
  }

  // Default to 4-bit (16 colors)
  return 4;
}

/**
 * Checks if terminal supports true color (24-bit)
 * @returns {boolean} True if true color is supported
 */
export function supportsTrueColor() {
  return getColorDepth() === 24;
}

/**
 * Checks if terminal supports 256 colors
 * @returns {boolean} True if 256 colors are supported
 */
export function supports256Colors() {
  return getColorDepth() >= 8;
}

// ============================================================================
// Color Application Functions
// ============================================================================

/**
 * Wraps text with ANSI color codes
 * @param {string} text - Text to colorize
 * @param {string} colorCode - ANSI color code
 * @returns {string} Colorized text
 */
export function colorize(text, colorCode) {
  if (!supportsColors()) {
    return text;
  }
  return `${colorCode}${text}${RESET}`;
}

/**
 * Creates a colored text formatter function
 * @param {string} colorCode - ANSI color code
 * @returns {function(string): string} Formatter function
 */
export function createColorFormatter(colorCode) {
  return (text) => colorize(text, colorCode);
}

/**
 * Strips ANSI codes from text
 * @param {string} text - Text with ANSI codes
 * @returns {string} Text without ANSI codes
 */
export function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Gets the visible length of a string (excluding ANSI codes)
 * @param {string} text - Text to measure
 * @returns {number} Visible character count
 */
export function visibleLength(text) {
  return stripAnsi(text).length;
}

// ============================================================================
// Convenience Color Functions
// ============================================================================

/**
 * Convenience functions for common colors
 */
export const red = createColorFormatter(FgColors.RED);
export const green = createColorFormatter(FgColors.GREEN);
export const yellow = createColorFormatter(FgColors.YELLOW);
export const blue = createColorFormatter(FgColors.BLUE);
export const magenta = createColorFormatter(FgColors.MAGENTA);
export const cyan = createColorFormatter(FgColors.CYAN);
export const white = createColorFormatter(FgColors.WHITE);
export const gray = createColorFormatter(FgColors.GRAY);
export const grey = gray; // Alias
export const black = createColorFormatter(FgColors.BLACK);

export const bold = createColorFormatter(Styles.BOLD);
export const dim = createColorFormatter(Styles.DIM);
export const italic = createColorFormatter(Styles.ITALIC);
export const underline = createColorFormatter(Styles.UNDERLINE);
export const inverse = createColorFormatter(Styles.INVERSE);
export const strikethrough = createColorFormatter(Styles.STRIKETHROUGH);

// ============================================================================
// Semantic Color Functions
// ============================================================================

/**
 * Formats text as an error message (red)
 * @param {string} text - Text to format
 * @returns {string} Formatted text
 */
export function error(text) {
  return colorize(text, FgColors.RED);
}

/**
 * Formats text as a warning message (yellow)
 * @param {string} text - Text to format
 * @returns {string} Formatted text
 */
export function warning(text) {
  return colorize(text, FgColors.YELLOW);
}

/**
 * Formats text as a success message (green)
 * @param {string} text - Text to format
 * @returns {string} Formatted text
 */
export function success(text) {
  return colorize(text, FgColors.GREEN);
}

/**
 * Formats text as an info message (cyan)
 * @param {string} text - Text to format
 * @returns {string} Formatted text
 */
export function info(text) {
  return colorize(text, FgColors.CYAN);
}

/**
 * Formats text as a debug message (gray)
 * @param {string} text - Text to format
 * @returns {string} Formatted text
 */
export function debug(text) {
  return colorize(text, FgColors.GRAY);
}

// ============================================================================
// 256-Color Support
// ============================================================================

/**
 * Creates ANSI code for 256-color foreground
 * @param {number} colorCode - Color code (0-255)
 * @returns {string} ANSI escape code
 */
export function fg256(colorCode) {
  const code = Math.max(0, Math.min(255, Math.floor(colorCode)));
  return `\x1b[38;5;${code}m`;
}

/**
 * Creates ANSI code for 256-color background
 * @param {number} colorCode - Color code (0-255)
 * @returns {string} ANSI escape code
 */
export function bg256(colorCode) {
  const code = Math.max(0, Math.min(255, Math.floor(colorCode)));
  return `\x1b[48;5;${code}m`;
}

/**
 * Applies 256-color foreground to text
 * @param {string} text - Text to colorize
 * @param {number} colorCode - Color code (0-255)
 * @returns {string} Colorized text
 */
export function color256(text, colorCode) {
  if (!supports256Colors()) {
    return text;
  }
  return `${fg256(colorCode)}${text}${RESET}`;
}

/**
 * 256-color palette sections
 * @readonly
 */
export const Color256Palette = Object.freeze({
  // Standard colors (0-15)
  STANDARD: { start: 0, end: 15 },
  // 216 color cube (16-231)
  COLOR_CUBE: { start: 16, end: 231 },
  // Grayscale (232-255)
  GRAYSCALE: { start: 232, end: 255 }
});

/**
 * Converts RGB to nearest 256-color code
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {number} Nearest 256-color code
 */
export function rgbTo256(r, g, b) {
  // Check if it's a grayscale color
  if (r === g && g === b) {
    if (r < 8) return 16; // Black
    if (r > 248) return 231; // White
    return Math.round((r - 8) / 247 * 24) + 232;
  }

  // Map to 6x6x6 color cube
  const rIndex = Math.round(r / 255 * 5);
  const gIndex = Math.round(g / 255 * 5);
  const bIndex = Math.round(b / 255 * 5);

  return 16 + (36 * rIndex) + (6 * gIndex) + bIndex;
}

/**
 * Gets grayscale color code (232-255)
 * @param {number} level - Gray level (0-23)
 * @returns {number} 256-color code
 */
export function grayscale256(level) {
  return 232 + Math.max(0, Math.min(23, Math.floor(level)));
}

// ============================================================================
// True Color (24-bit) Support
// ============================================================================

/**
 * Creates ANSI code for RGB foreground color
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {string} ANSI escape code
 */
export function fgRGB(r, g, b) {
  const rc = Math.max(0, Math.min(255, Math.floor(r)));
  const gc = Math.max(0, Math.min(255, Math.floor(g)));
  const bc = Math.max(0, Math.min(255, Math.floor(b)));
  return `\x1b[38;2;${rc};${gc};${bc}m`;
}

/**
 * Creates ANSI code for RGB background color
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {string} ANSI escape code
 */
export function bgRGB(r, g, b) {
  const rc = Math.max(0, Math.min(255, Math.floor(r)));
  const gc = Math.max(0, Math.min(255, Math.floor(g)));
  const bc = Math.max(0, Math.min(255, Math.floor(b)));
  return `\x1b[48;2;${rc};${gc};${bc}m`;
}

/**
 * Applies RGB foreground color to text
 * @param {string} text - Text to colorize
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {string} Colorized text
 */
export function rgb(text, r, g, b) {
  if (!supportsTrueColor()) {
    // Fallback to 256-color mode
    if (supports256Colors()) {
      return color256(text, rgbTo256(r, g, b));
    }
    return text;
  }
  return `${fgRGB(r, g, b)}${text}${RESET}`;
}

/**
 * Creates ANSI code from hex color for foreground
 * @param {string} hex - Hex color (e.g., '#ff5500' or 'ff5500')
 * @returns {string} ANSI escape code
 */
export function fgHex(hex) {
  const { r, g, b } = hexToRgb(hex);
  return fgRGB(r, g, b);
}

/**
 * Creates ANSI code from hex color for background
 * @param {string} hex - Hex color (e.g., '#ff5500' or 'ff5500')
 * @returns {string} ANSI escape code
 */
export function bgHex(hex) {
  const { r, g, b } = hexToRgb(hex);
  return bgRGB(r, g, b);
}

/**
 * Applies hex foreground color to text
 * @param {string} text - Text to colorize
 * @param {string} hex - Hex color
 * @returns {string} Colorized text
 */
export function hex(text, hexColor) {
  const { r, g, b } = hexToRgb(hexColor);
  return rgb(text, r, g, b);
}

/**
 * Converts hex color to RGB
 * @param {string} hex - Hex color (e.g., '#ff5500', 'ff5500', '#f50', 'f50')
 * @returns {{r: number, g: number, b: number}} RGB values
 */
export function hexToRgb(hex) {
  let clean = hex.replace('#', '');

  // Handle shorthand notation (e.g., 'f50' -> 'ff5500')
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('');
  }

  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  return { r, g, b };
}

/**
 * Converts RGB to hex color
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {string} Hex color (e.g., '#ff5500')
 */
export function rgbToHex(r, g, b) {
  const toHex = (c) => Math.max(0, Math.min(255, Math.floor(c))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Converts HSL to RGB
 * @param {number} h - Hue (0-360)
 * @param {number} s - Saturation (0-100)
 * @param {number} l - Lightness (0-100)
 * @returns {{r: number, g: number, b: number}} RGB values
 */
export function hslToRgb(h, s, l) {
  const hNorm = h / 360;
  const sNorm = s / 100;
  const lNorm = l / 100;

  if (sNorm === 0) {
    const gray = Math.round(lNorm * 255);
    return { r: gray, g: gray, b: gray };
  }

  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };

  const q = lNorm < 0.5 ? lNorm * (1 + sNorm) : lNorm + sNorm - lNorm * sNorm;
  const p = 2 * lNorm - q;

  return {
    r: Math.round(hue2rgb(p, q, hNorm + 1/3) * 255),
    g: Math.round(hue2rgb(p, q, hNorm) * 255),
    b: Math.round(hue2rgb(p, q, hNorm - 1/3) * 255)
  };
}

/**
 * Applies HSL foreground color to text
 * @param {string} text - Text to colorize
 * @param {number} h - Hue (0-360)
 * @param {number} s - Saturation (0-100)
 * @param {number} l - Lightness (0-100)
 * @returns {string} Colorized text
 */
export function hsl(text, h, s, l) {
  const { r, g, b } = hslToRgb(h, s, l);
  return rgb(text, r, g, b);
}

// ============================================================================
// Gradient Support
// ============================================================================

/**
 * Interpolates between two colors
 * @param {{r: number, g: number, b: number}} color1 - Start color
 * @param {{r: number, g: number, b: number}} color2 - End color
 * @param {number} factor - Interpolation factor (0-1)
 * @returns {{r: number, g: number, b: number}} Interpolated color
 */
export function interpolateColor(color1, color2, factor) {
  return {
    r: Math.round(color1.r + (color2.r - color1.r) * factor),
    g: Math.round(color1.g + (color2.g - color1.g) * factor),
    b: Math.round(color1.b + (color2.b - color1.b) * factor)
  };
}

/**
 * Creates a gradient array of colors
 * @param {string[]} colors - Array of hex colors
 * @param {number} steps - Number of gradient steps
 * @returns {{r: number, g: number, b: number}[]} Array of RGB colors
 */
export function createGradientColors(colors, steps) {
  if (colors.length < 2) {
    throw new Error('Gradient requires at least 2 colors');
  }

  const rgbColors = colors.map(c => hexToRgb(c));
  const result = [];
  const segmentSteps = Math.ceil(steps / (colors.length - 1));

  for (let i = 0; i < colors.length - 1; i++) {
    const startColor = rgbColors[i];
    const endColor = rgbColors[i + 1];

    for (let j = 0; j < segmentSteps && result.length < steps; j++) {
      const factor = j / segmentSteps;
      result.push(interpolateColor(startColor, endColor, factor));
    }
  }

  // Ensure we have exactly the requested number of steps
  while (result.length < steps) {
    result.push(rgbColors[rgbColors.length - 1]);
  }

  return result.slice(0, steps);
}

/**
 * Applies a gradient to text (character by character)
 * @param {string} text - Text to apply gradient to
 * @param {string[]} colors - Array of hex colors for gradient
 * @returns {string} Gradient-colored text
 */
export function gradient(text, colors) {
  if (!supportsTrueColor() && !supports256Colors()) {
    return text;
  }

  const chars = stripAnsi(text).split('');
  if (chars.length === 0) return text;

  const gradientColors = createGradientColors(colors, chars.length);

  let result = '';
  for (let i = 0; i < chars.length; i++) {
    const { r, g, b } = gradientColors[i];
    if (supportsTrueColor()) {
      result += `${fgRGB(r, g, b)}${chars[i]}`;
    } else {
      result += `${fg256(rgbTo256(r, g, b))}${chars[i]}`;
    }
  }

  return result + RESET;
}

/**
 * Applies a rainbow gradient to text
 * @param {string} text - Text to colorize
 * @returns {string} Rainbow-colored text
 */
export function rainbow(text) {
  return gradient(text, ['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff', '#4b0082', '#9400d3']);
}

/**
 * Applies a pastel rainbow gradient to text
 * @param {string} text - Text to colorize
 * @returns {string} Pastel rainbow-colored text
 */
export function pastelRainbow(text) {
  return gradient(text, ['#ffb3ba', '#ffdfba', '#ffffba', '#baffc9', '#bae1ff', '#e0bbff']);
}

// ============================================================================
// Predefined Gradients
// ============================================================================

/**
 * Predefined gradient color schemes
 * @readonly
 */
export const Gradients = Object.freeze({
  RAINBOW: ['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff', '#4b0082', '#9400d3'],
  PASTEL: ['#ffb3ba', '#ffdfba', '#ffffba', '#baffc9', '#bae1ff', '#e0bbff'],
  SUNSET: ['#ff512f', '#f09819', '#ff5e62', '#ff9966'],
  OCEAN: ['#2193b0', '#6dd5ed', '#00d2ff', '#3a7bd5'],
  FOREST: ['#134e5e', '#71b280', '#2c5364', '#0f9b0f'],
  FIRE: ['#f12711', '#f5af19', '#ff416c', '#ff4b2b'],
  COSMIC: ['#ff00cc', '#333399', '#7f00ff', '#e100ff'],
  NEON: ['#00ff87', '#60efff', '#ff0080', '#ffff00'],
  AURORA: ['#00c9ff', '#92fe9d', '#f5af19', '#f12711', '#c471ed'],
  CYBERPUNK: ['#ff00ff', '#00ffff', '#ff0080', '#00ff00'],
  MATRIX: ['#00ff00', '#003300', '#00ff00', '#009900'],
  SYNTHWAVE: ['#ff6ad5', '#c774e8', '#ad8cff', '#8795e8', '#94d0ff'],
  PURPLE_HAZE: ['#7303c0', '#ec38bc', '#fdeff9'],
  BLUE_LAGOON: ['#43c6ac', '#191654'],
  WARM_FLAME: ['#ff9a9e', '#fecfef', '#fad0c4'],
  COOL_BLUES: ['#2193b0', '#6dd5ed'],
  EMERALD: ['#348f50', '#56b4d3'],
  CHERRY: ['#eb3349', '#f45c43'],
  ROYAL: ['#141e30', '#243b55']
});

/**
 * Creates a gradient text formatter for a specific gradient
 * @param {string[]} colors - Array of hex colors
 * @returns {function(string): string} Gradient formatter function
 */
export function createGradientFormatter(colors) {
  return (text) => gradient(text, colors);
}

// ============================================================================
// Color Themes
// ============================================================================

/**
 * Color theme definitions
 * @readonly
 */
export const Themes = Object.freeze({
  /** Default theme - classic terminal colors */
  DEFAULT: {
    name: 'default',
    primary: '#00ffff',
    secondary: '#ff00ff',
    success: '#00ff00',
    warning: '#ffff00',
    error: '#ff0000',
    info: '#00ffff',
    muted: '#808080',
    accent: '#ff7f00',
    background: '#000000',
    foreground: '#ffffff'
  },

  /** Cyberpunk theme - neon colors on dark background */
  CYBERPUNK: {
    name: 'cyberpunk',
    primary: '#ff00ff',    // Magenta
    secondary: '#00ffff',  // Cyan
    success: '#39ff14',    // Neon green
    warning: '#ffff00',    // Yellow
    error: '#ff0040',      // Hot pink/red
    info: '#00d4ff',       // Electric blue
    muted: '#666699',      // Muted purple
    accent: '#ff6600',     // Orange
    highlight: '#ff00ff',  // Pink highlight
    background: '#0d0221', // Dark purple
    foreground: '#e0e0ff'  // Light lavender
  },

  /** Matrix theme - green terminal style */
  MATRIX: {
    name: 'matrix',
    primary: '#00ff00',    // Bright green
    secondary: '#00cc00',  // Medium green
    success: '#00ff00',    // Bright green
    warning: '#99ff00',    // Yellow-green
    error: '#ff3300',      // Red
    info: '#00ff66',       // Teal green
    muted: '#006600',      // Dark green
    accent: '#33ff33',     // Light green
    highlight: '#66ff66',  // Lighter green
    background: '#000000', // Black
    foreground: '#00ff00'  // Green
  },

  /** Ocean theme - blue and teal colors */
  OCEAN: {
    name: 'ocean',
    primary: '#0077be',    // Ocean blue
    secondary: '#00a9a5',  // Teal
    success: '#48cae4',    // Light blue
    warning: '#ffd166',    // Sandy yellow
    error: '#ef476f',      // Coral red
    info: '#90e0ef',       // Sky blue
    muted: '#457b9d',      // Steel blue
    accent: '#06d6a0',     // Seafoam
    highlight: '#00b4d8',  // Bright cyan
    background: '#03045e', // Deep ocean
    foreground: '#caf0f8'  // Light cyan
  },

  /** Sunset theme - warm orange and pink colors */
  SUNSET: {
    name: 'sunset',
    primary: '#ff6b6b',    // Coral
    secondary: '#feca57',  // Golden yellow
    success: '#1dd1a1',    // Mint green
    warning: '#ff9f43',    // Orange
    error: '#ee5a52',      // Red
    info: '#ff9ff3',       // Pink
    muted: '#c8d6e5',      // Light gray
    accent: '#ff6b6b',     // Coral accent
    highlight: '#ffeaa7',  // Light yellow
    background: '#2c2c54', // Dark purple
    foreground: '#f8f9fa'  // White
  },

  /** Forest theme - green and brown natural colors */
  FOREST: {
    name: 'forest',
    primary: '#2d6a4f',    // Forest green
    secondary: '#74c69d',  // Light green
    success: '#40916c',    // Medium green
    warning: '#dda15e',    // Amber
    error: '#bc6c25',      // Brown-red
    info: '#95d5b2',       // Sage
    muted: '#6c757d',      // Gray
    accent: '#52b788',     // Teal green
    highlight: '#b7e4c7',  // Mint
    background: '#1b4332', // Dark green
    foreground: '#d8f3dc'  // Light green
  },

  /** Dracula theme - popular dark theme */
  DRACULA: {
    name: 'dracula',
    primary: '#bd93f9',    // Purple
    secondary: '#8be9fd',  // Cyan
    success: '#50fa7b',    // Green
    warning: '#f1fa8c',    // Yellow
    error: '#ff5555',      // Red
    info: '#8be9fd',       // Cyan
    muted: '#6272a4',      // Comment gray
    accent: '#ff79c6',     // Pink
    highlight: '#ffb86c',  // Orange
    background: '#282a36', // Background
    foreground: '#f8f8f2'  // Foreground
  },

  /** Nord theme - arctic, north-bluish colors */
  NORD: {
    name: 'nord',
    primary: '#88c0d0',    // Frost cyan
    secondary: '#81a1c1',  // Frost blue
    success: '#a3be8c',    // Aurora green
    warning: '#ebcb8b',    // Aurora yellow
    error: '#bf616a',      // Aurora red
    info: '#5e81ac',       // Frost blue dark
    muted: '#4c566a',      // Polar night
    accent: '#b48ead',     // Aurora purple
    highlight: '#8fbcbb',  // Frost teal
    background: '#2e3440', // Polar night
    foreground: '#eceff4'  // Snow storm
  },

  /** Monokai theme - classic code editor colors */
  MONOKAI: {
    name: 'monokai',
    primary: '#f92672',    // Pink
    secondary: '#66d9ef',  // Blue
    success: '#a6e22e',    // Green
    warning: '#e6db74',    // Yellow
    error: '#f92672',      // Pink/red
    info: '#66d9ef',       // Blue
    muted: '#75715e',      // Comment gray
    accent: '#fd971f',     // Orange
    highlight: '#ae81ff',  // Purple
    background: '#272822', // Background
    foreground: '#f8f8f2'  // Foreground
  },

  /** Solarized Dark theme */
  SOLARIZED_DARK: {
    name: 'solarized_dark',
    primary: '#268bd2',    // Blue
    secondary: '#2aa198',  // Cyan
    success: '#859900',    // Green
    warning: '#b58900',    // Yellow
    error: '#dc322f',      // Red
    info: '#6c71c4',       // Violet
    muted: '#586e75',      // Base01
    accent: '#cb4b16',     // Orange
    highlight: '#d33682',  // Magenta
    background: '#002b36', // Base03
    foreground: '#839496'  // Base0
  }
});

/**
 * Current active theme
 * @type {Object}
 */
let currentTheme = Themes.DEFAULT;

/**
 * Sets the current color theme
 * @param {Object|string} theme - Theme object or theme name
 */
export function setTheme(theme) {
  if (typeof theme === 'string') {
    const themeName = theme.toUpperCase().replace(/-/g, '_');
    if (Themes[themeName]) {
      currentTheme = Themes[themeName];
    } else {
      throw new Error(`Unknown theme: ${theme}`);
    }
  } else if (typeof theme === 'object' && theme !== null) {
    currentTheme = { ...Themes.DEFAULT, ...theme };
  }
}

/**
 * Gets the current color theme
 * @returns {Object} Current theme
 */
export function getTheme() {
  return { ...currentTheme };
}

/**
 * Applies theme primary color to text
 * @param {string} text - Text to colorize
 * @returns {string} Colorized text
 */
export function themePrimary(text) {
  return hex(text, currentTheme.primary);
}

/**
 * Applies theme secondary color to text
 * @param {string} text - Text to colorize
 * @returns {string} Colorized text
 */
export function themeSecondary(text) {
  return hex(text, currentTheme.secondary);
}

/**
 * Applies theme success color to text
 * @param {string} text - Text to colorize
 * @returns {string} Colorized text
 */
export function themeSuccess(text) {
  return hex(text, currentTheme.success);
}

/**
 * Applies theme warning color to text
 * @param {string} text - Text to colorize
 * @returns {string} Colorized text
 */
export function themeWarning(text) {
  return hex(text, currentTheme.warning);
}

/**
 * Applies theme error color to text
 * @param {string} text - Text to colorize
 * @returns {string} Colorized text
 */
export function themeError(text) {
  return hex(text, currentTheme.error);
}

/**
 * Applies theme info color to text
 * @param {string} text - Text to colorize
 * @returns {string} Colorized text
 */
export function themeInfo(text) {
  return hex(text, currentTheme.info);
}

/**
 * Applies theme muted color to text
 * @param {string} text - Text to colorize
 * @returns {string} Colorized text
 */
export function themeMuted(text) {
  return hex(text, currentTheme.muted);
}

/**
 * Applies theme accent color to text
 * @param {string} text - Text to colorize
 * @returns {string} Colorized text
 */
export function themeAccent(text) {
  return hex(text, currentTheme.accent);
}

// ============================================================================
// Advanced Styling Functions
// ============================================================================

/**
 * Combines multiple styles/colors
 * @param {...string} codes - ANSI codes to combine
 * @returns {string} Combined ANSI code
 */
export function combine(...codes) {
  return codes.join('');
}

/**
 * Creates a styled text with multiple attributes
 * @param {string} text - Text to style
 * @param {Object} options - Style options
 * @param {string} [options.fg] - Foreground hex color
 * @param {string} [options.bg] - Background hex color
 * @param {boolean} [options.bold] - Bold text
 * @param {boolean} [options.italic] - Italic text
 * @param {boolean} [options.underline] - Underlined text
 * @param {boolean} [options.dim] - Dim text
 * @param {boolean} [options.strikethrough] - Strikethrough text
 * @returns {string} Styled text
 */
export function style(text, options = {}) {
  if (!supportsColors()) {
    return text;
  }

  let code = '';

  if (options.bold) code += Styles.BOLD;
  if (options.dim) code += Styles.DIM;
  if (options.italic) code += Styles.ITALIC;
  if (options.underline) code += Styles.UNDERLINE;
  if (options.strikethrough) code += Styles.STRIKETHROUGH;
  if (options.inverse) code += Styles.INVERSE;

  if (options.fg) {
    const { r, g, b } = hexToRgb(options.fg);
    if (supportsTrueColor()) {
      code += fgRGB(r, g, b);
    } else if (supports256Colors()) {
      code += fg256(rgbTo256(r, g, b));
    }
  }

  if (options.bg) {
    const { r, g, b } = hexToRgb(options.bg);
    if (supportsTrueColor()) {
      code += bgRGB(r, g, b);
    } else if (supports256Colors()) {
      code += bg256(rgbTo256(r, g, b));
    }
  }

  return `${code}${text}${RESET}`;
}

/**
 * Creates a box around text with optional styling
 * @param {string} text - Text to put in box
 * @param {Object} [options] - Box options
 * @param {string} [options.borderColor] - Border color (hex)
 * @param {string} [options.textColor] - Text color (hex)
 * @param {number} [options.padding] - Padding inside box
 * @returns {string} Text in box
 */
export function box(text, options = {}) {
  const padding = options.padding || 1;
  const lines = text.split('\n');
  const maxLength = Math.max(...lines.map(l => visibleLength(l)));
  const width = maxLength + padding * 2;

  const borderColor = options.borderColor ? fgHex(options.borderColor) : '';
  const textColor = options.textColor ? fgHex(options.textColor) : '';

  const horizontal = '\u2500'.repeat(width);
  const top = `${borderColor}\u250c${horizontal}\u2510${RESET}`;
  const bottom = `${borderColor}\u2514${horizontal}\u2518${RESET}`;

  const paddedLines = lines.map(line => {
    const lineLength = visibleLength(line);
    const rightPad = width - lineLength - padding;
    return `${borderColor}\u2502${RESET}${' '.repeat(padding)}${textColor}${line}${RESET}${' '.repeat(rightPad)}${borderColor}\u2502${RESET}`;
  });

  return [top, ...paddedLines, bottom].join('\n');
}

// ============================================================================
// Animation Helpers (for CLI spinners/progress)
// ============================================================================

/**
 * Spinner frames using various styles
 * @readonly
 */
export const SpinnerFrames = Object.freeze({
  DOTS: ['\u280b', '\u2819', '\u2839', '\u2838', '\u283c', '\u2834', '\u2826', '\u2827', '\u2807', '\u280f'],
  LINE: ['-', '\\', '|', '/'],
  CIRCLE: ['\u25dc', '\u25dd', '\u25de', '\u25df'],
  SQUARE: ['\u25eb', '\u25ea'],
  ARROW: ['\u2190', '\u2196', '\u2191', '\u2197', '\u2192', '\u2198', '\u2193', '\u2199'],
  BOUNCE: ['\u2801', '\u2802', '\u2804', '\u2840', '\u2880', '\u2820', '\u2810', '\u2808'],
  BLOCKS: ['\u2588', '\u2589', '\u258a', '\u258b', '\u258c', '\u258d', '\u258e', '\u258f'],
  CLOCK: ['\ud83d\udd50', '\ud83d\udd51', '\ud83d\udd52', '\ud83d\udd53', '\ud83d\udd54', '\ud83d\udd55', '\ud83d\udd56', '\ud83d\udd57', '\ud83d\udd58', '\ud83d\udd59', '\ud83d\udd5a', '\ud83d\udd5b']
});

/**
 * Creates a progress bar string
 * @param {number} current - Current value
 * @param {number} total - Total value
 * @param {Object} [options] - Progress bar options
 * @param {number} [options.width] - Bar width
 * @param {string} [options.completeChar] - Completed character
 * @param {string} [options.incompleteChar] - Incomplete character
 * @param {string} [options.completeColor] - Complete color (hex)
 * @param {string} [options.incompleteColor] - Incomplete color (hex)
 * @returns {string} Progress bar string
 */
export function progressBar(current, total, options = {}) {
  const width = options.width || 30;
  const completeChar = options.completeChar || '\u2588';
  const incompleteChar = options.incompleteChar || '\u2591';

  const percent = Math.min(1, Math.max(0, current / total));
  const completeWidth = Math.round(width * percent);
  const incompleteWidth = width - completeWidth;

  let complete = completeChar.repeat(completeWidth);
  let incomplete = incompleteChar.repeat(incompleteWidth);

  if (options.completeColor) {
    complete = hex(complete, options.completeColor);
  }
  if (options.incompleteColor) {
    incomplete = hex(incomplete, options.incompleteColor);
  }

  return `${complete}${incomplete} ${Math.round(percent * 100)}%`;
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  // Core objects
  COLORS,
  Styles,
  FgColors,
  BgColors,
  RESET,

  // Detection
  supportsColors,
  getColorDepth,
  supportsTrueColor,
  supports256Colors,

  // Core functions
  colorize,
  createColorFormatter,
  stripAnsi,
  visibleLength,
  combine,
  style,
  box,

  // Convenience colors
  red,
  green,
  yellow,
  blue,
  magenta,
  cyan,
  white,
  gray,
  grey,
  black,

  // Convenience styles
  bold,
  dim,
  italic,
  underline,
  inverse,
  strikethrough,

  // Semantic colors
  error,
  warning,
  success,
  info,
  debug,

  // 256 colors
  fg256,
  bg256,
  color256,
  Color256Palette,
  rgbTo256,
  grayscale256,

  // True color (RGB)
  fgRGB,
  bgRGB,
  rgb,
  fgHex,
  bgHex,
  hex,
  hexToRgb,
  rgbToHex,
  hslToRgb,
  hsl,

  // Gradients
  interpolateColor,
  createGradientColors,
  gradient,
  rainbow,
  pastelRainbow,
  Gradients,
  createGradientFormatter,

  // Themes
  Themes,
  setTheme,
  getTheme,
  themePrimary,
  themeSecondary,
  themeSuccess,
  themeWarning,
  themeError,
  themeInfo,
  themeMuted,
  themeAccent,

  // Animation helpers
  SpinnerFrames,
  progressBar
};
