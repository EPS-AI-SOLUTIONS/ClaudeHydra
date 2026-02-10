/**
 * @fileoverview Modern message formatter with colored boxes, icons, and styled output
 * Provides beautiful, informative terminal messages for errors, warnings, success, and info.
 * @module logger/message-formatter
 */

import {
  BgColors,
  colorize,
  FgColors,
  RESET,
  Styles,
  supportsColors,
  visibleLength,
} from './colors.js';

// ============================================================================
// Unicode Icons (with fallbacks for Windows)
// ============================================================================

const isWindows = process.platform === 'win32';

/**
 * Message type icons with cross-platform support
 * @readonly
 */
export const Icons = Object.freeze({
  // Status icons
  ERROR: isWindows ? '[X]' : '\u2718', // ✘
  WARNING: isWindows ? '[!]' : '\u26A0', // ⚠
  SUCCESS: isWindows ? '[v]' : '\u2714', // ✔
  INFO: isWindows ? '[i]' : '\u2139', // ℹ
  DEBUG: isWindows ? '[D]' : '\u2699', // ⚙
  HINT: isWindows ? '[?]' : '\u2728', // ✨

  // Arrow icons
  ARROW_RIGHT: isWindows ? '->' : '\u2192', // →
  ARROW_DOWN: isWindows ? 'v' : '\u2193', // ↓
  BULLET: isWindows ? '*' : '\u2022', // •

  // Box drawing for stack trace
  PIPE: isWindows ? '|' : '\u2502', // │
  CORNER: isWindows ? '+' : '\u2514', // └
  TEE: isWindows ? '+' : '\u251C', // ├

  // Additional icons
  FOLDER: isWindows ? '[D]' : '\u{1F4C1}', // 📁
  FILE: isWindows ? '[F]' : '\u{1F4C4}', // 📄
  CLOCK: isWindows ? '[T]' : '\u{1F550}', // 🕐
  MAGNIFY: isWindows ? '[S]' : '\u{1F50D}', // 🔍
  WRENCH: isWindows ? '[W]' : '\u{1F527}', // 🔧
  LIGHTNING: isWindows ? '[!]' : '\u26A1', // ⚡
  LOCK: isWindows ? '[L]' : '\u{1F512}', // 🔒
  KEY: isWindows ? '[K]' : '\u{1F511}', // 🔑
});

// ============================================================================
// Box Drawing Characters
// ============================================================================

/**
 * Box drawing character sets
 * @readonly
 */
export const BoxChars = Object.freeze({
  // Single line (default)
  single: {
    topLeft: isWindows ? '+' : '\u250C', // ┌
    topRight: isWindows ? '+' : '\u2510', // ┐
    bottomLeft: isWindows ? '+' : '\u2514', // └
    bottomRight: isWindows ? '+' : '\u2518', // ┘
    horizontal: isWindows ? '-' : '\u2500', // ─
    vertical: isWindows ? '|' : '\u2502', // │
    leftTee: isWindows ? '+' : '\u251C', // ├
    rightTee: isWindows ? '+' : '\u2524', // ┤
    topTee: isWindows ? '+' : '\u252C', // ┬
    bottomTee: isWindows ? '+' : '\u2534', // ┴
    cross: isWindows ? '+' : '\u253C', // ┼
  },

  // Double line (for emphasis)
  double: {
    topLeft: isWindows ? '+' : '\u2554', // ╔
    topRight: isWindows ? '+' : '\u2557', // ╗
    bottomLeft: isWindows ? '+' : '\u255A', // ╚
    bottomRight: isWindows ? '+' : '\u255D', // ╝
    horizontal: isWindows ? '=' : '\u2550', // ═
    vertical: isWindows ? '|' : '\u2551', // ║
    leftTee: isWindows ? '+' : '\u2560', // ╠
    rightTee: isWindows ? '+' : '\u2563', // ╣
    topTee: isWindows ? '+' : '\u2566', // ╦
    bottomTee: isWindows ? '+' : '\u2569', // ╩
    cross: isWindows ? '+' : '\u256C', // ╬
  },

  // Rounded corners (for softer look)
  rounded: {
    topLeft: isWindows ? '+' : '\u256D', // ╭
    topRight: isWindows ? '+' : '\u256E', // ╮
    bottomLeft: isWindows ? '+' : '\u2570', // ╰
    bottomRight: isWindows ? '+' : '\u256F', // ╯
    horizontal: isWindows ? '-' : '\u2500', // ─
    vertical: isWindows ? '|' : '\u2502', // │
    leftTee: isWindows ? '+' : '\u251C', // ├
    rightTee: isWindows ? '+' : '\u2524', // ┤
    topTee: isWindows ? '+' : '\u252C', // ┬
    bottomTee: isWindows ? '+' : '\u2534', // ┴
    cross: isWindows ? '+' : '\u253C', // ┼
  },
});

// ============================================================================
// Theme Configuration
// ============================================================================

/**
 * Color themes for different message types
 * @readonly
 */
export const MessageThemes = Object.freeze({
  error: {
    icon: Icons.ERROR,
    iconColor: FgColors.WHITE,
    iconBg: BgColors.RED,
    borderColor: FgColors.RED,
    titleColor: FgColors.BRIGHT_RED,
    textColor: FgColors.WHITE,
    boxStyle: 'double',
    label: 'ERROR',
  },
  warning: {
    icon: Icons.WARNING,
    iconColor: FgColors.BLACK,
    iconBg: BgColors.YELLOW,
    borderColor: FgColors.YELLOW,
    titleColor: FgColors.BRIGHT_YELLOW,
    textColor: FgColors.WHITE,
    boxStyle: 'single',
    label: 'WARNING',
  },
  success: {
    icon: Icons.SUCCESS,
    iconColor: FgColors.WHITE,
    iconBg: BgColors.GREEN,
    borderColor: FgColors.GREEN,
    titleColor: FgColors.BRIGHT_GREEN,
    textColor: FgColors.WHITE,
    boxStyle: 'rounded',
    label: 'SUCCESS',
  },
  info: {
    icon: Icons.INFO,
    iconColor: FgColors.WHITE,
    iconBg: BgColors.BLUE,
    borderColor: FgColors.CYAN,
    titleColor: FgColors.BRIGHT_CYAN,
    textColor: FgColors.WHITE,
    boxStyle: 'single',
    label: 'INFO',
  },
  debug: {
    icon: Icons.DEBUG,
    iconColor: FgColors.WHITE,
    iconBg: BgColors.MAGENTA,
    borderColor: FgColors.GRAY,
    titleColor: FgColors.GRAY,
    textColor: FgColors.GRAY,
    boxStyle: 'single',
    label: 'DEBUG',
  },
  hint: {
    icon: Icons.HINT,
    iconColor: FgColors.BLACK,
    iconBg: BgColors.CYAN,
    borderColor: FgColors.CYAN,
    titleColor: FgColors.BRIGHT_CYAN,
    textColor: FgColors.WHITE,
    boxStyle: 'rounded',
    label: 'HINT',
  },
});

// ============================================================================
// Message Formatter Class
// ============================================================================

/**
 * Formats messages with colored boxes, icons, and styled output
 */
export class MessageFormatter {
  /**
   * Creates a new MessageFormatter
   * @param {Object} [options={}] - Formatter options
   * @param {number} [options.maxWidth=80] - Maximum width for message boxes
   * @param {boolean} [options.useColors=true] - Whether to use colors
   * @param {boolean} [options.useIcons=true] - Whether to use icons
   * @param {string} [options.defaultBoxStyle='single'] - Default box style
   */
  constructor(options = {}) {
    const {
      maxWidth = 80,
      useColors = supportsColors(),
      useIcons = true,
      defaultBoxStyle = 'single',
    } = options;

    /** @type {number} */
    this.maxWidth = maxWidth;

    /** @type {boolean} */
    this.useColors = useColors;

    /** @type {boolean} */
    this.useIcons = useIcons;

    /** @type {string} */
    this.defaultBoxStyle = defaultBoxStyle;
  }

  /**
   * Wraps text to fit within specified width
   * @param {string} text - Text to wrap
   * @param {number} width - Maximum width
   * @returns {string[]} Array of wrapped lines
   */
  wrapText(text, width) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (visibleLength(testLine) <= width) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        // Handle words longer than width
        if (visibleLength(word) > width) {
          let remaining = word;
          while (visibleLength(remaining) > width) {
            lines.push(remaining.substring(0, width));
            remaining = remaining.substring(width);
          }
          currentLine = remaining;
        } else {
          currentLine = word;
        }
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.length ? lines : [''];
  }

  /**
   * Pads text to specified width
   * @param {string} text - Text to pad
   * @param {number} width - Target width
   * @param {string} [align='left'] - Alignment (left, center, right)
   * @returns {string} Padded text
   */
  padText(text, width, align = 'left') {
    const visible = visibleLength(text);
    const padding = Math.max(0, width - visible);

    switch (align) {
      case 'center': {
        const leftPad = Math.floor(padding / 2);
        const rightPad = padding - leftPad;
        return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
      }
      case 'right':
        return ' '.repeat(padding) + text;
      default:
        return text + ' '.repeat(padding);
    }
  }

  /**
   * Creates a horizontal line
   * @param {number} width - Line width
   * @param {Object} box - Box character set
   * @param {string} color - ANSI color code
   * @returns {string} Horizontal line
   */
  horizontalLine(width, box, color) {
    const line = box.horizontal.repeat(width);
    return this.useColors ? colorize(line, color) : line;
  }

  /**
   * Formats a message in a colored box
   * @param {string} type - Message type (error, warning, success, info, debug)
   * @param {string} title - Message title
   * @param {string|string[]} content - Message content (string or array of lines)
   * @param {Object} [options={}] - Additional options
   * @param {Object} [options.details] - Additional details to show
   * @param {string[]} [options.suggestions] - Fix suggestions
   * @returns {string} Formatted message
   */
  formatBox(type, title, content, options = {}) {
    const theme = MessageThemes[type] || MessageThemes.info;
    const box = BoxChars[theme.boxStyle] || BoxChars[this.defaultBoxStyle];
    const { details, suggestions } = options;

    // Calculate content width
    const padding = 2;
    const borderWidth = 2;
    const contentWidth = this.maxWidth - borderWidth - padding * 2;

    // Process content into lines
    const contentLines = Array.isArray(content) ? content : [content];
    const wrappedLines = contentLines.flatMap((line) => this.wrapText(String(line), contentWidth));

    // Build the box
    const lines = [];

    // Icon and label
    const iconStr = this.useIcons ? `${theme.icon} ` : '';
    const labelStr = this.useColors
      ? `${theme.iconBg}${theme.iconColor}${Styles.BOLD} ${iconStr}${theme.label} ${RESET}`
      : ` ${iconStr}${theme.label} `;

    // Top border with label
    const labelWidth = visibleLength(labelStr);
    const topLineWidth = this.maxWidth - labelWidth - 4;
    const topBorder = this.useColors
      ? `${theme.borderColor}${box.topLeft}${box.horizontal}${RESET}${labelStr}${theme.borderColor}${box.horizontal.repeat(Math.max(0, topLineWidth))}${box.topRight}${RESET}`
      : `${box.topLeft}${box.horizontal}${labelStr}${box.horizontal.repeat(Math.max(0, topLineWidth))}${box.topRight}`;
    lines.push(topBorder);

    // Title line
    if (title) {
      const titleText = this.useColors
        ? `${theme.titleColor}${Styles.BOLD}${title}${RESET}`
        : title;
      const titlePadded = this.padText(titleText, contentWidth);
      const titleLine = this.useColors
        ? `${theme.borderColor}${box.vertical}${RESET} ${titlePadded} ${theme.borderColor}${box.vertical}${RESET}`
        : `${box.vertical} ${this.padText(title, contentWidth)} ${box.vertical}`;
      lines.push(titleLine);

      // Separator
      const separator = this.useColors
        ? `${theme.borderColor}${box.leftTee}${box.horizontal.repeat(this.maxWidth - 2)}${box.rightTee}${RESET}`
        : `${box.leftTee}${box.horizontal.repeat(this.maxWidth - 2)}${box.rightTee}`;
      lines.push(separator);
    }

    // Content lines
    for (const line of wrappedLines) {
      const textColored = this.useColors ? `${theme.textColor}${line}${RESET}` : line;
      const paddedLine = this.padText(textColored, contentWidth);
      const contentLine = this.useColors
        ? `${theme.borderColor}${box.vertical}${RESET} ${paddedLine} ${theme.borderColor}${box.vertical}${RESET}`
        : `${box.vertical} ${this.padText(line, contentWidth)} ${box.vertical}`;
      lines.push(contentLine);
    }

    // Details section
    if (details && Object.keys(details).length > 0) {
      // Separator
      const detailSeparator = this.useColors
        ? `${theme.borderColor}${box.leftTee}${box.horizontal.repeat(this.maxWidth - 2)}${box.rightTee}${RESET}`
        : `${box.leftTee}${box.horizontal.repeat(this.maxWidth - 2)}${box.rightTee}`;
      lines.push(detailSeparator);

      for (const [key, value] of Object.entries(details)) {
        if (value !== undefined && value !== null) {
          const detailText = `${key}: ${value}`;
          const detailColored = this.useColors
            ? `${FgColors.GRAY}${detailText}${RESET}`
            : detailText;
          const paddedDetail = this.padText(detailColored, contentWidth);
          const detailLine = this.useColors
            ? `${theme.borderColor}${box.vertical}${RESET} ${paddedDetail} ${theme.borderColor}${box.vertical}${RESET}`
            : `${box.vertical} ${this.padText(detailText, contentWidth)} ${box.vertical}`;
          lines.push(detailLine);
        }
      }
    }

    // Suggestions section
    if (suggestions && suggestions.length > 0) {
      // Separator with hint icon
      const hintSeparator = this.useColors
        ? `${theme.borderColor}${box.leftTee}${box.horizontal}${RESET}${FgColors.CYAN}${Styles.BOLD} ${Icons.WRENCH} Suggestions ${RESET}${theme.borderColor}${box.horizontal.repeat(this.maxWidth - 17)}${box.rightTee}${RESET}`
        : `${box.leftTee}${box.horizontal} Suggestions ${box.horizontal.repeat(this.maxWidth - 17)}${box.rightTee}`;
      lines.push(hintSeparator);

      for (const suggestion of suggestions) {
        const suggestionWrapped = this.wrapText(`${Icons.ARROW_RIGHT} ${suggestion}`, contentWidth);
        for (const suggLine of suggestionWrapped) {
          const suggColored = this.useColors
            ? `${FgColors.BRIGHT_CYAN}${suggLine}${RESET}`
            : suggLine;
          const paddedSugg = this.padText(suggColored, contentWidth);
          const suggestionLine = this.useColors
            ? `${theme.borderColor}${box.vertical}${RESET} ${paddedSugg} ${theme.borderColor}${box.vertical}${RESET}`
            : `${box.vertical} ${this.padText(suggLine, contentWidth)} ${box.vertical}`;
          lines.push(suggestionLine);
        }
      }
    }

    // Bottom border
    const bottomBorder = this.useColors
      ? `${theme.borderColor}${box.bottomLeft}${box.horizontal.repeat(this.maxWidth - 2)}${box.bottomRight}${RESET}`
      : `${box.bottomLeft}${box.horizontal.repeat(this.maxWidth - 2)}${box.bottomRight}`;
    lines.push(bottomBorder);

    return lines.join('\n');
  }

  /**
   * Formats an error message
   * @param {string} title - Error title
   * @param {string|string[]} content - Error content
   * @param {Object} [options={}] - Additional options
   * @returns {string} Formatted error message
   */
  error(title, content, options = {}) {
    return this.formatBox('error', title, content, options);
  }

  /**
   * Formats a warning message
   * @param {string} title - Warning title
   * @param {string|string[]} content - Warning content
   * @param {Object} [options={}] - Additional options
   * @returns {string} Formatted warning message
   */
  warning(title, content, options = {}) {
    return this.formatBox('warning', title, content, options);
  }

  /**
   * Formats a success message
   * @param {string} title - Success title
   * @param {string|string[]} content - Success content
   * @param {Object} [options={}] - Additional options
   * @returns {string} Formatted success message
   */
  success(title, content, options = {}) {
    return this.formatBox('success', title, content, options);
  }

  /**
   * Formats an info message
   * @param {string} title - Info title
   * @param {string|string[]} content - Info content
   * @param {Object} [options={}] - Additional options
   * @returns {string} Formatted info message
   */
  info(title, content, options = {}) {
    return this.formatBox('info', title, content, options);
  }

  /**
   * Formats a debug message
   * @param {string} title - Debug title
   * @param {string|string[]} content - Debug content
   * @param {Object} [options={}] - Additional options
   * @returns {string} Formatted debug message
   */
  debug(title, content, options = {}) {
    return this.formatBox('debug', title, content, options);
  }

  /**
   * Formats a hint message
   * @param {string} title - Hint title
   * @param {string|string[]} content - Hint content
   * @param {Object} [options={}] - Additional options
   * @returns {string} Formatted hint message
   */
  hint(title, content, options = {}) {
    return this.formatBox('hint', title, content, options);
  }

  /**
   * Creates a simple inline message without box
   * @param {string} type - Message type
   * @param {string} message - Message text
   * @returns {string} Formatted inline message
   */
  inline(type, message) {
    const theme = MessageThemes[type] || MessageThemes.info;
    const icon = this.useIcons ? `${theme.icon} ` : '';

    if (!this.useColors) {
      return `${icon}[${theme.label}] ${message}`;
    }

    return `${theme.iconBg}${theme.iconColor}${Styles.BOLD} ${icon}${theme.label} ${RESET} ${theme.titleColor}${message}${RESET}`;
  }
}

// ============================================================================
// Singleton Instance & Convenience Functions
// ============================================================================

/** @type {MessageFormatter} */
let defaultFormatter = null;

/**
 * Gets or creates the default formatter instance
 * @param {Object} [options] - Formatter options
 * @returns {MessageFormatter} Default formatter
 */
export function getFormatter(options) {
  if (!defaultFormatter || options) {
    defaultFormatter = new MessageFormatter(options);
  }
  return defaultFormatter;
}

/**
 * Resets the default formatter (for testing)
 */
export function resetFormatter() {
  defaultFormatter = null;
}

// Convenience functions using default formatter
export const formatError = (title, content, options) =>
  getFormatter().error(title, content, options);
export const formatWarning = (title, content, options) =>
  getFormatter().warning(title, content, options);
export const formatSuccess = (title, content, options) =>
  getFormatter().success(title, content, options);
export const formatInfo = (title, content, options) => getFormatter().info(title, content, options);
export const formatDebug = (title, content, options) =>
  getFormatter().debug(title, content, options);
export const formatHint = (title, content, options) => getFormatter().hint(title, content, options);
export const formatInline = (type, message) => getFormatter().inline(type, message);

// ============================================================================
// Default Export
// ============================================================================

export default {
  MessageFormatter,
  Icons,
  BoxChars,
  MessageThemes,
  getFormatter,
  resetFormatter,
  formatError,
  formatWarning,
  formatSuccess,
  formatInfo,
  formatDebug,
  formatHint,
  formatInline,
};
