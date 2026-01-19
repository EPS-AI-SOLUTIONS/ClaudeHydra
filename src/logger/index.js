/**
 * @fileoverview Central logger module export
 * Provides unified access to logger, colors, and rotation utilities.
 * @module logger
 */

// ============================================================================
// Color Exports
// ============================================================================

export {
  COLORS,
  RESET,
  Styles,
  FgColors,
  BgColors,
  supportsColors,
  getColorDepth,
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
  bgHex,
  default as colors
} from './colors.js';

// ============================================================================
// Rotation Exports
// ============================================================================

export {
  LogRotation,
  getLogRotation,
  resetLogRotation,
  default as rotation
} from './rotation.js';

// ============================================================================
// Default Export
// ============================================================================

import { COLORS, supportsColors, colorize, stripAnsi } from './colors.js';
import { LogRotation, getLogRotation } from './rotation.js';

/**
 * Logger utilities facade
 */
export default {
  // Color utilities
  colors: {
    COLORS,
    supportsColors,
    colorize,
    stripAnsi
  },

  // Rotation utilities
  rotation: {
    LogRotation,
    getLogRotation
  }
};
