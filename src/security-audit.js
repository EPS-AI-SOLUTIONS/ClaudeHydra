/**
 * @fileoverview Security Audit Module for GeminiCLI
 * Provides comprehensive security scanning, input sanitization, API key validation,
 * file permission checking, and security reporting.
 * @module security-audit
 */

import { readFile, stat, access, readdir } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve, normalize, isAbsolute } from 'node:path';
import { createLogger } from './logger.js';

const execAsync = promisify(exec);

// Create child logger for security audit
const logger = createLogger('security-audit');

// ============================================================================
// Attack Pattern Definitions
// ============================================================================

/**
 * XSS (Cross-Site Scripting) attack patterns
 * @type {ReadonlyArray<RegExp>}
 */
export const XSS_PATTERNS = Object.freeze([
  // Script tags
  /<script\b[^>]*>[\s\S]*?<\/script>/gi,
  /<script\b[^>]*>/gi,

  // JavaScript protocol
  /javascript\s*:/gi,
  /vbscript\s*:/gi,
  /data\s*:\s*text\/html/gi,

  // Event handlers (onX=)
  /\bon\w+\s*=\s*["']?[^"']*["']?/gi,
  /\bon(load|error|click|mouse|focus|blur|key|submit|change|input|scroll|resize|drag|drop|copy|paste|cut)\s*=/gi,

  // Iframe injection
  /<iframe\b[^>]*>/gi,
  /<frame\b[^>]*>/gi,
  /<frameset\b[^>]*>/gi,

  // Object/embed injection
  /<object\b[^>]*>/gi,
  /<embed\b[^>]*>/gi,
  /<applet\b[^>]*>/gi,

  // SVG with scripts
  /<svg\b[^>]*onload\s*=/gi,
  /<svg\b[^>]*>[\s\S]*?<script/gi,

  // Base tag hijacking
  /<base\b[^>]*>/gi,

  // Link injection
  /<link\b[^>]*>/gi,

  // Meta refresh
  /<meta\b[^>]*http-equiv\s*=\s*["']?refresh/gi,

  // Style with expression
  /expression\s*\(/gi,
  /url\s*\(\s*["']?\s*javascript/gi,

  // HTML entities encoding attacks
  /&#x?[0-9a-f]+;/gi,

  // Template injection
  /\{\{.*\}\}/g,
  /\$\{.*\}/g
]);

/**
 * SQL Injection attack patterns
 * @type {ReadonlyArray<RegExp>}
 */
export const SQL_INJECTION_PATTERNS = Object.freeze([
  // Basic SQL keywords
  /\bSELECT\b[\s\S]*\bFROM\b/gi,
  /\bINSERT\b[\s\S]*\bINTO\b/gi,
  /\bUPDATE\b[\s\S]*\bSET\b/gi,
  /\bDELETE\b[\s\S]*\bFROM\b/gi,
  /\bDROP\b[\s\S]*\b(TABLE|DATABASE|INDEX|VIEW)\b/gi,
  /\bTRUNCATE\b[\s\S]*\bTABLE\b/gi,
  /\bALTER\b[\s\S]*\bTABLE\b/gi,
  /\bCREATE\b[\s\S]*\b(TABLE|DATABASE|INDEX|VIEW|PROCEDURE|FUNCTION)\b/gi,

  // Union-based injection
  /\bUNION\b[\s\S]*\bSELECT\b/gi,
  /\bUNION\b[\s\S]*\bALL\b[\s\S]*\bSELECT\b/gi,

  // Comment-based injection
  /--\s*$/gm,
  /\/\*[\s\S]*?\*\//g,
  /#\s*$/gm,

  // Tautology attacks
  /'\s*OR\s*'?1'?\s*=\s*'?1/gi,
  /"\s*OR\s*"?1"?\s*=\s*"?1/gi,
  /'\s*OR\s*'?\w+'?\s*=\s*'?\w+/gi,
  /\bOR\s+1\s*=\s*1\b/gi,
  /\bOR\s+true\b/gi,
  /\bAND\s+1\s*=\s*1\b/gi,

  // Time-based injection
  /\bWAITFOR\b[\s\S]*\bDELAY\b/gi,
  /\bSLEEP\s*\(/gi,
  /\bBENCHMARK\s*\(/gi,
  /\bPG_SLEEP\s*\(/gi,

  // Error-based injection
  /\bCONVERT\s*\(/gi,
  /\bCAST\s*\(/gi,
  /\bEXTRACTVALUE\s*\(/gi,

  // Stacked queries
  /;\s*(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)\b/gi,

  // Stored procedure calls
  /\bEXEC(UTE)?\s+(xp_|sp_)/gi,
  /\bxp_cmdshell\b/gi,

  // Information schema access
  /\bINFORMATION_SCHEMA\b/gi,
  /\bSYSCOLUMNS\b/gi,
  /\bSYSOBJECTS\b/gi,

  // Quote escaping attempts
  /'\s*;\s*--/gi,
  /'\s*;\s*#/gi,
  /\\x27/gi,
  /\\x22/gi
]);

/**
 * Command Injection attack patterns
 * @type {ReadonlyArray<RegExp>}
 */
export const COMMAND_INJECTION_PATTERNS = Object.freeze([
  // Command separators
  /[;&|]/g,
  /\|\|/g,
  /&&/g,

  // Backtick execution
  /`[^`]+`/g,

  // $() command substitution
  /\$\([^)]+\)/g,
  /\$\{[^}]+\}/g,

  // Newline injection
  /[\r\n]/g,
  /%0[aAdD]/gi,

  // Redirect operators
  /[<>]/g,
  />>/g,
  /2>&1/g,

  // Common dangerous commands
  /\b(rm|del|format|mkfs|dd|wget|curl|nc|netcat|telnet|ssh|ftp)\b/gi,

  // Shell metacharacters
  /[$`\\!]/g,

  // Wildcard expansion
  /[*?]/g,

  // Home directory expansion
  /~/g,

  // Process substitution
  /<\([^)]+\)/g,
  />\([^)]+\)/g,

  // Here documents
  /<<[^<]/g,

  // Encoded characters
  /%[0-9a-f]{2}/gi,
  /\\x[0-9a-f]{2}/gi,
  /\\[0-7]{1,3}/g
]);

/**
 * Path Traversal attack patterns
 * @type {ReadonlyArray<RegExp>}
 */
export const PATH_TRAVERSAL_PATTERNS = Object.freeze([
  // Basic traversal
  /\.\.\//g,
  /\.\.\\/g,

  // URL encoded traversal
  /%2e%2e%2f/gi,
  /%2e%2e\//gi,
  /\.\.%2f/gi,
  /%2e%2e%5c/gi,
  /%2e%2e\\/gi,
  /\.\.%5c/gi,

  // Double URL encoded
  /%252e%252e%252f/gi,
  /%252e%252e%255c/gi,

  // Unicode/UTF-8 encoded
  /\.%c0%af/gi,
  /\.%c1%9c/gi,
  /%c0%ae%c0%ae%c0%af/gi,

  // Mixed case variations
  /\.\.\/|\.\.\\|\.\.\//gi,

  // Null byte injection
  /%00/g,
  /\x00/g,

  // Absolute paths (potential bypass)
  /^\/etc\//i,
  /^\/root\//i,
  /^\/home\//i,
  /^[a-z]:\\/i,
  /^\\\\[^\\]+\\/i,

  // Windows specific
  /\.\.;/g,
  /::$DATA/gi
]);

// ============================================================================
// Dependency Auditing
// ============================================================================

/**
 * Audits npm dependencies for known vulnerabilities
 * @param {string} [packageJsonPath] - Path to package.json (defaults to current directory)
 * @returns {Promise<Object>} Audit results with vulnerabilities and recommendations
 */
export async function auditDependencies(packageJsonPath = './package.json') {
  const startTime = Date.now();
  logger.info('Starting dependency audit', { packageJsonPath });

  const results = {
    timestamp: new Date().toISOString(),
    packagePath: packageJsonPath,
    vulnerabilities: [],
    summary: {
      total: 0,
      critical: 0,
      high: 0,
      moderate: 0,
      low: 0,
      info: 0
    },
    recommendations: [],
    auditDuration: 0
  };

  try {
    // Resolve path
    const resolvedPath = isAbsolute(packageJsonPath)
      ? packageJsonPath
      : resolve(process.cwd(), packageJsonPath);

    // Read package.json
    const packageJson = JSON.parse(await readFile(resolvedPath, 'utf8'));
    results.packageName = packageJson.name || 'unknown';
    results.packageVersion = packageJson.version || '0.0.0';

    // Get directory for npm audit
    const packageDir = join(resolvedPath, '..');

    // Run npm audit
    try {
      const { stdout } = await execAsync('npm audit --json', {
        cwd: packageDir,
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      const auditData = JSON.parse(stdout);

      // Process vulnerabilities
      if (auditData.vulnerabilities) {
        for (const [name, vuln] of Object.entries(auditData.vulnerabilities)) {
          const vulnEntry = {
            package: name,
            severity: vuln.severity || 'unknown',
            via: Array.isArray(vuln.via) ? vuln.via.map(v => typeof v === 'string' ? v : v.title || v.name) : [],
            effects: vuln.effects || [],
            range: vuln.range || '*',
            fixAvailable: vuln.fixAvailable || false
          };

          results.vulnerabilities.push(vulnEntry);
          results.summary.total++;

          // Count by severity
          const severity = (vuln.severity || 'info').toLowerCase();
          if (results.summary.hasOwnProperty(severity)) {
            results.summary[severity]++;
          } else {
            results.summary.info++;
          }
        }
      }

      // Process metadata
      if (auditData.metadata) {
        results.metadata = {
          dependencies: auditData.metadata.dependencies || 0,
          devDependencies: auditData.metadata.devDependencies || 0,
          optionalDependencies: auditData.metadata.optionalDependencies || 0,
          totalDependencies: auditData.metadata.totalDependencies || 0
        };
      }

    } catch (execError) {
      // npm audit returns non-zero exit code when vulnerabilities found
      if (execError.stdout) {
        try {
          const auditData = JSON.parse(execError.stdout);

          if (auditData.vulnerabilities) {
            for (const [name, vuln] of Object.entries(auditData.vulnerabilities)) {
              results.vulnerabilities.push({
                package: name,
                severity: vuln.severity || 'unknown',
                via: Array.isArray(vuln.via) ? vuln.via.map(v => typeof v === 'string' ? v : v.title || v.name) : [],
                effects: vuln.effects || [],
                range: vuln.range || '*',
                fixAvailable: vuln.fixAvailable || false
              });

              results.summary.total++;
              const severity = (vuln.severity || 'info').toLowerCase();
              if (results.summary.hasOwnProperty(severity)) {
                results.summary[severity]++;
              }
            }
          }
        } catch {
          logger.warn('Failed to parse npm audit output', { error: execError.message });
        }
      }
    }

    // Generate recommendations
    if (results.summary.critical > 0) {
      results.recommendations.push({
        priority: 'critical',
        action: 'Immediately update packages with critical vulnerabilities',
        command: 'npm audit fix --force'
      });
    }

    if (results.summary.high > 0) {
      results.recommendations.push({
        priority: 'high',
        action: 'Update packages with high severity vulnerabilities',
        command: 'npm audit fix'
      });
    }

    if (results.summary.moderate > 0 || results.summary.low > 0) {
      results.recommendations.push({
        priority: 'medium',
        action: 'Review and update remaining vulnerable packages',
        command: 'npm update'
      });
    }

    // Check for outdated packages
    try {
      const { stdout: outdatedOutput } = await execAsync('npm outdated --json', {
        cwd: packageDir,
        timeout: 30000
      });

      if (outdatedOutput) {
        const outdated = JSON.parse(outdatedOutput);
        const outdatedCount = Object.keys(outdated).length;

        if (outdatedCount > 0) {
          results.recommendations.push({
            priority: 'low',
            action: `${outdatedCount} packages are outdated - consider updating`,
            command: 'npm update'
          });
          results.outdatedPackages = outdatedCount;
        }
      }
    } catch {
      // npm outdated returns non-zero when packages are outdated - ignore
    }

    results.status = results.summary.critical > 0 || results.summary.high > 0 ? 'vulnerable' : 'secure';

  } catch (error) {
    logger.error('Dependency audit failed', { error: error.message });
    results.error = error.message;
    results.status = 'error';
  }

  results.auditDuration = Date.now() - startTime;
  logger.info('Dependency audit completed', {
    status: results.status,
    vulnerabilities: results.summary.total,
    duration: results.auditDuration
  });

  return results;
}

// ============================================================================
// Input Sanitization
// ============================================================================

/**
 * @typedef {Object} SanitizeOptions
 * @property {boolean} [allowHtml=false] - Allow HTML tags (with sanitization)
 * @property {boolean} [allowSpecialChars=false] - Allow special characters
 * @property {number} [maxLength=10000] - Maximum input length
 * @property {boolean} [trimWhitespace=true] - Trim leading/trailing whitespace
 * @property {boolean} [logThreats=true] - Log detected threats
 * @property {string[]} [allowedTags=[]] - List of allowed HTML tags (if allowHtml=true)
 * @property {boolean} [escapeHtml=true] - Escape HTML entities
 * @property {boolean} [checkXss=true] - Check for XSS patterns
 * @property {boolean} [checkSqlInjection=true] - Check for SQL injection patterns
 * @property {boolean} [checkCommandInjection=true] - Check for command injection patterns
 * @property {boolean} [checkPathTraversal=true] - Check for path traversal patterns
 */

/**
 * @typedef {Object} SanitizeResult
 * @property {string} sanitized - The sanitized input
 * @property {boolean} wasModified - Whether the input was modified
 * @property {string[]} threats - List of detected threat types
 * @property {Object[]} detectedPatterns - Detailed pattern matches
 */

/**
 * Sanitizes input against XSS, SQL injection, command injection, and path traversal attacks
 * @param {string} input - The input string to sanitize
 * @param {SanitizeOptions} [options={}] - Sanitization options
 * @returns {SanitizeResult} Sanitization result with sanitized string and threat info
 */
export function sanitizeInput(input, options = {}) {
  const {
    allowHtml = false,
    allowSpecialChars = false,
    maxLength = 10000,
    trimWhitespace = true,
    logThreats = true,
    allowedTags = [],
    escapeHtml = true,
    checkXss = true,
    checkSqlInjection = true,
    checkCommandInjection = true,
    checkPathTraversal = true
  } = options;

  const result = {
    sanitized: '',
    wasModified: false,
    threats: [],
    detectedPatterns: []
  };

  // Handle non-string input
  if (input === null || input === undefined) {
    result.sanitized = '';
    return result;
  }

  if (typeof input !== 'string') {
    input = String(input);
    result.wasModified = true;
  }

  let sanitized = input;

  // Trim whitespace
  if (trimWhitespace) {
    const trimmed = sanitized.trim();
    if (trimmed !== sanitized) {
      result.wasModified = true;
      sanitized = trimmed;
    }
  }

  // Enforce max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
    result.wasModified = true;
    result.threats.push('length_exceeded');

    if (logThreats) {
      logger.warn('Input exceeded max length', { originalLength: input.length, maxLength });
    }
  }

  // Check for XSS patterns
  if (checkXss) {
    for (const pattern of XSS_PATTERNS) {
      const matches = sanitized.match(pattern);
      if (matches) {
        result.threats.push('xss');
        result.detectedPatterns.push({
          type: 'xss',
          pattern: pattern.source,
          matches: matches.slice(0, 5) // Limit to first 5 matches
        });

        // Remove XSS patterns
        sanitized = sanitized.replace(pattern, '');
        result.wasModified = true;

        if (logThreats) {
          logger.warn('XSS pattern detected and removed', {
            pattern: pattern.source,
            matchCount: matches.length
          });
        }
      }
    }
  }

  // Check for SQL injection patterns
  if (checkSqlInjection) {
    for (const pattern of SQL_INJECTION_PATTERNS) {
      const matches = sanitized.match(pattern);
      if (matches) {
        result.threats.push('sql_injection');
        result.detectedPatterns.push({
          type: 'sql_injection',
          pattern: pattern.source,
          matches: matches.slice(0, 5)
        });

        // Escape SQL special characters
        sanitized = sanitized.replace(pattern, '');
        result.wasModified = true;

        if (logThreats) {
          logger.warn('SQL injection pattern detected and removed', {
            pattern: pattern.source,
            matchCount: matches.length
          });
        }
      }
    }
  }

  // Check for command injection patterns
  if (checkCommandInjection && !allowSpecialChars) {
    for (const pattern of COMMAND_INJECTION_PATTERNS) {
      const matches = sanitized.match(pattern);
      if (matches) {
        result.threats.push('command_injection');
        result.detectedPatterns.push({
          type: 'command_injection',
          pattern: pattern.source,
          matches: matches.slice(0, 5)
        });

        // Remove dangerous characters
        sanitized = sanitized.replace(pattern, '');
        result.wasModified = true;

        if (logThreats) {
          logger.warn('Command injection pattern detected and removed', {
            pattern: pattern.source,
            matchCount: matches.length
          });
        }
      }
    }
  }

  // Check for path traversal patterns
  if (checkPathTraversal) {
    for (const pattern of PATH_TRAVERSAL_PATTERNS) {
      const matches = sanitized.match(pattern);
      if (matches) {
        result.threats.push('path_traversal');
        result.detectedPatterns.push({
          type: 'path_traversal',
          pattern: pattern.source,
          matches: matches.slice(0, 5)
        });

        // Remove traversal patterns
        sanitized = sanitized.replace(pattern, '');
        result.wasModified = true;

        if (logThreats) {
          logger.warn('Path traversal pattern detected and removed', {
            pattern: pattern.source,
            matchCount: matches.length
          });
        }
      }
    }
  }

  // Escape HTML if required
  if (escapeHtml && !allowHtml) {
    const escaped = sanitized
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');

    if (escaped !== sanitized) {
      result.wasModified = true;
      sanitized = escaped;
    }
  } else if (allowHtml && allowedTags.length > 0) {
    // Allow only specified tags
    const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/gi;
    sanitized = sanitized.replace(tagPattern, (match, tagName) => {
      if (allowedTags.includes(tagName.toLowerCase())) {
        return match;
      }
      result.wasModified = true;
      return '';
    });
  }

  // Remove null bytes
  const withoutNulls = sanitized.replace(/\x00/g, '');
  if (withoutNulls !== sanitized) {
    result.wasModified = true;
    result.threats.push('null_byte_injection');
    sanitized = withoutNulls;

    if (logThreats) {
      logger.warn('Null byte injection detected and removed');
    }
  }

  // Deduplicate threats
  result.threats = [...new Set(result.threats)];
  result.sanitized = sanitized;

  return result;
}

// ============================================================================
// API Key Validation
// ============================================================================

/**
 * API key validation patterns for supported providers
 * @type {Object<string, RegExp[]>}
 */
const API_KEY_PATTERNS = {
  gemini: [
    /^[a-zA-Z0-9_-]{39}$/, // Standard format
    /^AIza[a-zA-Z0-9_-]{35}$/ // Google API key format
  ],
  ollama: [
    /^ollama_[a-zA-Z0-9]{16,}$/, // Ollama token format
    /^[a-zA-Z0-9-_]{8,}$/ // Custom Ollama key format
  ]
};

/**
 * @typedef {Object} ApiKeyValidationResult
 * @property {boolean} valid - Whether the key is valid
 * @property {string} provider - The provider name
 * @property {string} format - The matched format type
 * @property {string[]} errors - Validation errors
 * @property {Object} metadata - Additional metadata about the key
 */

/**
 * Validates API key format for specific providers
 * @param {string} key - The API key to validate
 * @param {string} provider - The provider name ('gemini' or 'ollama')
 * @returns {ApiKeyValidationResult} Validation result
 */
export function validateApiKey(key, provider) {
  const result = {
    valid: false,
    provider: provider,
    format: null,
    errors: [],
    metadata: {
      length: 0,
      hasSpecialChars: false,
      entropy: 0
    }
  };

  // Validate provider
  const normalizedProvider = (provider || '').toLowerCase().trim();
  if (!['gemini', 'ollama'].includes(normalizedProvider)) {
    result.errors.push(`Unsupported provider: ${provider}. Supported providers: gemini, ollama`);
    logger.warn('API key validation failed - unsupported provider', { provider });
    return result;
  }

  // Validate key presence
  if (!key || typeof key !== 'string') {
    result.errors.push('API key is required and must be a string');
    logger.warn('API key validation failed - missing or invalid key');
    return result;
  }

  const trimmedKey = key.trim();
  result.metadata.length = trimmedKey.length;

  // Check for empty key
  if (trimmedKey.length === 0) {
    result.errors.push('API key cannot be empty');
    logger.warn('API key validation failed - empty key');
    return result;
  }

  // Check for whitespace
  if (/\s/.test(trimmedKey)) {
    result.errors.push('API key cannot contain whitespace');
    logger.warn('API key validation failed - contains whitespace');
    return result;
  }

  // Calculate basic entropy (character diversity)
  const uniqueChars = new Set(trimmedKey).size;
  result.metadata.entropy = Math.round((uniqueChars / trimmedKey.length) * 100) / 100;
  result.metadata.hasSpecialChars = /[^a-zA-Z0-9]/.test(trimmedKey);

  // Get patterns for provider
  const patterns = API_KEY_PATTERNS[normalizedProvider];

  // Test against each pattern
  let matched = false;
  for (let i = 0; i < patterns.length; i++) {
    if (patterns[i].test(trimmedKey)) {
      matched = true;
      result.format = i === 0 ? 'standard' : 'alternative';
      break;
    }
  }

  if (matched) {
    result.valid = true;
    logger.debug('API key validated successfully', {
      provider: normalizedProvider,
      format: result.format,
      length: result.metadata.length
    });
  } else {
    // Provide specific error messages
    if (normalizedProvider === 'gemini') {
      if (trimmedKey.length !== 39 && !trimmedKey.startsWith('AIza')) {
        result.errors.push('Gemini API key should be 39 characters or start with "AIza"');
      } else {
        result.errors.push('Gemini API key format is invalid');
      }
    } else if (normalizedProvider === 'ollama') {
      if (trimmedKey.length < 8) {
        result.errors.push('Ollama API key must be at least 8 characters');
      } else {
        result.errors.push('Ollama API key format is invalid');
      }
    }

    logger.warn('API key validation failed - format mismatch', {
      provider: normalizedProvider,
      keyLength: result.metadata.length
    });
  }

  return result;
}

// ============================================================================
// File Permission Checking
// ============================================================================

/**
 * @typedef {Object} PermissionCheckResult
 * @property {string} path - The checked path
 * @property {boolean} exists - Whether the path exists
 * @property {boolean} readable - Whether the path is readable
 * @property {boolean} writable - Whether the path is writable
 * @property {boolean} executable - Whether the path is executable
 * @property {Object} stats - File statistics
 * @property {string[]} warnings - Security warnings
 * @property {string[]} recommendations - Security recommendations
 */

/**
 * Checks file/directory permissions and provides security recommendations
 * @param {string} targetPath - The path to check
 * @returns {Promise<PermissionCheckResult>} Permission check results
 */
export async function checkPermissions(targetPath) {
  const result = {
    path: targetPath,
    exists: false,
    readable: false,
    writable: false,
    executable: false,
    stats: null,
    warnings: [],
    recommendations: []
  };

  if (!targetPath || typeof targetPath !== 'string') {
    result.warnings.push('Invalid path provided');
    logger.warn('Permission check failed - invalid path');
    return result;
  }

  // Normalize and resolve path
  const normalizedPath = normalize(targetPath);
  const resolvedPath = isAbsolute(normalizedPath)
    ? normalizedPath
    : resolve(process.cwd(), normalizedPath);

  result.path = resolvedPath;

  // Check for path traversal attempts
  if (targetPath.includes('..') || targetPath.includes('%2e')) {
    result.warnings.push('Path traversal pattern detected in input');
    logger.warn('Permission check - path traversal detected', { path: targetPath });
  }

  try {
    // Check if path exists
    const stats = await stat(resolvedPath);
    result.exists = true;
    result.stats = {
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      isSymlink: stats.isSymbolicLink(),
      size: stats.size,
      mode: stats.mode.toString(8),
      uid: stats.uid,
      gid: stats.gid,
      created: stats.birthtime,
      modified: stats.mtime,
      accessed: stats.atime
    };

    // Check readable
    try {
      await access(resolvedPath, fsConstants.R_OK);
      result.readable = true;
    } catch {
      result.readable = false;
    }

    // Check writable
    try {
      await access(resolvedPath, fsConstants.W_OK);
      result.writable = true;
    } catch {
      result.writable = false;
    }

    // Check executable
    try {
      await access(resolvedPath, fsConstants.X_OK);
      result.executable = true;
    } catch {
      result.executable = false;
    }

    // Security analysis
    const modeStr = stats.mode.toString(8);
    const permissions = modeStr.slice(-3);

    // Check for overly permissive files
    if (permissions === '777') {
      result.warnings.push('File/directory has world-writable permissions (777)');
      result.recommendations.push('Consider restricting permissions: chmod 755 (directories) or chmod 644 (files)');
    } else if (permissions === '666') {
      result.warnings.push('File has world-writable permissions (666)');
      result.recommendations.push('Consider restricting permissions: chmod 644');
    }

    // Check for sensitive file patterns
    const sensitivePatterns = [
      { pattern: /\.env$/i, name: 'environment file' },
      { pattern: /\.pem$/i, name: 'certificate/key file' },
      { pattern: /\.key$/i, name: 'key file' },
      { pattern: /id_rsa$/i, name: 'SSH private key' },
      { pattern: /credentials/i, name: 'credentials file' },
      { pattern: /secrets?\.json$/i, name: 'secrets file' },
      { pattern: /password/i, name: 'password file' }
    ];

    for (const { pattern, name } of sensitivePatterns) {
      if (pattern.test(resolvedPath)) {
        result.warnings.push(`Sensitive ${name} detected`);

        // Check if readable by others
        const otherRead = (parseInt(permissions[2]) & 4) !== 0;
        if (otherRead) {
          result.warnings.push(`${name} is readable by others - security risk`);
          result.recommendations.push(`Restrict permissions: chmod 600 ${resolvedPath}`);
        }
        break;
      }
    }

    // Check if in sensitive directories
    const sensitiveDirs = ['/etc', '/root', 'C:\\Windows', 'C:\\System32'];
    for (const dir of sensitiveDirs) {
      if (resolvedPath.toLowerCase().startsWith(dir.toLowerCase())) {
        result.warnings.push(`Path is in sensitive system directory: ${dir}`);
        break;
      }
    }

    // Check for symlinks
    if (stats.isSymbolicLink()) {
      result.warnings.push('Path is a symbolic link - verify target');
    }

    // For directories, check contents
    if (stats.isDirectory()) {
      try {
        const contents = await readdir(resolvedPath);
        result.stats.itemCount = contents.length;

        // Check for sensitive files in directory
        const sensitiveFiles = contents.filter(f =>
          /\.(env|pem|key|crt|p12|pfx)$/i.test(f) ||
          /^(credentials|secrets?|password|config)\.(json|ya?ml)$/i.test(f)
        );

        if (sensitiveFiles.length > 0) {
          result.warnings.push(`Directory contains ${sensitiveFiles.length} potentially sensitive file(s)`);
          result.stats.sensitiveFiles = sensitiveFiles;
        }
      } catch {
        // Cannot read directory contents
      }
    }

    logger.debug('Permission check completed', {
      path: resolvedPath,
      readable: result.readable,
      writable: result.writable,
      warnings: result.warnings.length
    });

  } catch (error) {
    if (error.code === 'ENOENT') {
      result.exists = false;
      logger.debug('Permission check - path does not exist', { path: resolvedPath });
    } else {
      result.warnings.push(`Error accessing path: ${error.message}`);
      logger.error('Permission check failed', { path: resolvedPath, error: error.message });
    }
  }

  return result;
}

// ============================================================================
// Security Report Generation
// ============================================================================

/**
 * @typedef {Object} SecurityReportOptions
 * @property {boolean} [includeDependencies=true] - Include dependency audit
 * @property {string} [packageJsonPath='./package.json'] - Path to package.json
 * @property {string[]} [checkPaths=[]] - Paths to check permissions for
 * @property {boolean} [includeEnvironment=true] - Include environment analysis
 * @property {boolean} [includeConfig=true] - Include configuration analysis
 * @property {string} [outputFormat='json'] - Output format (json, text, html)
 */

/**
 * @typedef {Object} SecurityReport
 * @property {string} timestamp - Report generation timestamp
 * @property {string} version - Report version
 * @property {Object} summary - Executive summary
 * @property {Object} dependencies - Dependency audit results
 * @property {Object[]} permissions - Permission check results
 * @property {Object} environment - Environment security analysis
 * @property {Object} configuration - Configuration security analysis
 * @property {string[]} recommendations - Prioritized recommendations
 * @property {string} riskLevel - Overall risk level (low, medium, high, critical)
 */

/**
 * Generates a comprehensive security report
 * @param {SecurityReportOptions} [options={}] - Report generation options
 * @returns {Promise<SecurityReport>} Complete security report
 */
export async function generateSecurityReport(options = {}) {
  const startTime = Date.now();
  logger.info('Generating security report', { options });

  const {
    includeDependencies = true,
    packageJsonPath = './package.json',
    checkPaths = [],
    includeEnvironment = true,
    includeConfig = true,
    outputFormat = 'json'
  } = options;

  const report = {
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    generatedBy: 'GeminiCLI Security Audit',
    summary: {
      totalIssues: 0,
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
      infoIssues: 0
    },
    dependencies: null,
    permissions: [],
    environment: null,
    configuration: null,
    recommendations: [],
    riskLevel: 'low'
  };

  // Dependency audit
  if (includeDependencies) {
    try {
      report.dependencies = await auditDependencies(packageJsonPath);

      // Add to summary
      if (report.dependencies.summary) {
        report.summary.criticalIssues += report.dependencies.summary.critical || 0;
        report.summary.highIssues += report.dependencies.summary.high || 0;
        report.summary.mediumIssues += report.dependencies.summary.moderate || 0;
        report.summary.lowIssues += report.dependencies.summary.low || 0;
        report.summary.totalIssues += report.dependencies.summary.total || 0;
      }
    } catch (error) {
      logger.error('Dependency audit failed during report generation', { error: error.message });
      report.dependencies = { error: error.message, status: 'failed' };
    }
  }

  // Permission checks
  if (checkPaths.length > 0) {
    for (const pathToCheck of checkPaths) {
      try {
        const permResult = await checkPermissions(pathToCheck);
        report.permissions.push(permResult);

        // Count warnings as issues
        if (permResult.warnings.length > 0) {
          report.summary.mediumIssues += permResult.warnings.length;
          report.summary.totalIssues += permResult.warnings.length;
        }
      } catch (error) {
        report.permissions.push({
          path: pathToCheck,
          error: error.message,
          status: 'failed'
        });
      }
    }
  }

  // Environment analysis
  if (includeEnvironment) {
    report.environment = analyzeEnvironment();

    // Add environment issues
    if (report.environment.issues) {
      for (const issue of report.environment.issues) {
        if (issue.severity === 'critical') report.summary.criticalIssues++;
        else if (issue.severity === 'high') report.summary.highIssues++;
        else if (issue.severity === 'medium') report.summary.mediumIssues++;
        else if (issue.severity === 'low') report.summary.lowIssues++;
        else report.summary.infoIssues++;
        report.summary.totalIssues++;
      }
    }
  }

  // Configuration analysis
  if (includeConfig) {
    report.configuration = await analyzeConfiguration();

    // Add config issues
    if (report.configuration.issues) {
      for (const issue of report.configuration.issues) {
        if (issue.severity === 'critical') report.summary.criticalIssues++;
        else if (issue.severity === 'high') report.summary.highIssues++;
        else if (issue.severity === 'medium') report.summary.mediumIssues++;
        else if (issue.severity === 'low') report.summary.lowIssues++;
        else report.summary.infoIssues++;
        report.summary.totalIssues++;
      }
    }
  }

  // Calculate risk level
  if (report.summary.criticalIssues > 0) {
    report.riskLevel = 'critical';
  } else if (report.summary.highIssues > 0) {
    report.riskLevel = 'high';
  } else if (report.summary.mediumIssues > 0) {
    report.riskLevel = 'medium';
  } else if (report.summary.lowIssues > 0) {
    report.riskLevel = 'low';
  } else {
    report.riskLevel = 'secure';
  }

  // Generate prioritized recommendations
  report.recommendations = generateRecommendations(report);

  // Add timing
  report.generationTime = Date.now() - startTime;

  logger.info('Security report generated', {
    riskLevel: report.riskLevel,
    totalIssues: report.summary.totalIssues,
    generationTime: report.generationTime
  });

  // Format output if needed
  if (outputFormat === 'text') {
    return formatReportAsText(report);
  } else if (outputFormat === 'html') {
    return formatReportAsHtml(report);
  }

  return report;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Analyzes the environment for security issues
 * @returns {Object} Environment analysis results
 */
function analyzeEnvironment() {
  const result = {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    cwd: process.cwd(),
    issues: []
  };

  // Check Node.js version
  const nodeVersion = parseInt(process.version.slice(1).split('.')[0]);
  if (nodeVersion < 18) {
    result.issues.push({
      severity: 'high',
      message: `Node.js version ${process.version} is outdated. Recommended: v18.x or later`,
      recommendation: 'Update Node.js to the latest LTS version'
    });
  }

  // Check for debug mode
  if (process.env.DEBUG || process.env.NODE_DEBUG) {
    result.issues.push({
      severity: 'low',
      message: 'Debug mode is enabled',
      recommendation: 'Disable debug mode in production'
    });
  }

  // Check for development environment in production context
  if (process.env.NODE_ENV === 'development') {
    result.issues.push({
      severity: 'info',
      message: 'Running in development mode',
      recommendation: 'Ensure NODE_ENV is set to production for deployment'
    });
  }

  // Check for sensitive environment variables
  const sensitiveEnvVars = [
    'AWS_SECRET_ACCESS_KEY',
    'AZURE_CLIENT_SECRET',
    'GCP_PRIVATE_KEY',
    'DATABASE_PASSWORD',
    'DB_PASSWORD',
    'SECRET_KEY',
    'PRIVATE_KEY'
  ];

  const exposedSensitive = sensitiveEnvVars.filter(v => process.env[v]);
  if (exposedSensitive.length > 0) {
    result.issues.push({
      severity: 'high',
      message: `Sensitive environment variables detected: ${exposedSensitive.join(', ')}`,
      recommendation: 'Use a secrets manager instead of environment variables'
    });
    result.exposedSecrets = exposedSensitive.length;
  }

  // Check for API keys in environment
  if (process.env.GEMINI_API_KEY) {
    const keyValidation = validateApiKey(process.env.GEMINI_API_KEY, 'gemini');
    if (keyValidation.valid) {
      result.geminiKeyStatus = 'valid';
    } else {
      result.issues.push({
        severity: 'medium',
        message: 'GEMINI_API_KEY format appears invalid',
        recommendation: 'Verify the API key format'
      });
      result.geminiKeyStatus = 'invalid';
    }
  } else {
    result.geminiKeyStatus = 'not_set';
  }

  return result;
}

/**
 * Analyzes configuration for security issues
 * @returns {Promise<Object>} Configuration analysis results
 */
async function analyzeConfiguration() {
  const result = {
    issues: [],
    configFiles: []
  };

  // Check for common config files
  const configFiles = [
    { path: './.env', type: 'environment' },
    { path: './.env.local', type: 'environment' },
    { path: './config.json', type: 'json' },
    { path: './.gemini/config.json', type: 'gemini' },
    { path: './package.json', type: 'package' }
  ];

  for (const { path: configPath, type } of configFiles) {
    try {
      const resolvedPath = resolve(process.cwd(), configPath);
      const stats = await stat(resolvedPath);

      result.configFiles.push({
        path: configPath,
        type,
        exists: true,
        size: stats.size
      });

      // Read and analyze JSON configs
      if (type === 'json' || type === 'gemini' || type === 'package') {
        try {
          const content = await readFile(resolvedPath, 'utf8');
          const config = JSON.parse(content);

          // Check for hardcoded secrets
          const secretPatterns = ['password', 'secret', 'apikey', 'api_key', 'token', 'credential'];
          const hasHardcodedSecrets = findSecretsInObject(config, secretPatterns);

          if (hasHardcodedSecrets.length > 0) {
            result.issues.push({
              severity: 'critical',
              message: `Potential hardcoded secrets in ${configPath}: ${hasHardcodedSecrets.join(', ')}`,
              recommendation: 'Move secrets to environment variables or a secrets manager'
            });
          }
        } catch {
          // JSON parse error - skip
        }
      }
    } catch {
      result.configFiles.push({
        path: configPath,
        type,
        exists: false
      });
    }
  }

  return result;
}

/**
 * Finds potential secrets in an object
 * @param {Object} obj - Object to search
 * @param {string[]} patterns - Patterns to match
 * @param {string} [prefix=''] - Current key prefix
 * @returns {string[]} Found secret keys
 */
function findSecretsInObject(obj, patterns, prefix = '') {
  const found = [];

  if (!obj || typeof obj !== 'object') return found;

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const lowerKey = key.toLowerCase();

    // Check if key matches secret patterns
    const isSecretKey = patterns.some(p => lowerKey.includes(p));

    if (isSecretKey && value && typeof value === 'string' && value.length > 0 && !value.startsWith('$')) {
      found.push(fullKey);
    }

    // Recurse into objects
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      found.push(...findSecretsInObject(value, patterns, fullKey));
    }
  }

  return found;
}

/**
 * Generates prioritized recommendations from report
 * @param {Object} report - Security report
 * @returns {string[]} Prioritized recommendations
 */
function generateRecommendations(report) {
  const recommendations = [];

  // Critical items first
  if (report.summary.criticalIssues > 0) {
    recommendations.push('[CRITICAL] Address all critical security issues immediately');

    if (report.dependencies?.summary?.critical > 0) {
      recommendations.push('[CRITICAL] Run "npm audit fix --force" to fix critical dependency vulnerabilities');
    }

    if (report.configuration?.issues?.some(i => i.severity === 'critical')) {
      recommendations.push('[CRITICAL] Remove hardcoded secrets from configuration files');
    }
  }

  // High priority items
  if (report.summary.highIssues > 0) {
    recommendations.push('[HIGH] Address high severity issues within 24-48 hours');

    if (report.dependencies?.summary?.high > 0) {
      recommendations.push('[HIGH] Run "npm audit fix" to fix high severity dependency vulnerabilities');
    }

    if (report.environment?.issues?.some(i => i.severity === 'high')) {
      recommendations.push('[HIGH] Review and secure environment configuration');
    }
  }

  // Medium priority items
  if (report.summary.mediumIssues > 0) {
    recommendations.push('[MEDIUM] Plan to address medium severity issues in the next sprint');

    if (report.permissions?.some(p => p.warnings?.length > 0)) {
      recommendations.push('[MEDIUM] Review and tighten file permissions');
    }
  }

  // General recommendations
  recommendations.push(
    '[RECOMMENDED] Implement automated security scanning in CI/CD pipeline',
    '[RECOMMENDED] Regularly update dependencies with "npm update"',
    '[RECOMMENDED] Use a secrets manager for sensitive configuration',
    '[RECOMMENDED] Enable audit logging for all security-relevant operations'
  );

  return recommendations;
}

/**
 * Formats report as plain text
 * @param {Object} report - Security report
 * @returns {string} Text-formatted report
 */
function formatReportAsText(report) {
  const lines = [];

  lines.push('='.repeat(60));
  lines.push('SECURITY AUDIT REPORT');
  lines.push('='.repeat(60));
  lines.push(`Generated: ${report.timestamp}`);
  lines.push(`Risk Level: ${report.riskLevel.toUpperCase()}`);
  lines.push('');

  lines.push('SUMMARY');
  lines.push('-'.repeat(40));
  lines.push(`Total Issues: ${report.summary.totalIssues}`);
  lines.push(`  Critical: ${report.summary.criticalIssues}`);
  lines.push(`  High: ${report.summary.highIssues}`);
  lines.push(`  Medium: ${report.summary.mediumIssues}`);
  lines.push(`  Low: ${report.summary.lowIssues}`);
  lines.push(`  Info: ${report.summary.infoIssues}`);
  lines.push('');

  if (report.dependencies) {
    lines.push('DEPENDENCY AUDIT');
    lines.push('-'.repeat(40));
    lines.push(`Status: ${report.dependencies.status || 'unknown'}`);
    lines.push(`Vulnerabilities: ${report.dependencies.summary?.total || 0}`);
    lines.push('');
  }

  lines.push('RECOMMENDATIONS');
  lines.push('-'.repeat(40));
  for (const rec of report.recommendations) {
    lines.push(`* ${rec}`);
  }

  lines.push('');
  lines.push('='.repeat(60));
  lines.push(`Report generated in ${report.generationTime}ms`);

  return lines.join('\n');
}

/**
 * Formats report as HTML
 * @param {Object} report - Security report
 * @returns {string} HTML-formatted report
 */
function formatReportAsHtml(report) {
  const riskColors = {
    secure: '#28a745',
    low: '#17a2b8',
    medium: '#ffc107',
    high: '#fd7e14',
    critical: '#dc3545'
  };

  return `<!DOCTYPE html>
<html>
<head>
  <title>Security Audit Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    .risk-badge { padding: 5px 10px; border-radius: 5px; color: white; }
    .summary { display: flex; gap: 20px; margin: 20px 0; }
    .summary-item { padding: 10px; border-radius: 5px; background: #f5f5f5; }
    .recommendation { padding: 10px; margin: 5px 0; background: #e9ecef; border-left: 4px solid #007bff; }
    .critical { border-left-color: #dc3545; }
    .high { border-left-color: #fd7e14; }
    .medium { border-left-color: #ffc107; }
  </style>
</head>
<body>
  <h1>Security Audit Report</h1>
  <p>Generated: ${report.timestamp}</p>
  <p>Risk Level: <span class="risk-badge" style="background:${riskColors[report.riskLevel]}">${report.riskLevel.toUpperCase()}</span></p>

  <h2>Summary</h2>
  <div class="summary">
    <div class="summary-item"><strong>${report.summary.criticalIssues}</strong><br>Critical</div>
    <div class="summary-item"><strong>${report.summary.highIssues}</strong><br>High</div>
    <div class="summary-item"><strong>${report.summary.mediumIssues}</strong><br>Medium</div>
    <div class="summary-item"><strong>${report.summary.lowIssues}</strong><br>Low</div>
  </div>

  <h2>Recommendations</h2>
  ${report.recommendations.map(rec => {
    const priority = rec.includes('[CRITICAL]') ? 'critical' :
                     rec.includes('[HIGH]') ? 'high' :
                     rec.includes('[MEDIUM]') ? 'medium' : '';
    return `<div class="recommendation ${priority}">${rec}</div>`;
  }).join('\n')}

  <footer><small>Report generated in ${report.generationTime}ms</small></footer>
</body>
</html>`;
}

// ============================================================================
// Exports
// ============================================================================

export default {
  // Main functions
  auditDependencies,
  sanitizeInput,
  validateApiKey,
  checkPermissions,
  generateSecurityReport,

  // Attack patterns
  XSS_PATTERNS,
  SQL_INJECTION_PATTERNS,
  COMMAND_INJECTION_PATTERNS,
  PATH_TRAVERSAL_PATTERNS,

  // API key patterns
  API_KEY_PATTERNS
};
