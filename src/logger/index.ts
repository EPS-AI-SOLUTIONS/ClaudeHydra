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
// Message Formatter Exports
// ============================================================================

export {
  MessageFormatter,
  Icons,
  BoxChars,
  MessageThemes,
  getFormatter,
  resetFormatter,
  formatError as formatErrorBox,
  formatWarning as formatWarningBox,
  formatSuccess as formatSuccessBox,
  formatInfo as formatInfoBox,
  formatDebug as formatDebugBox,
  formatHint,
  formatInline,
  default as messageFormatter
} from './message-formatter.js';

// ============================================================================
// Stack Trace Formatter Exports
// ============================================================================

export {
  StackTraceFormatter,
  parseStackTrace,
  parseStackFrame,
  getStackFormatter,
  resetStackFormatter,
  formatStackTrace,
  getErrorLocation,
  default as stackTraceFormatter
} from './stack-trace-formatter.js';

// ============================================================================
// Fix Suggestions Exports
// ============================================================================

export {
  generateSuggestions,
  generateDiagnostics,
  getTroubleshootingSteps,
  getSuggestionsForCode,
  getTitleForCode,
  getLinksForCode,
  default as fixSuggestions
} from './fix-suggestions.js';

// ============================================================================
// Default Export
// ============================================================================

import { COLORS, supportsColors, colorize, stripAnsi } from './colors.js';
import { LogRotation, getLogRotation } from './rotation.js';
import { MessageFormatter, getFormatter, Icons, BoxChars } from './message-formatter.js';
import { StackTraceFormatter, formatStackTrace, getErrorLocation } from './stack-trace-formatter.js';
import { generateSuggestions, generateDiagnostics, getTroubleshootingSteps } from './fix-suggestions.js';

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
  },

  // Message formatting utilities
  formatter: {
    MessageFormatter,
    getFormatter,
    Icons,
    BoxChars
  },

  // Stack trace formatting
  stackTrace: {
    StackTraceFormatter,
    formatStackTrace,
    getErrorLocation
  },

  // Fix suggestions
  suggestions: {
    generateSuggestions,
    generateDiagnostics,
    getTroubleshootingSteps
  }
};
