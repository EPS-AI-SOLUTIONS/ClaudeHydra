/**
 * @fileoverview Security Enforcer for command and path validation
 * Provides centralized security checks for shell commands, file paths, and inputs.
 * @module security/enforcer
 */

import { join, normalize, resolve, isAbsolute } from 'node:path';
import {
  DANGEROUS_PATTERNS,
  BLOCKED_COMMANDS,
  SENSITIVE_PATTERNS,
  DANGEROUS_PATH_PATTERNS,
  SUSPICIOUS_NETWORK_PATTERNS,
  SHELL_ESCAPE_CHARS,
  RiskLevel,
  matchesAnyPattern,
  getMatchingPatterns,
  isBlockedCommand,
  isSensitivePath,
  isDangerousPath
} from './patterns.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * @typedef {Object} SecurityCheckResult
 * @property {boolean} safe - Whether the input is considered safe
 * @property {string} risk - Risk level (none, low, medium, high, critical)
 * @property {string[]} reasons - Array of reasons for the risk assessment
 * @property {string[]} matchedPatterns - Patterns that matched (as strings)
 * @property {string[]} suggestions - Suggested mitigations or alternatives
 */

/**
 * @typedef {Object} PathCheckResult
 * @property {boolean} safe - Whether the path is considered safe
 * @property {string} risk - Risk level
 * @property {boolean} sensitive - Whether the path is sensitive
 * @property {boolean} traversal - Whether path traversal was detected
 * @property {string} normalizedPath - Normalized absolute path
 * @property {string[]} reasons - Array of reasons
 */

/**
 * @typedef {Object} RiskAssessment
 * @property {string} level - Overall risk level
 * @property {number} score - Numeric risk score (0-100)
 * @property {Object} breakdown - Breakdown by category
 * @property {string} recommendation - Recommended action
 */

/**
 * @typedef {Object} SecurityEnforcerOptions
 * @property {boolean} [strictMode=false] - Enable strict mode (block medium risk)
 * @property {string} [basePath] - Base path for path validation
 * @property {string[]} [allowedPaths] - Whitelist of allowed paths
 * @property {string[]} [blockedPaths] - Additional blocked paths
 * @property {boolean} [allowNetworkAccess=true] - Allow network-related commands
 * @property {Function} [onViolation] - Callback for security violations
 */

// ============================================================================
// SecurityEnforcer Class
// ============================================================================

/**
 * Central security enforcement for commands, paths, and inputs
 */
export class SecurityEnforcer {
  /**
   * Creates a new SecurityEnforcer instance
   * @param {SecurityEnforcerOptions} [options={}] - Configuration options
   */
  constructor(options = {}) {
    const {
      strictMode = false,
      basePath = process.cwd(),
      allowedPaths = [],
      blockedPaths = [],
      allowNetworkAccess = true,
      onViolation = null
    } = options;

    /** @type {boolean} */
    this.strictMode = strictMode;

    /** @type {string} */
    this.basePath = resolve(basePath);

    /** @type {Set<string>} */
    this.allowedPaths = new Set(allowedPaths.map(p => resolve(p)));

    /** @type {Set<string>} */
    this.blockedPaths = new Set(blockedPaths.map(p => resolve(p)));

    /** @type {boolean} */
    this.allowNetworkAccess = allowNetworkAccess;

    /** @type {Function|null} */
    this.onViolation = onViolation;

    /** @type {Map<string, number>} */
    this._violationHistory = new Map();

    /** @type {number} */
    this._violationThreshold = 10;
  }

  // ==========================================================================
  // Command Validation
  // ==========================================================================

  /**
   * Checks if a shell command is safe to execute
   * @param {string} command - Command to check
   * @returns {SecurityCheckResult} Security check result
   */
  checkCommand(command) {
    if (!command || typeof command !== 'string') {
      return {
        safe: false,
        risk: RiskLevel.HIGH,
        reasons: ['Invalid or empty command'],
        matchedPatterns: [],
        suggestions: ['Provide a valid command string']
      };
    }

    const result = {
      safe: true,
      risk: RiskLevel.NONE,
      reasons: [],
      matchedPatterns: [],
      suggestions: []
    };

    // Check for blocked commands first
    if (isBlockedCommand(command)) {
      result.safe = false;
      result.risk = RiskLevel.CRITICAL;
      result.reasons.push('Command is in the blocked list');
      result.suggestions.push('This command is not allowed for security reasons');
      this._recordViolation('blocked_command', command);
      return result;
    }

    // Check for dangerous patterns
    const dangerousMatches = getMatchingPatterns(command, DANGEROUS_PATTERNS);
    if (dangerousMatches.length > 0) {
      result.safe = false;
      result.risk = RiskLevel.CRITICAL;
      result.reasons.push(`Matches ${dangerousMatches.length} dangerous pattern(s)`);
      result.matchedPatterns = dangerousMatches.map(p => p.source);
      result.suggestions.push('Review command for potential security risks');
      this._recordViolation('dangerous_pattern', command);
    }

    // Check for suspicious network patterns
    if (!this.allowNetworkAccess) {
      const networkMatches = getMatchingPatterns(command, SUSPICIOUS_NETWORK_PATTERNS);
      if (networkMatches.length > 0) {
        result.safe = false;
        result.risk = this._elevateRisk(result.risk, RiskLevel.HIGH);
        result.reasons.push('Contains suspicious network activity');
        result.matchedPatterns.push(...networkMatches.map(p => p.source));
        result.suggestions.push('Network access is restricted');
      }
    }

    // Check for shell metacharacters that might indicate injection
    const dangerousChars = this._checkShellMetacharacters(command);
    if (dangerousChars.length > 0) {
      result.risk = this._elevateRisk(result.risk, RiskLevel.MEDIUM);
      result.reasons.push(`Contains potentially dangerous characters: ${dangerousChars.join(', ')}`);
      result.suggestions.push('Consider escaping special characters');
    }

    // Apply strict mode
    if (this.strictMode && result.risk === RiskLevel.MEDIUM) {
      result.safe = false;
      result.reasons.push('Strict mode blocks medium-risk commands');
    }

    // Trigger violation callback if unsafe
    if (!result.safe && this.onViolation) {
      this.onViolation({
        type: 'command',
        input: command,
        result
      });
    }

    return result;
  }

  // ==========================================================================
  // Path Validation
  // ==========================================================================

  /**
   * Checks if a file path is safe to access
   * @param {string} filePath - Path to check
   * @param {Object} [options={}] - Check options
   * @param {string} [options.operation='read'] - Operation type (read, write, delete)
   * @param {boolean} [options.allowAbsolute=true] - Allow absolute paths
   * @returns {PathCheckResult} Path check result
   */
  checkPath(filePath, options = {}) {
    const { operation = 'read', allowAbsolute = true } = options;

    if (!filePath || typeof filePath !== 'string') {
      return {
        safe: false,
        risk: RiskLevel.HIGH,
        sensitive: false,
        traversal: false,
        normalizedPath: '',
        reasons: ['Invalid or empty path']
      };
    }

    const result = {
      safe: true,
      risk: RiskLevel.NONE,
      sensitive: false,
      traversal: false,
      normalizedPath: '',
      reasons: []
    };

    // Normalize the path
    let normalizedPath;
    try {
      if (isAbsolute(filePath)) {
        if (!allowAbsolute) {
          result.safe = false;
          result.risk = RiskLevel.MEDIUM;
          result.reasons.push('Absolute paths are not allowed');
          return result;
        }
        normalizedPath = normalize(filePath);
      } else {
        normalizedPath = resolve(this.basePath, filePath);
      }
    } catch {
      result.safe = false;
      result.risk = RiskLevel.HIGH;
      result.reasons.push('Path normalization failed');
      return result;
    }

    result.normalizedPath = normalizedPath;

    // Check for path traversal
    if (isDangerousPath(filePath) || isDangerousPath(normalizedPath)) {
      result.safe = false;
      result.risk = RiskLevel.HIGH;
      result.traversal = true;
      result.reasons.push('Path traversal detected');
      this._recordViolation('path_traversal', filePath);
    }

    // Check if path is within allowed base
    if (!normalizedPath.startsWith(this.basePath)) {
      // Check if it's in the allowed paths whitelist
      const isAllowed = Array.from(this.allowedPaths).some(
        allowed => normalizedPath.startsWith(allowed)
      );

      if (!isAllowed) {
        result.safe = false;
        result.risk = this._elevateRisk(result.risk, RiskLevel.MEDIUM);
        result.reasons.push('Path is outside allowed directory');
      }
    }

    // Check if path is in blocked list
    const isBlocked = Array.from(this.blockedPaths).some(
      blocked => normalizedPath.startsWith(blocked)
    );

    if (isBlocked) {
      result.safe = false;
      result.risk = RiskLevel.HIGH;
      result.reasons.push('Path is in blocked list');
    }

    // Check for sensitive files
    if (isSensitivePath(filePath) || isSensitivePath(normalizedPath)) {
      result.sensitive = true;

      if (operation === 'write' || operation === 'delete') {
        result.safe = false;
        result.risk = this._elevateRisk(result.risk, RiskLevel.HIGH);
        result.reasons.push(`Sensitive file ${operation} operation blocked`);
      } else {
        result.risk = this._elevateRisk(result.risk, RiskLevel.MEDIUM);
        result.reasons.push('Path points to a sensitive file');
      }
    }

    // Apply strict mode
    if (this.strictMode && result.risk === RiskLevel.MEDIUM) {
      result.safe = false;
      result.reasons.push('Strict mode blocks medium-risk paths');
    }

    // Trigger violation callback if unsafe
    if (!result.safe && this.onViolation) {
      this.onViolation({
        type: 'path',
        input: filePath,
        operation,
        result
      });
    }

    return result;
  }

  // ==========================================================================
  // Risk Assessment
  // ==========================================================================

  /**
   * Assesses overall risk for an operation
   * @param {Object} context - Operation context
   * @param {string} [context.command] - Command to assess
   * @param {string} [context.path] - Path to assess
   * @param {string} [context.input] - User input to assess
   * @param {string} [context.network] - Network URL/address to assess
   * @returns {RiskAssessment} Risk assessment result
   */
  assessRisk(context = {}) {
    const breakdown = {
      command: RiskLevel.NONE,
      path: RiskLevel.NONE,
      input: RiskLevel.NONE,
      network: RiskLevel.NONE
    };

    let totalScore = 0;
    const reasons = [];

    // Assess command risk
    if (context.command) {
      const cmdResult = this.checkCommand(context.command);
      breakdown.command = cmdResult.risk;
      totalScore += this._riskToScore(cmdResult.risk);
      if (cmdResult.reasons.length > 0) {
        reasons.push(...cmdResult.reasons.map(r => `[Command] ${r}`));
      }
    }

    // Assess path risk
    if (context.path) {
      const pathResult = this.checkPath(context.path);
      breakdown.path = pathResult.risk;
      totalScore += this._riskToScore(pathResult.risk);
      if (pathResult.reasons.length > 0) {
        reasons.push(...pathResult.reasons.map(r => `[Path] ${r}`));
      }
    }

    // Assess user input
    if (context.input) {
      const inputRisk = this._assessInputRisk(context.input);
      breakdown.input = inputRisk.level;
      totalScore += this._riskToScore(inputRisk.level);
      if (inputRisk.reasons.length > 0) {
        reasons.push(...inputRisk.reasons.map(r => `[Input] ${r}`));
      }
    }

    // Assess network risk
    if (context.network) {
      const networkMatches = getMatchingPatterns(context.network, SUSPICIOUS_NETWORK_PATTERNS);
      if (networkMatches.length > 0) {
        breakdown.network = RiskLevel.MEDIUM;
        totalScore += this._riskToScore(RiskLevel.MEDIUM);
        reasons.push('[Network] Suspicious network pattern detected');
      }
    }

    // Calculate overall level
    const averageScore = totalScore / Object.keys(breakdown).length;
    const level = this._scoreToRisk(averageScore);

    // Determine recommendation
    let recommendation;
    if (level === RiskLevel.CRITICAL) {
      recommendation = 'BLOCK: Operation should not be allowed';
    } else if (level === RiskLevel.HIGH) {
      recommendation = 'DENY: Operation requires special authorization';
    } else if (level === RiskLevel.MEDIUM) {
      recommendation = this.strictMode
        ? 'DENY: Strict mode enabled'
        : 'WARN: Proceed with caution';
    } else if (level === RiskLevel.LOW) {
      recommendation = 'ALLOW: Monitor operation';
    } else {
      recommendation = 'ALLOW: Operation appears safe';
    }

    return {
      level,
      score: Math.round(averageScore),
      breakdown,
      reasons,
      recommendation
    };
  }

  // ==========================================================================
  // Input Sanitization
  // ==========================================================================

  /**
   * Sanitizes input by escaping shell metacharacters
   * @param {string} input - Input to sanitize
   * @returns {string} Sanitized input
   */
  sanitizeInput(input) {
    if (!input || typeof input !== 'string') return '';

    let sanitized = input;

    // Escape shell metacharacters
    for (const char of SHELL_ESCAPE_CHARS) {
      if (sanitized.includes(char)) {
        sanitized = sanitized.split(char).join('\\' + char);
      }
    }

    return sanitized;
  }

  /**
   * Sanitizes a path by normalizing and removing dangerous sequences
   * @param {string} filePath - Path to sanitize
   * @returns {string} Sanitized path
   */
  sanitizePath(filePath) {
    if (!filePath || typeof filePath !== 'string') return '';

    // Remove null bytes
    let sanitized = filePath.replace(/\x00/g, '');

    // Remove URL encoding
    sanitized = decodeURIComponent(sanitized);

    // Normalize path separators
    sanitized = sanitized.replace(/\\/g, '/');

    // Remove consecutive dots
    sanitized = sanitized.replace(/\.{3,}/g, '..');

    // Normalize the path
    sanitized = normalize(sanitized);

    return sanitized;
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  /**
   * Updates enforcer configuration
   * @param {SecurityEnforcerOptions} options - New options
   */
  configure(options = {}) {
    if (typeof options.strictMode === 'boolean') {
      this.strictMode = options.strictMode;
    }

    if (options.basePath) {
      this.basePath = resolve(options.basePath);
    }

    if (Array.isArray(options.allowedPaths)) {
      this.allowedPaths = new Set(options.allowedPaths.map(p => resolve(p)));
    }

    if (Array.isArray(options.blockedPaths)) {
      this.blockedPaths = new Set(options.blockedPaths.map(p => resolve(p)));
    }

    if (typeof options.allowNetworkAccess === 'boolean') {
      this.allowNetworkAccess = options.allowNetworkAccess;
    }

    if (typeof options.onViolation === 'function' || options.onViolation === null) {
      this.onViolation = options.onViolation;
    }
  }

  /**
   * Gets current configuration
   * @returns {SecurityEnforcerOptions} Current configuration
   */
  getConfig() {
    return {
      strictMode: this.strictMode,
      basePath: this.basePath,
      allowedPaths: Array.from(this.allowedPaths),
      blockedPaths: Array.from(this.blockedPaths),
      allowNetworkAccess: this.allowNetworkAccess,
      onViolation: this.onViolation
    };
  }

  /**
   * Gets violation history statistics
   * @returns {Object} Violation statistics
   */
  getViolationStats() {
    return {
      total: Array.from(this._violationHistory.values()).reduce((a, b) => a + b, 0),
      byType: Object.fromEntries(this._violationHistory)
    };
  }

  /**
   * Clears violation history
   */
  clearViolationHistory() {
    this._violationHistory.clear();
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Checks for dangerous shell metacharacters
   * @private
   * @param {string} input - Input to check
   * @returns {string[]} Found dangerous characters
   */
  _checkShellMetacharacters(input) {
    const found = [];
    for (const char of SHELL_ESCAPE_CHARS) {
      if (input.includes(char) && !found.includes(char)) {
        found.push(char);
      }
    }
    return found;
  }

  /**
   * Assesses risk level of user input
   * @private
   * @param {string} input - Input to assess
   * @returns {{level: string, reasons: string[]}} Risk assessment
   */
  _assessInputRisk(input) {
    const reasons = [];
    let level = RiskLevel.NONE;

    // Check for shell injection patterns
    const shellMetachars = this._checkShellMetacharacters(input);
    if (shellMetachars.length > 3) {
      level = this._elevateRisk(level, RiskLevel.HIGH);
      reasons.push('Multiple shell metacharacters detected');
    } else if (shellMetachars.length > 0) {
      level = this._elevateRisk(level, RiskLevel.LOW);
      reasons.push('Shell metacharacters detected');
    }

    // Check input length
    if (input.length > 10000) {
      level = this._elevateRisk(level, RiskLevel.MEDIUM);
      reasons.push('Unusually long input');
    }

    // Check for common injection patterns
    if (/\$\{.*\}/.test(input) || /\$\(.*\)/.test(input)) {
      level = this._elevateRisk(level, RiskLevel.HIGH);
      reasons.push('Variable/command substitution detected');
    }

    return { level, reasons };
  }

  /**
   * Records a security violation
   * @private
   * @param {string} type - Violation type
   * @param {string} input - Input that caused violation
   */
  _recordViolation(type, input) {
    const count = this._violationHistory.get(type) || 0;
    this._violationHistory.set(type, count + 1);
  }

  /**
   * Elevates risk to higher level
   * @private
   * @param {string} current - Current risk level
   * @param {string} candidate - Candidate risk level
   * @returns {string} Higher risk level
   */
  _elevateRisk(current, candidate) {
    const levels = [RiskLevel.NONE, RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH, RiskLevel.CRITICAL];
    const currentIdx = levels.indexOf(current);
    const candidateIdx = levels.indexOf(candidate);
    return levels[Math.max(currentIdx, candidateIdx)];
  }

  /**
   * Converts risk level to numeric score
   * @private
   * @param {string} level - Risk level
   * @returns {number} Numeric score (0-100)
   */
  _riskToScore(level) {
    const scores = {
      [RiskLevel.NONE]: 0,
      [RiskLevel.LOW]: 25,
      [RiskLevel.MEDIUM]: 50,
      [RiskLevel.HIGH]: 75,
      [RiskLevel.CRITICAL]: 100
    };
    return scores[level] || 0;
  }

  /**
   * Converts numeric score to risk level
   * @private
   * @param {number} score - Numeric score
   * @returns {string} Risk level
   */
  _scoreToRisk(score) {
    if (score >= 80) return RiskLevel.CRITICAL;
    if (score >= 60) return RiskLevel.HIGH;
    if (score >= 40) return RiskLevel.MEDIUM;
    if (score >= 20) return RiskLevel.LOW;
    return RiskLevel.NONE;
  }
}

// ============================================================================
// Default Instance
// ============================================================================

/** @type {SecurityEnforcer} */
let defaultEnforcer = null;

/**
 * Gets the default SecurityEnforcer instance (singleton)
 * @param {SecurityEnforcerOptions} [options] - Configuration options (only used on first call)
 * @returns {SecurityEnforcer} Default enforcer instance
 */
export function getSecurityEnforcer(options) {
  if (!defaultEnforcer) {
    defaultEnforcer = new SecurityEnforcer(options);
  }
  return defaultEnforcer;
}

/**
 * Resets the default enforcer instance (useful for testing)
 */
export function resetSecurityEnforcer() {
  defaultEnforcer = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick check if a command is safe (using default enforcer)
 * @param {string} command - Command to check
 * @returns {boolean} True if safe
 */
export function isCommandSafe(command) {
  return getSecurityEnforcer().checkCommand(command).safe;
}

/**
 * Quick check if a path is safe (using default enforcer)
 * @param {string} filePath - Path to check
 * @param {string} [operation='read'] - Operation type
 * @returns {boolean} True if safe
 */
export function isPathSafe(filePath, operation = 'read') {
  return getSecurityEnforcer().checkPath(filePath, { operation }).safe;
}

// ============================================================================
// Default Export
// ============================================================================

export default SecurityEnforcer;
