/**
 * @fileoverview ANSI color codes and styling utilities for terminal output
 * Provides cross-platform color support with fallback for non-TTY environments.
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
  /** Inverted colors */
  INVERSE: '\x1b[7m',
  /** Hidden text */
  HIDDEN: '\x1b[8m',
  /** Strikethrough text */
  STRIKETHROUGH: '\x1b[9m'
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

  // Check TERM for 256 color support
  const term = process.env.TERM || '';
  if (term.includes('256') || term.includes('256color')) {
    return 8;
  }

  // Default to 4-bit (16 colors)
  return 4;
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
  return `\x1b[38;5;${colorCode}m`;
}

/**
 * Creates ANSI code for 256-color background
 * @param {number} colorCode - Color code (0-255)
 * @returns {string} ANSI escape code
 */
export function bg256(colorCode) {
  return `\x1b[48;5;${colorCode}m`;
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
  return `\x1b[38;2;${r};${g};${b}m`;
}

/**
 * Creates ANSI code for RGB background color
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {string} ANSI escape code
 */
export function bgRGB(r, g, b) {
  return `\x1b[48;2;${r};${g};${b}m`;
}

/**
 * Creates ANSI code from hex color for foreground
 * @param {string} hex - Hex color (e.g., '#ff5500' or 'ff5500')
 * @returns {string} ANSI escape code
 */
export function fgHex(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return fgRGB(r, g, b);
}

/**
 * Creates ANSI code from hex color for background
 * @param {string} hex - Hex color (e.g., '#ff5500' or 'ff5500')
 * @returns {string} ANSI escape code
 */
export function bgHex(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return bgRGB(r, g, b);
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

  // Core functions
  colorize,
  createColorFormatter,
  stripAnsi,
  visibleLength,

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

  // Extended colors
  fg256,
  bg256,
  fgRGB,
  bgRGB,
  fgHex,
  bgHex
};
