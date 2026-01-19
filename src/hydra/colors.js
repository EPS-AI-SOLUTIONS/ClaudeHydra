/**
 * HYDRA Colors & Styling Module
 * Centralized ANSI color codes and styling utilities
 */

// ANSI escape codes
export const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  blink: '\x1b[5m',
  inverse: '\x1b[7m',
  hidden: '\x1b[8m',
  strikethrough: '\x1b[9m',

  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // Bright foreground colors
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',

  // Background colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',

  // Cursor control
  cursorUp: (n = 1) => `\x1b[${n}A`,
  cursorDown: (n = 1) => `\x1b[${n}B`,
  cursorForward: (n = 1) => `\x1b[${n}C`,
  cursorBack: (n = 1) => `\x1b[${n}D`,
  cursorPosition: (row, col) => `\x1b[${row};${col}H`,
  cursorSave: '\x1b[s',
  cursorRestore: '\x1b[u',
  cursorHide: '\x1b[?25l',
  cursorShow: '\x1b[?25h',

  // Line control
  clearLine: '\x1b[2K',
  clearLineEnd: '\x1b[0K',
  clearLineStart: '\x1b[1K',
  clearScreen: '\x1b[2J',
  clearScreenEnd: '\x1b[0J',
  clearScreenStart: '\x1b[1J',
};

// No-color version (empty strings)
const NO_COLOR = Object.fromEntries(
  Object.entries(ANSI).map(([key, value]) => [
    key,
    typeof value === 'function' ? () => '' : '',
  ])
);

/**
 * Create a color palette based on config
 */
export function createPalette(colorized = true) {
  return colorized ? ANSI : NO_COLOR;
}

/**
 * Style text with multiple attributes
 */
export function style(text, ...styles) {
  const prefix = styles.join('');
  return `${prefix}${text}${ANSI.reset}`;
}

/**
 * Create a styled text function
 */
export function createStyler(options = {}) {
  // Support both boolean and object argument
  const colorized = typeof options === 'boolean' ? options : options.enabled !== false;
  const c = createPalette(colorized);

  return {
    // Basic styles
    bold: (text) => style(text, c.bold),
    dim: (text) => style(text, c.dim),
    italic: (text) => style(text, c.italic),
    underline: (text) => style(text, c.underline),

    // Colors
    red: (text) => style(text, c.red),
    green: (text) => style(text, c.green),
    yellow: (text) => style(text, c.yellow),
    blue: (text) => style(text, c.blue),
    magenta: (text) => style(text, c.magenta),
    cyan: (text) => style(text, c.cyan),
    white: (text) => style(text, c.white),
    gray: (text) => style(text, c.gray),

    // Semantic styles
    success: (text) => style(text, c.green, c.bold),
    error: (text) => style(text, c.red, c.bold),
    warning: (text) => style(text, c.yellow),
    info: (text) => style(text, c.cyan),
    muted: (text) => style(text, c.dim),
    highlight: (text) => style(text, c.bgYellow, c.black),

    // Status indicators
    ok: () => style('✓', c.green),
    fail: () => style('✗', c.red),
    warn: () => style('⚠', c.yellow),
    dot: (color = c.green) => style('●', color),

    // Raw palette access
    c,
  };
}

/**
 * Progress bar characters
 */
export const PROGRESS = {
  full: '█',
  empty: '░',
  half: '▓',
  light: '▒',
  left: '▐',
  right: '▌',
  spinner: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  dots: ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'],
  arrows: ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙'],
  bounce: ['⠁', '⠂', '⠄', '⠂'],
};

/**
 * Box drawing characters
 */
export const BOX = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
  cross: '┼',
  teeLeft: '├',
  teeRight: '┤',
  teeTop: '┬',
  teeBottom: '┴',

  // Double lines
  doubleTopLeft: '╔',
  doubleTopRight: '╗',
  doubleBottomLeft: '╚',
  doubleBottomRight: '╝',
  doubleHorizontal: '═',
  doubleVertical: '║',

  // Rounded corners
  roundTopLeft: '╭',
  roundTopRight: '╮',
  roundBottomLeft: '╰',
  roundBottomRight: '╯',
};

/**
 * Simple color object (legacy compatibility)
 * Used by hydra-launcher for inline styling
 */
export const COLORS = {
  reset: ANSI.reset,
  bold: ANSI.bold,
  dim: ANSI.dim,
  cyan: ANSI.cyan,
  green: ANSI.green,
  yellow: ANSI.yellow,
  red: ANSI.red,
  magenta: ANSI.magenta,
  blue: ANSI.blue,
  white: ANSI.white,
  gray: ANSI.gray,
  bgRed: ANSI.bgRed,
  bgGreen: ANSI.bgGreen,
  bgYellow: ANSI.bgYellow,
};
