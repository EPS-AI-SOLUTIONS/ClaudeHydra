/**
 * @fileoverview Central logger module export
 * Provides unified access to logger, colors, and rotation utilities.
 * @module logger
 */

// ============================================================================
// Color Exports
// ============================================================================

export {
  BgColors,
  bg256,
  bgHex,
  bgRGB,
  blue,
  bold,
  COLORS,
  colorize,
  createColorFormatter,
  cyan,
  debug,
  default as colors,
  dim,
  // Semantic colors
  error,
  FgColors,
  // Extended colors
  fg256,
  fgHex,
  fgRGB,
  getColorDepth,
  gray,
  green,
  grey,
  info,
  inverse,
  italic,
  magenta,
  RESET,
  // Convenience colors
  red,
  Styles,
  strikethrough,
  stripAnsi,
  success,
  supportsColors,
  underline,
  visibleLength,
  warning,
  white,
  yellow,
} from './colors.js';

// ============================================================================
// Rotation Exports
// ============================================================================

export {
  default as rotation,
  getLogRotation,
  LogRotation,
  resetLogRotation,
} from './rotation.js';

// ============================================================================
// Message Formatter Exports
// ============================================================================

export {
  BoxChars,
  default as messageFormatter,
  formatDebug as formatDebugBox,
  formatError as formatErrorBox,
  formatHint,
  formatInfo as formatInfoBox,
  formatInline,
  formatSuccess as formatSuccessBox,
  formatWarning as formatWarningBox,
  getFormatter,
  Icons,
  MessageFormatter,
  MessageThemes,
  resetFormatter,
} from './message-formatter.js';

// ============================================================================
// Stack Trace Formatter Exports
// ============================================================================

export {
  default as stackTraceFormatter,
  formatStackTrace,
  getErrorLocation,
  getStackFormatter,
  parseStackFrame,
  parseStackTrace,
  resetStackFormatter,
  StackTraceFormatter,
} from './stack-trace-formatter.js';

// ============================================================================
// Fix Suggestions Exports
// ============================================================================

export {
  default as fixSuggestions,
  generateDiagnostics,
  generateSuggestions,
  getLinksForCode,
  getSuggestionsForCode,
  getTitleForCode,
  getTroubleshootingSteps,
} from './fix-suggestions.js';

// ============================================================================
// Default Export
// ============================================================================

import { COLORS, colorize, stripAnsi, supportsColors } from './colors.js';
import {
  generateDiagnostics,
  generateSuggestions,
  getTroubleshootingSteps,
} from './fix-suggestions.js';
import { BoxChars, getFormatter, Icons, MessageFormatter } from './message-formatter.js';
import { getLogRotation, LogRotation } from './rotation.js';
import {
  formatStackTrace,
  getErrorLocation,
  StackTraceFormatter,
} from './stack-trace-formatter.js';

/**
 * Logger utilities facade
 */
export default {
  // Color utilities
  colors: {
    COLORS,
    supportsColors,
    colorize,
    stripAnsi,
  },

  // Rotation utilities
  rotation: {
    LogRotation,
    getLogRotation,
  },

  // Message formatting utilities
  formatter: {
    MessageFormatter,
    getFormatter,
    Icons,
    BoxChars,
  },

  // Stack trace formatting
  stackTrace: {
    StackTraceFormatter,
    formatStackTrace,
    getErrorLocation,
  },

  // Fix suggestions
  suggestions: {
    generateSuggestions,
    generateDiagnostics,
    getTroubleshootingSteps,
  },
};
