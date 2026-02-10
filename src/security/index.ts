/**
 * @fileoverview Central security module export
 * Provides unified access to security patterns, enforcer, and audit logging.
 * @module security
 */

// ============================================================================
// Pattern Exports
// ============================================================================

export {
  BLOCKED_COMMANDS,
  DANGEROUS_PATH_PATTERNS,
  DANGEROUS_PATTERNS,
  default as patterns,
  getMatchingPatterns,
  isBlockedCommand,
  isDangerousPath,
  isSensitivePath,
  matchesAnyPattern,
  PATTERN_RISK_LEVELS,
  RiskLevel,
  SENSITIVE_PATTERNS,
  SHELL_ESCAPE_CHARS,
  SUSPICIOUS_NETWORK_PATTERNS,
} from './patterns.js';

// ============================================================================
// Enforcer Exports
// ============================================================================

export {
  default as enforcer,
  getSecurityEnforcer,
  isCommandSafe,
  isPathSafe,
  resetSecurityEnforcer,
  SecurityEnforcer,
} from './enforcer.js';

// ============================================================================
// Safe Command Exports
// ============================================================================

export {
  ALLOWED_EXECUTABLES,
  CommandSecurityError,
  SAFE_GIT_SUBCOMMANDS,
  safeGit,
  safeSpawn,
  safeWhich,
  validateArgs,
  validateExecutable,
  validateGitCommand,
} from './safe-command.js';

// ============================================================================
// Audit Logger Exports
// ============================================================================

export {
  AuditLogger,
  auditChildLogger,
  auditLoggerReady,
  default as auditLogger,
} from './audit-logger.js';

// ============================================================================
// Convenience Re-exports
// ============================================================================

import auditLogger from './audit-logger.js';
import { getSecurityEnforcer } from './enforcer.js';

/**
 * Quick security check for a command
 * @param {string} command - Command to check
 * @returns {Object} Security check result
 */
export function checkCommand(command) {
  return getSecurityEnforcer().checkCommand(command);
}

/**
 * Quick security check for a path
 * @param {string} path - Path to check
 * @param {Object} [options] - Check options
 * @returns {Object} Path check result
 */
export function checkPath(path, options) {
  return getSecurityEnforcer().checkPath(path, options);
}

/**
 * Quick risk assessment
 * @param {Object} context - Context to assess
 * @returns {Object} Risk assessment result
 */
export function assessRisk(context) {
  return getSecurityEnforcer().assessRisk(context);
}

/**
 * Logs a security event
 * @param {string} event - Event description
 * @param {string} [severity] - Severity level
 * @param {Object} [context] - Additional context
 */
export function logSecurityEvent(event, severity, context) {
  return auditLogger.logSecurityEvent(event, severity, context);
}

/**
 * Logs a command execution
 * @param {string} command - Command executed
 * @param {Object} [context] - Execution context
 */
export function logCommand(command, context) {
  return auditLogger.logCommand(command, context);
}

// ============================================================================
// Module Initialization
// ============================================================================

/**
 * Initializes the security module with custom configuration
 * @param {Object} [options={}] - Configuration options
 * @param {Object} [options.enforcer] - SecurityEnforcer options
 * @param {Object} [options.auditLogger] - AuditLogger options
 * @returns {Promise<void>}
 */
export async function initializeSecurity(options = {}) {
  const { enforcer: enforcerOptions, auditLogger: auditOptions } = options;

  // Configure the enforcer
  if (enforcerOptions) {
    getSecurityEnforcer().configure(enforcerOptions);
  }

  // Wait for audit logger initialization
  const { auditLoggerReady } = await import('./audit-logger.js');
  await auditLoggerReady;
}

// ============================================================================
// Default Export
// ============================================================================

/**
 * Security module facade providing easy access to all security features
 */
export default {
  // Pattern checking
  patterns: {
    DANGEROUS_PATTERNS: null, // Lazy loaded
    BLOCKED_COMMANDS: null,
    SENSITIVE_PATTERNS: null,
    matchesAny: null,
    isBlocked: null,
    isSensitive: null,
    isDangerous: null,
  },

  // Security enforcement
  enforcer: getSecurityEnforcer(),

  // Audit logging
  audit: auditLogger,

  // Convenience methods
  checkCommand,
  checkPath,
  assessRisk,
  logSecurityEvent,
  logCommand,
  initialize: initializeSecurity,
};

// Lazy load pattern functions into default export
import('./patterns.js')
  .then((patterns) => {
    const defaultExport = {
      patterns: {
        DANGEROUS_PATTERNS: patterns.DANGEROUS_PATTERNS,
        BLOCKED_COMMANDS: patterns.BLOCKED_COMMANDS,
        SENSITIVE_PATTERNS: patterns.SENSITIVE_PATTERNS,
        matchesAny: patterns.matchesAnyPattern,
        isBlocked: patterns.isBlockedCommand,
        isSensitive: patterns.isSensitivePath,
        isDangerous: patterns.isDangerousPath,
      },
    };
    Object.assign(module?.exports?.default?.patterns || {}, defaultExport.patterns);
  })
  .catch(() => {
    // Ignore errors in lazy loading
  });
