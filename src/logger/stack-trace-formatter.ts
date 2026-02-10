/**
 * @fileoverview Enhanced stack trace formatter with syntax highlighting and filtering
 * Provides beautiful, readable stack traces with file highlighting and context.
 * @module logger/stack-trace-formatter
 */

import path from 'node:path';
import { FgColors, RESET, Styles } from './colors.js';
import { BoxChars } from './message-formatter.js';

// ============================================================================
// Stack Frame Parser
// ============================================================================

/**
 * Represents a parsed stack frame
 * @typedef {Object} StackFrame
 * @property {string} raw - Raw stack frame line
 * @property {string|null} functionName - Function name
 * @property {string|null} fileName - File name
 * @property {string|null} filePath - Full file path
 * @property {number|null} lineNumber - Line number
 * @property {number|null} columnNumber - Column number
 * @property {boolean} isNative - Whether frame is native code
 * @property {boolean} isNodeModule - Whether frame is in node_modules
 * @property {boolean} isInternal - Whether frame is Node.js internal
 * @property {boolean} isApp - Whether frame is application code
 */

/**
 * Regular expressions for parsing stack traces
 */
const STACK_PATTERNS = {
  // V8/Node.js format: at functionName (filePath:line:col) or at filePath:line:col
  v8: /^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/,
  // Anonymous function: at anonymous (filePath:line:col)
  v8Anonymous: /^\s*at\s+(?:anonymous|<anonymous>)\s*\((.+?):(\d+):(\d+)\)$/,
  // Native code: at functionName (native)
  v8Native: /^\s*at\s+(.+?)\s+\(native\)$/,
  // Eval: at eval (eval at functionName (filePath:line:col), <anonymous>:line:col)
  v8Eval: /^\s*at\s+eval\s+\(eval\s+at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/,
  // Simple: at filePath:line:col
  v8Simple: /^\s*at\s+(.+?):(\d+):(\d+)$/,
};

/**
 * Parses a stack trace string into structured frames
 * @param {string} stack - Stack trace string
 * @returns {StackFrame[]} Array of parsed stack frames
 */
export function parseStackTrace(stack) {
  if (!stack) return [];

  const lines = stack.split('\n');
  const frames = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip error message line
    if (!trimmed.startsWith('at ')) {
      continue;
    }

    const frame = parseStackFrame(trimmed);
    if (frame) {
      frames.push(frame);
    }
  }

  return frames;
}

/**
 * Parses a single stack frame line
 * @param {string} line - Stack frame line
 * @returns {StackFrame|null} Parsed frame or null
 */
export function parseStackFrame(line) {
  let match;

  // Try native pattern first
  match = line.match(STACK_PATTERNS.v8Native);
  if (match) {
    return {
      raw: line,
      functionName: match[1],
      fileName: null,
      filePath: null,
      lineNumber: null,
      columnNumber: null,
      isNative: true,
      isNodeModule: false,
      isInternal: false,
      isApp: false,
    };
  }

  // Try standard V8 pattern
  match = line.match(STACK_PATTERNS.v8);
  if (match) {
    const [, functionName, filePath, lineNumber, columnNumber] = match;
    return createFrame(line, functionName || '<anonymous>', filePath, lineNumber, columnNumber);
  }

  // Try simple pattern
  match = line.match(STACK_PATTERNS.v8Simple);
  if (match) {
    const [, filePath, lineNumber, columnNumber] = match;
    return createFrame(line, '<anonymous>', filePath, lineNumber, columnNumber);
  }

  // Try anonymous pattern
  match = line.match(STACK_PATTERNS.v8Anonymous);
  if (match) {
    const [, filePath, lineNumber, columnNumber] = match;
    return createFrame(line, '<anonymous>', filePath, lineNumber, columnNumber);
  }

  return null;
}

/**
 * Creates a stack frame object
 * @param {string} raw - Raw line
 * @param {string} functionName - Function name
 * @param {string} filePath - File path
 * @param {string} lineNumber - Line number string
 * @param {string} columnNumber - Column number string
 * @returns {StackFrame} Stack frame object
 */
function createFrame(raw, functionName, filePath, lineNumber, columnNumber) {
  const isNodeModule = filePath ? filePath.includes('node_modules') : false;
  // Check for path separator - support both Unix (/) and Windows (\)
  const hasPathSeparator = filePath ? filePath.includes('/') || filePath.includes('\\') : false;
  const isInternal = filePath
    ? filePath.startsWith('node:') || filePath.startsWith('internal/') || !hasPathSeparator
    : false;

  return {
    raw,
    functionName: functionName || null,
    fileName: filePath ? path.basename(filePath) : null,
    filePath: filePath || null,
    lineNumber: lineNumber ? parseInt(lineNumber, 10) : null,
    columnNumber: columnNumber ? parseInt(columnNumber, 10) : null,
    isNative: false,
    isNodeModule,
    isInternal,
    isApp: !isNodeModule && !isInternal,
  };
}

// ============================================================================
// Stack Trace Formatter Class
// ============================================================================

/**
 * Options for stack trace formatting
 * @typedef {Object} StackFormatterOptions
 * @property {boolean} [useColors=true] - Use ANSI colors
 * @property {boolean} [showNodeModules=false] - Show node_modules frames
 * @property {boolean} [showInternals=false] - Show Node.js internal frames
 * @property {number} [maxFrames=10] - Maximum frames to show
 * @property {boolean} [showFullPaths=false] - Show full file paths
 * @property {string} [cwd] - Current working directory for relative paths
 * @property {boolean} [highlightApp=true] - Highlight application code frames
 */

/**
 * Formats stack traces with syntax highlighting and filtering
 */
export class StackTraceFormatter {
  /**
   * Creates a new StackTraceFormatter
   * @param {StackFormatterOptions} [options={}] - Formatter options
   */
  constructor(options = {}) {
    const {
      useColors = true,
      showNodeModules = false,
      showInternals = false,
      maxFrames = 10,
      showFullPaths = false,
      cwd = process.cwd(),
      highlightApp = true,
    } = options;

    /** @type {boolean} */
    this.useColors = useColors;

    /** @type {boolean} */
    this.showNodeModules = showNodeModules;

    /** @type {boolean} */
    this.showInternals = showInternals;

    /** @type {number} */
    this.maxFrames = maxFrames;

    /** @type {boolean} */
    this.showFullPaths = showFullPaths;

    /** @type {string} */
    this.cwd = cwd;

    /** @type {boolean} */
    this.highlightApp = highlightApp;
  }

  /**
   * Formats a stack trace
   * @param {string|Error} error - Error or stack trace string
   * @param {Object} [options={}] - Override options
   * @returns {string} Formatted stack trace
   */
  format(error, options = {}) {
    const stack = error instanceof Error ? error.stack : error;
    if (!stack) return '';

    const frames = parseStackTrace(stack);
    const opts = { ...this, ...options };

    // Filter frames
    let filtered = frames.filter((frame) => {
      if (!opts.showNodeModules && frame.isNodeModule) return false;
      if (!opts.showInternals && frame.isInternal) return false;
      return true;
    });

    // Limit frames
    const totalFiltered = filtered.length;
    const hiddenCount = totalFiltered - opts.maxFrames;
    filtered = filtered.slice(0, opts.maxFrames);

    // Format each frame
    const lines = [];

    // Header
    lines.push(this.formatHeader());

    // Frames
    filtered.forEach((frame, index) => {
      const isLast = index === filtered.length - 1 && hiddenCount <= 0;
      lines.push(this.formatFrame(frame, index, isLast, opts));
    });

    // Hidden count notice
    if (hiddenCount > 0) {
      lines.push(this.formatHiddenNotice(hiddenCount));
    }

    return lines.join('\n');
  }

  /**
   * Formats the stack trace header
   * @returns {string} Formatted header
   */
  formatHeader() {
    const label = 'Stack Trace';
    if (!this.useColors) {
      return `\n${label}:`;
    }
    return `\n${FgColors.GRAY}${Styles.BOLD}${label}:${RESET}`;
  }

  /**
   * Formats a single stack frame
   * @param {StackFrame} frame - Stack frame
   * @param {number} index - Frame index
   * @param {boolean} isLast - Whether this is the last frame
   * @param {Object} opts - Options
   * @returns {string} Formatted frame
   */
  formatFrame(frame, _index, isLast, opts) {
    const box = BoxChars.single;
    const prefix = isLast ? box.corner : box.tee;
    const indent = '  ';

    if (frame.isNative) {
      return this.formatNativeFrame(frame, prefix, indent);
    }

    // Format location
    const location = this.formatLocation(frame, opts);

    // Format function name
    const funcName = this.formatFunctionName(frame, opts);

    // Build the line
    const linePrefix = `${indent}${prefix}${box.horizontal}`;

    if (!this.useColors) {
      return `${linePrefix} ${funcName} ${location}`;
    }

    // Highlight application code
    const prefixColor = frame.isApp && opts.highlightApp ? FgColors.BRIGHT_CYAN : FgColors.GRAY;

    return `${prefixColor}${linePrefix}${RESET} ${funcName} ${location}`;
  }

  /**
   * Formats a native frame
   * @param {StackFrame} frame - Stack frame
   * @param {string} prefix - Line prefix character
   * @param {string} indent - Indentation
   * @returns {string} Formatted native frame
   */
  formatNativeFrame(frame, prefix, indent) {
    const box = BoxChars.single;
    const linePrefix = `${indent}${prefix}${box.horizontal}`;

    if (!this.useColors) {
      return `${linePrefix} ${frame.functionName} (native)`;
    }

    return `${FgColors.GRAY}${linePrefix}${RESET} ${FgColors.GRAY}${frame.functionName}${RESET} ${FgColors.GRAY}(native)${RESET}`;
  }

  /**
   * Formats the function name
   * @param {StackFrame} frame - Stack frame
   * @param {Object} opts - Options
   * @returns {string} Formatted function name
   */
  formatFunctionName(frame, opts) {
    const name = frame.functionName || '<anonymous>';

    if (!this.useColors) {
      return name;
    }

    // Color based on frame type
    if (frame.isApp && opts.highlightApp) {
      return `${FgColors.BRIGHT_WHITE}${Styles.BOLD}${name}${RESET}`;
    }

    if (frame.isNodeModule) {
      return `${FgColors.GRAY}${name}${RESET}`;
    }

    return `${FgColors.WHITE}${name}${RESET}`;
  }

  /**
   * Formats the file location
   * @param {StackFrame} frame - Stack frame
   * @param {Object} opts - Options
   * @returns {string} Formatted location
   */
  formatLocation(frame, opts) {
    if (!frame.filePath) {
      return '';
    }

    // Get display path
    let displayPath = frame.filePath;
    if (!opts.showFullPaths && frame.filePath.startsWith(opts.cwd)) {
      displayPath = path.relative(opts.cwd, frame.filePath);
    }

    // Build location string
    const location = frame.lineNumber
      ? `${displayPath}:${frame.lineNumber}${frame.columnNumber ? `:${frame.columnNumber}` : ''}`
      : displayPath;

    if (!this.useColors) {
      return `(${location})`;
    }

    // Color the different parts
    const pathColor = frame.isApp && opts.highlightApp ? FgColors.CYAN : FgColors.GRAY;

    const lineColor = frame.isApp && opts.highlightApp ? FgColors.YELLOW : FgColors.GRAY;

    if (frame.lineNumber) {
      return `${FgColors.GRAY}(${RESET}${pathColor}${displayPath}${RESET}${FgColors.GRAY}:${RESET}${lineColor}${frame.lineNumber}${frame.columnNumber ? `:${frame.columnNumber}` : ''}${RESET}${FgColors.GRAY})${RESET}`;
    }

    return `${FgColors.GRAY}(${RESET}${pathColor}${displayPath}${RESET}${FgColors.GRAY})${RESET}`;
  }

  /**
   * Formats the hidden frames notice
   * @param {number} count - Number of hidden frames
   * @returns {string} Formatted notice
   */
  formatHiddenNotice(count) {
    const box = BoxChars.single;
    const message = `... ${count} more frame${count > 1 ? 's' : ''} hidden`;

    if (!this.useColors) {
      return `  ${box.corner}${box.horizontal} ${message}`;
    }

    return `  ${FgColors.GRAY}${box.corner}${box.horizontal} ${Styles.DIM}${message}${RESET}`;
  }

  /**
   * Creates a compact one-line summary of the error location
   * @param {string|Error} error - Error or stack trace
   * @returns {string} Compact location string
   */
  getErrorLocation(error) {
    const stack = error instanceof Error ? error.stack : error;
    const frames = parseStackTrace(stack);

    // Find first app frame
    const appFrame = frames.find((f) => f.isApp) || frames[0];

    if (!appFrame || !appFrame.filePath) {
      return '';
    }

    const relativePath = appFrame.filePath.startsWith(this.cwd)
      ? path.relative(this.cwd, appFrame.filePath)
      : appFrame.fileName || appFrame.filePath;

    const location = `${relativePath}:${appFrame.lineNumber || '?'}`;

    if (!this.useColors) {
      return location;
    }

    return `${FgColors.CYAN}${location}${RESET}`;
  }
}

// ============================================================================
// Singleton Instance & Convenience Functions
// ============================================================================

/** @type {StackTraceFormatter} */
let defaultFormatter = null;

/**
 * Gets or creates the default formatter instance
 * @param {StackFormatterOptions} [options] - Formatter options
 * @returns {StackTraceFormatter} Default formatter
 */
export function getStackFormatter(options) {
  if (!defaultFormatter || options) {
    defaultFormatter = new StackTraceFormatter(options);
  }
  return defaultFormatter;
}

/**
 * Resets the default formatter (for testing)
 */
export function resetStackFormatter() {
  defaultFormatter = null;
}

/**
 * Formats a stack trace using default formatter
 * @param {string|Error} error - Error or stack trace
 * @param {Object} [options] - Override options
 * @returns {string} Formatted stack trace
 */
export function formatStackTrace(error, options) {
  return getStackFormatter().format(error, options);
}

/**
 * Gets compact error location using default formatter
 * @param {string|Error} error - Error or stack trace
 * @returns {string} Compact location
 */
export function getErrorLocation(error) {
  return getStackFormatter().getErrorLocation(error);
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  StackTraceFormatter,
  parseStackTrace,
  parseStackFrame,
  getStackFormatter,
  resetStackFormatter,
  formatStackTrace,
  getErrorLocation,
};
