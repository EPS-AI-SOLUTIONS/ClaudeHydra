/**
 * @fileoverview Error formatting utilities for AppError
 * Provides beautiful terminal output with boxes, icons, stack traces, and suggestions.
 * @module errors/error-formatter
 */

import {
  generateDiagnostics,
  generateSuggestions,
  getTroubleshootingSteps,
} from '../logger/fix-suggestions.js';
import { getFormatter } from '../logger/message-formatter.js';
import { formatStackTrace, getErrorLocation } from '../logger/stack-trace-formatter.js';
import { AppError } from './AppError.js';

// ============================================================================
// Error Formatter Class
// ============================================================================

/**
 * Formats errors with beautiful terminal output
 */
export class ErrorFormatter {
  /**
   * Creates a new ErrorFormatter
   * @param {Object} [options={}] - Formatter options
   * @param {number} [options.maxWidth=80] - Maximum width for boxes
   * @param {boolean} [options.useColors=true] - Use ANSI colors
   * @param {boolean} [options.showSuggestions=true] - Show fix suggestions
   * @param {boolean} [options.showStack=false] - Show stack trace
   * @param {boolean} [options.showDetails=true] - Show error details
   */
  constructor(options = {}) {
    const {
      maxWidth = 80,
      useColors = true,
      showSuggestions = true,
      showStack = false,
      showDetails = true,
    } = options;

    /** @type {number} */
    this.maxWidth = maxWidth;

    /** @type {boolean} */
    this.useColors = useColors;

    /** @type {boolean} */
    this.showSuggestions = showSuggestions;

    /** @type {boolean} */
    this.showStack = showStack;

    /** @type {boolean} */
    this.showDetails = showDetails;

    /** @type {Object} */
    this.messageFormatter = getFormatter({ maxWidth, useColors });
  }

  /**
   * Formats an error as a beautiful terminal message
   * @param {Error|AppError} error - Error to format
   * @param {Object} [options={}] - Override options
   * @returns {string} Formatted error message
   */
  format(error, options = {}) {
    const opts = { ...this, ...options };
    const isAppError = error instanceof AppError;

    // Build content
    const content = [error.message];

    // Build details
    const details = this.buildDetails(error, opts);

    // Get suggestions
    const suggestions = opts.showSuggestions ? generateSuggestions(error).suggestions : [];

    // Determine error type and title
    const errorName = isAppError ? error.name : error.name || 'Error';

    // Format main box
    let output = this.messageFormatter.error(errorName, content, {
      details: opts.showDetails ? details : {},
      suggestions,
    });

    // Add stack trace
    if (opts.showStack && error.stack) {
      output += `\n${formatStackTrace(error)}`;
    }

    // Add cause chain
    if (isAppError && error.cause) {
      output += `\n${this.formatCause(error.cause, opts)}`;
    }

    return output;
  }

  /**
   * Builds details object from error
   * @param {Error|AppError} error - Error object
   * @param {Object} opts - Options
   * @returns {Object} Details object
   */
  buildDetails(error, _opts) {
    const details = {};
    const isAppError = error instanceof AppError;

    // Add code if available
    if (error.code) {
      details.Code = error.code;
    }

    // Add status code for AppError
    if (isAppError && error.statusCode) {
      details.Status = error.statusCode;
    }

    // Add timestamp
    if (isAppError && error.timestamp) {
      details.Time = error.timestamp;
    }

    // Add request ID
    if (isAppError && error.requestId) {
      details['Request ID'] = error.requestId;
    }

    // Add location
    const location = getErrorLocation(error);
    if (location) {
      details.Location = location;
    }

    // Add context from AppError
    if (isAppError && error.context) {
      for (const [key, value] of Object.entries(error.context)) {
        if (value !== undefined && value !== null && !details[key]) {
          // Capitalize first letter
          const displayKey = key.charAt(0).toUpperCase() + key.slice(1);
          details[displayKey] = typeof value === 'object' ? JSON.stringify(value) : String(value);
        }
      }
    }

    return details;
  }

  /**
   * Formats cause chain
   * @param {Error} cause - Cause error
   * @param {Object} opts - Options
   * @returns {string} Formatted cause
   */
  formatCause(cause, _opts) {
    const causeName = cause instanceof AppError ? cause.name : cause.name || 'Cause';
    const causeDetails = {};

    if (cause.code) {
      causeDetails.Code = cause.code;
    }

    return this.messageFormatter.formatBox(
      'warning',
      `Caused by: ${causeName}`,
      [cause.message || String(cause)],
      { details: causeDetails },
    );
  }

  /**
   * Formats error as compact inline message
   * @param {Error|AppError} error - Error to format
   * @returns {string} Inline formatted error
   */
  formatInline(error) {
    const code = error.code || error.name || 'Error';
    return this.messageFormatter.inline('error', `[${code}] ${error.message}`);
  }

  /**
   * Formats a warning message
   * @param {string} title - Warning title
   * @param {string|string[]} message - Warning message
   * @param {Object} [options={}] - Options
   * @returns {string} Formatted warning
   */
  warning(title, message, options = {}) {
    return this.messageFormatter.warning(title, message, options);
  }

  /**
   * Formats a success message
   * @param {string} title - Success title
   * @param {string|string[]} message - Success message
   * @param {Object} [options={}] - Options
   * @returns {string} Formatted success
   */
  success(title, message, options = {}) {
    return this.messageFormatter.success(title, message, options);
  }

  /**
   * Formats an info message
   * @param {string} title - Info title
   * @param {string|string[]} message - Info message
   * @param {Object} [options={}] - Options
   * @returns {string} Formatted info
   */
  info(title, message, options = {}) {
    return this.messageFormatter.info(title, message, options);
  }

  /**
   * Prints formatted error to console
   * @param {Error|AppError} error - Error to print
   * @param {Object} [options={}] - Options
   */
  print(error, options = {}) {
    console.error(this.format(error, options));
  }

  /**
   * Prints formatted error with full diagnostics
   * @param {Error|AppError} error - Error to print
   */
  printDiagnostic(error) {
    console.error(this.format(error, { showStack: true, showSuggestions: true }));

    const diagnostics = generateDiagnostics(error);
    console.error(
      `\n${this.info('Diagnostics', [
        `Error Type: ${diagnostics.errorType}`,
        `Severity: ${diagnostics.severity}`,
        `Recoverable: ${diagnostics.isRecoverable ? 'Yes' : 'No'}`,
        `Affected: ${diagnostics.affectedSystems.join(', ') || 'Unknown'}`,
      ])}`,
    );
  }
}

// ============================================================================
// Extend AppError with formatting methods
// ============================================================================

// Only extend if not already extended
if (!AppError.prototype.format) {
  /**
   * Formats the error as a beautiful terminal message
   * @param {Object} [options={}] - Formatting options
   * @returns {string} Formatted error
   */
  AppError.prototype.format = function (options = {}) {
    const formatter = new ErrorFormatter(options);
    return formatter.format(this, options);
  };

  /**
   * Formats the error as a compact inline message
   * @returns {string} Inline formatted error
   */
  AppError.prototype.formatInline = function () {
    const formatter = new ErrorFormatter();
    return formatter.formatInline(this);
  };

  /**
   * Prints the formatted error to console
   * @param {Object} [options={}] - Formatting options
   */
  AppError.prototype.print = function (options = {}) {
    const formatter = new ErrorFormatter(options);
    formatter.print(this, options);
  };

  /**
   * Prints full diagnostic output
   */
  AppError.prototype.printDiagnostic = function () {
    const formatter = new ErrorFormatter();
    formatter.printDiagnostic(this);
  };

  /**
   * Gets diagnostic information
   * @returns {Object} Diagnostics
   */
  AppError.prototype.getDiagnostics = function () {
    return generateDiagnostics(this);
  };

  /**
   * Gets troubleshooting steps
   * @returns {string[]} Steps
   */
  AppError.prototype.getTroubleshootingSteps = function () {
    return getTroubleshootingSteps(this);
  };

  /**
   * Gets formatted stack trace
   * @param {Object} [options={}] - Options
   * @returns {string} Formatted stack
   */
  AppError.prototype.formatStackTrace = function (options = {}) {
    return formatStackTrace(this, options);
  };
}

// ============================================================================
// Singleton & Convenience Functions
// ============================================================================

/** @type {ErrorFormatter} */
let defaultFormatter = null;

/**
 * Gets or creates default error formatter
 * @param {Object} [options] - Options
 * @returns {ErrorFormatter} Default formatter
 */
export function getErrorFormatter(options) {
  if (!defaultFormatter || options) {
    defaultFormatter = new ErrorFormatter(options);
  }
  return defaultFormatter;
}

/**
 * Resets default formatter
 */
export function resetErrorFormatter() {
  defaultFormatter = null;
}

/**
 * Formats an error using default formatter
 * @param {Error} error - Error to format
 * @param {Object} [options] - Options
 * @returns {string} Formatted error
 */
export function formatError(error, options = {}) {
  return getErrorFormatter().format(error, options);
}

/**
 * Formats error as inline message
 * @param {Error} error - Error to format
 * @returns {string} Inline error
 */
export function formatErrorInline(error) {
  return getErrorFormatter().formatInline(error);
}

/**
 * Prints formatted error to console
 * @param {Error} error - Error to print
 * @param {Object} [options] - Options
 */
export function printError(error, options = {}) {
  getErrorFormatter().print(error, options);
}

/**
 * Prints full diagnostic output
 * @param {Error} error - Error to diagnose
 */
export function printDiagnostic(error) {
  getErrorFormatter().printDiagnostic(error);
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  ErrorFormatter,
  getErrorFormatter,
  resetErrorFormatter,
  formatError,
  formatErrorInline,
  printError,
  printDiagnostic,
};
