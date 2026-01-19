/**
 * HYDRA Security Audit Module
 * Agent: Geralt (Security)
 *
 * Provides security auditing functions for:
 * - Dependency vulnerability scanning
 * - Input sanitization (XSS, injection)
 * - API key validation
 * - File permission checks
 * - Security report generation
 */

import { createLogger } from './logger.js';
import { readFile, stat, access, constants } from 'fs/promises';
import { resolve } from 'path';
import { createHash } from 'crypto';

const logger = createLogger('security-audit');

// Known vulnerable package patterns (simplified for demo - in production use npm audit)
const KNOWN_VULNERABILITIES = {
  'lodash': { versions: ['<4.17.21'], severity: 'high', cve: 'CVE-2021-23337' },
  'axios': { versions: ['<0.21.1'], severity: 'high', cve: 'CVE-2021-3749' },
  'minimist': { versions: ['<1.2.6'], severity: 'critical', cve: 'CVE-2021-44906' },
  'node-fetch': { versions: ['<2.6.7'], severity: 'high', cve: 'CVE-2022-0235' },
  'glob-parent': { versions: ['<5.1.2'], severity: 'high', cve: 'CVE-2020-28469' },
  'trim-newlines': { versions: ['<3.0.1'], severity: 'high', cve: 'CVE-2021-33623' },
  'tar': { versions: ['<6.1.11'], severity: 'high', cve: 'CVE-2021-37701' },
  'path-parse': { versions: ['<1.0.7'], severity: 'medium', cve: 'CVE-2021-23343' }
};

// API key format patterns for validation
const API_KEY_PATTERNS = {
  openai: /^sk-[a-zA-Z0-9]{32,}$/,
  anthropic: /^sk-ant-[a-zA-Z0-9-_]{32,}$/,
  google: /^AIza[a-zA-Z0-9_-]{35}$/,
  gemini: /^[a-zA-Z0-9_-]{39}$/,
  deepseek: /^sk-[a-zA-Z0-9]{32,}$/,
  xai: /^xai-[a-zA-Z0-9]{32,}$/,
  huggingface: /^hf_[a-zA-Z0-9]{34}$/,
  cohere: /^[a-zA-Z0-9]{40}$/,
  ollama: /^ollama_[a-zA-Z0-9]{16,}$|^[a-zA-Z0-9-_]{8,}$/ // Ollama can be local without key
};

// XSS attack patterns
const XSS_PATTERNS = [
  /<script\b[^>]*>[\s\S]*?<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /<iframe\b[^>]*>/gi,
  /<object\b[^>]*>/gi,
  /<embed\b[^>]*>/gi,
  /<link\b[^>]*>/gi,
  /data:\s*text\/html/gi,
  /vbscript:/gi,
  /expression\s*\(/gi
];

// SQL injection patterns
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|TRUNCATE)\b.*\b(FROM|INTO|WHERE|TABLE|DATABASE)\b)/gi,
  /(['"])\s*OR\s+(['"]?\d+['"]?\s*=\s*['"]?\d+['"]?|1\s*=\s*1|'a'\s*=\s*'a')/gi,
  /;\s*(DROP|DELETE|TRUNCATE|ALTER)\s+/gi,
  /--\s*$/gm,
  /\/\*[\s\S]*?\*\//g,
  /\bEXEC\s*\(/gi,
  /\bXP_\w+/gi
];

// Command injection patterns
const COMMAND_INJECTION_PATTERNS = [
  /[;&|`$(){}[\]<>]/g,
  /\$\([^)]+\)/g,
  /`[^`]+`/g,
  /\|\|/g,
  /&&/g,
  />\s*\/dev\/null/gi,
  /\bnc\s+-/gi,
  /\bcurl\s+.*\|/gi,
  /\bwget\s+.*\|/gi
];

// Path traversal patterns
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\//g,
  /\.\.\\+/g,
  /%2e%2e%2f/gi,
  /%2e%2e\//gi,
  /\.\.%2f/gi,
  /%2e%2e%5c/gi,
  /\.\.\\/g
];

/**
 * Audit dependencies in package.json for known vulnerabilities
 * @param {string} packageJsonPath - Path to package.json (defaults to current directory)
 * @returns {Promise<Object>} Audit results with vulnerabilities found
 */
export async function auditDependencies(packageJsonPath = './package.json') {
  logger.info('Starting dependency audit', { path: packageJsonPath });

  const results = {
    timestamp: new Date().toISOString(),
    path: packageJsonPath,
    vulnerabilities: [],
    summary: {
      total: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    },
    dependencies: {
      production: 0,
      development: 0
    }
  };

  try {
    const resolvedPath = resolve(packageJsonPath);
    const content = await readFile(resolvedPath, 'utf-8');
    const packageJson = JSON.parse(content);

    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    };

    results.dependencies.production = Object.keys(packageJson.dependencies || {}).length;
    results.dependencies.development = Object.keys(packageJson.devDependencies || {}).length;

    for (const [name, version] of Object.entries(allDeps)) {
      const vuln = KNOWN_VULNERABILITIES[name];
      if (vuln) {
        // Simplified version check - in production use semver
        const vulnerability = {
          package: name,
          installedVersion: version,
          vulnerability: vuln.cve,
          severity: vuln.severity,
          fixedIn: `>=${vuln.versions[0].replace('<', '')}`,
          recommendation: `Update ${name} to latest version`
        };

        results.vulnerabilities.push(vulnerability);
        results.summary.total++;
        results.summary[vuln.severity]++;
      }
    }

    // Check for potentially dangerous packages
    const dangerousPatterns = ['eval', 'exec', 'shell', 'spawn'];
    for (const [name] of Object.entries(allDeps)) {
      if (dangerousPatterns.some(p => name.toLowerCase().includes(p))) {
        results.vulnerabilities.push({
          package: name,
          severity: 'warning',
          message: 'Package name suggests potential dangerous operations',
          recommendation: 'Review package functionality and necessity'
        });
      }
    }

    logger.info('Dependency audit complete', {
      total: results.summary.total,
      critical: results.summary.critical
    });

  } catch (error) {
    logger.error('Dependency audit failed', { error: error.message });
    results.error = error.message;
  }

  return results;
}

/**
 * Sanitize input data against XSS, SQL injection, command injection, and path traversal
 * @param {string} input - Raw input string to sanitize
 * @param {Object} options - Sanitization options
 * @returns {Object} Sanitized result with threat analysis
 */
export function sanitizeInput(input, options = {}) {
  const {
    allowHtml = false,
    allowSpecialChars = false,
    maxLength = 10000,
    trimWhitespace = true,
    logThreats = true
  } = options;

  if (typeof input !== 'string') {
    return {
      original: input,
      sanitized: String(input),
      threats: [],
      safe: true
    };
  }

  const result = {
    original: input,
    sanitized: input,
    threats: [],
    safe: true,
    modifications: []
  };

  // Length check
  if (input.length > maxLength) {
    result.sanitized = input.slice(0, maxLength);
    result.modifications.push(`Truncated from ${input.length} to ${maxLength} characters`);
    result.threats.push({
      type: 'length_exceeded',
      severity: 'low',
      description: `Input exceeded maximum length of ${maxLength}`
    });
  }

  // Trim whitespace
  if (trimWhitespace) {
    const trimmed = result.sanitized.trim();
    if (trimmed !== result.sanitized) {
      result.sanitized = trimmed;
      result.modifications.push('Trimmed whitespace');
    }
  }

  // XSS detection and sanitization
  for (const pattern of XSS_PATTERNS) {
    if (pattern.test(result.sanitized)) {
      result.threats.push({
        type: 'xss',
        severity: 'high',
        pattern: pattern.source,
        description: 'Potential XSS attack detected'
      });
      result.safe = false;

      if (!allowHtml) {
        result.sanitized = result.sanitized.replace(pattern, '[REMOVED]');
        result.modifications.push(`Removed XSS pattern: ${pattern.source}`);
      }
    }
  }

  // SQL injection detection
  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(result.sanitized)) {
      result.threats.push({
        type: 'sql_injection',
        severity: 'critical',
        pattern: pattern.source,
        description: 'Potential SQL injection detected'
      });
      result.safe = false;

      if (!allowSpecialChars) {
        result.sanitized = result.sanitized.replace(pattern, '[REMOVED]');
        result.modifications.push(`Removed SQL injection pattern: ${pattern.source}`);
      }
    }
  }

  // Command injection detection
  for (const pattern of COMMAND_INJECTION_PATTERNS) {
    const matches = result.sanitized.match(pattern);
    if (matches && matches.length > 2) { // Allow some special chars, flag excessive
      result.threats.push({
        type: 'command_injection',
        severity: 'critical',
        pattern: pattern.source,
        description: 'Potential command injection detected'
      });
      result.safe = false;
    }
  }

  // Path traversal detection
  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    if (pattern.test(result.sanitized)) {
      result.threats.push({
        type: 'path_traversal',
        severity: 'high',
        pattern: pattern.source,
        description: 'Potential path traversal attack detected'
      });
      result.safe = false;

      result.sanitized = result.sanitized.replace(pattern, '');
      result.modifications.push(`Removed path traversal pattern: ${pattern.source}`);
    }
  }

  // HTML entity encoding for non-HTML contexts
  if (!allowHtml) {
    const htmlChars = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;'
    };

    const originalSanitized = result.sanitized;
    result.sanitized = result.sanitized.replace(/[&<>"']/g, char => htmlChars[char]);

    if (originalSanitized !== result.sanitized) {
      result.modifications.push('Encoded HTML entities');
    }
  }

  // Log threats if enabled
  if (logThreats && result.threats.length > 0) {
    logger.warn('Security threats detected in input', {
      threatCount: result.threats.length,
      types: [...new Set(result.threats.map(t => t.type))],
      inputHash: createHash('sha256').update(input).digest('hex').slice(0, 16)
    });
  }

  return result;
}

/**
 * Validate API key format for various providers
 * @param {string} key - API key to validate
 * @param {string} provider - Provider name (openai, anthropic, google, etc.)
 * @returns {Object} Validation result
 */
export function validateApiKey(key, provider) {
  const result = {
    valid: false,
    provider,
    format: null,
    warnings: [],
    recommendations: []
  };

  if (!key || typeof key !== 'string') {
    result.warnings.push('API key is empty or not a string');
    return result;
  }

  // Check for common mistakes
  if (key.includes(' ')) {
    result.warnings.push('API key contains spaces - likely copy/paste error');
  }

  if (key.startsWith('"') || key.startsWith("'")) {
    result.warnings.push('API key contains quote characters - remove them');
  }

  if (key.includes('\n') || key.includes('\r')) {
    result.warnings.push('API key contains newline characters');
  }

  // Trim for validation
  const trimmedKey = key.trim().replace(/^["']|["']$/g, '');

  // Check minimum length
  if (trimmedKey.length < 20) {
    result.warnings.push('API key seems too short');
    return result;
  }

  // Check maximum length
  if (trimmedKey.length > 200) {
    result.warnings.push('API key seems unusually long');
  }

  // Validate against provider pattern
  const normalizedProvider = provider.toLowerCase();
  const pattern = API_KEY_PATTERNS[normalizedProvider];

  if (!pattern) {
    result.warnings.push(`Unknown provider: ${provider}`);
    result.recommendations.push('Supported providers: ' + Object.keys(API_KEY_PATTERNS).join(', '));

    // Generic validation for unknown providers
    if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmedKey)) {
      result.valid = true;
      result.format = 'generic';
    }
    return result;
  }

  result.valid = pattern.test(trimmedKey);
  result.format = normalizedProvider;

  if (!result.valid) {
    result.warnings.push(`Key does not match expected ${provider} format`);

    // Provide specific guidance based on provider
    switch (normalizedProvider) {
      case 'openai':
        result.recommendations.push('OpenAI keys should start with "sk-" followed by alphanumeric characters');
        break;
      case 'anthropic':
        result.recommendations.push('Anthropic keys should start with "sk-ant-"');
        break;
      case 'google':
      case 'gemini':
        result.recommendations.push('Google/Gemini keys should start with "AIza"');
        break;
      case 'huggingface':
        result.recommendations.push('HuggingFace keys should start with "hf_"');
        break;
    }
  }

  // Security recommendations
  result.recommendations.push('Never commit API keys to version control');
  result.recommendations.push('Use environment variables for API key storage');
  result.recommendations.push('Rotate keys periodically');

  logger.debug('API key validation', {
    provider,
    valid: result.valid,
    keyPrefix: trimmedKey.slice(0, 8) + '...'
  });

  return result;
}

/**
 * Check file/directory permissions for security issues
 * @param {string} targetPath - Path to check
 * @returns {Promise<Object>} Permission check results
 */
export async function checkPermissions(targetPath) {
  const result = {
    path: targetPath,
    exists: false,
    readable: false,
    writable: false,
    executable: false,
    isDirectory: false,
    isFile: false,
    permissions: null,
    owner: null,
    warnings: [],
    recommendations: []
  };

  try {
    const resolvedPath = resolve(targetPath);
    result.path = resolvedPath;

    // Check if path exists and get stats
    const stats = await stat(resolvedPath);
    result.exists = true;
    result.isDirectory = stats.isDirectory();
    result.isFile = stats.isFile();
    result.size = stats.size;
    result.modified = stats.mtime.toISOString();

    // Parse permission mode
    const mode = stats.mode;
    result.permissions = {
      octal: '0' + (mode & 0o777).toString(8),
      owner: {
        read: !!(mode & 0o400),
        write: !!(mode & 0o200),
        execute: !!(mode & 0o100)
      },
      group: {
        read: !!(mode & 0o040),
        write: !!(mode & 0o020),
        execute: !!(mode & 0o010)
      },
      others: {
        read: !!(mode & 0o004),
        write: !!(mode & 0o002),
        execute: !!(mode & 0o001)
      }
    };

    // Check actual access
    try {
      await access(resolvedPath, constants.R_OK);
      result.readable = true;
    } catch { /* Not readable */ }

    try {
      await access(resolvedPath, constants.W_OK);
      result.writable = true;
    } catch { /* Not writable */ }

    try {
      await access(resolvedPath, constants.X_OK);
      result.executable = true;
    } catch { /* Not executable */ }

    // Security warnings
    if (result.permissions.others.write) {
      result.warnings.push('World-writable file/directory - potential security risk');
      result.recommendations.push(`Run: chmod o-w "${resolvedPath}"`);
    }

    if (result.permissions.others.execute && result.isFile) {
      result.warnings.push('World-executable file - verify this is intentional');
    }

    if (result.isFile && result.permissions.octal === '0777') {
      result.warnings.push('File has full permissions (777) - highly insecure');
      result.recommendations.push('Consider restricting to 644 or 600 for sensitive files');
    }

    // Check for sensitive file patterns
    const sensitivePatterns = [
      /\.env$/i,
      /\.key$/i,
      /\.pem$/i,
      /\.crt$/i,
      /credentials/i,
      /secret/i,
      /password/i,
      /\.ssh/i
    ];

    const fileName = resolvedPath.split(/[/\\]/).pop();
    for (const pattern of sensitivePatterns) {
      if (pattern.test(fileName) || pattern.test(resolvedPath)) {
        if (result.permissions.others.read) {
          result.warnings.push(`Sensitive file "${fileName}" is world-readable`);
          result.recommendations.push('Restrict permissions to 600 (owner read/write only)');
        }
        break;
      }
    }

    logger.debug('Permission check complete', {
      path: resolvedPath,
      permissions: result.permissions.octal
    });

  } catch (error) {
    if (error.code === 'ENOENT') {
      result.warnings.push('Path does not exist');
    } else if (error.code === 'EACCES') {
      result.warnings.push('Access denied - insufficient permissions to check');
    } else {
      result.warnings.push(`Error checking permissions: ${error.message}`);
    }
    logger.error('Permission check failed', { path: targetPath, error: error.message });
  }

  return result;
}

/**
 * Generate comprehensive security report
 * @param {Object} options - Report options
 * @returns {Promise<Object>} Complete security report
 */
export async function generateSecurityReport(options = {}) {
  const {
    packageJsonPath = './package.json',
    checkPaths = ['./', '.env', '.env.local', 'config/', 'secrets/'],
    testInputs = [
      '<script>alert("xss")</script>',
      "'; DROP TABLE users; --",
      '../../etc/passwd',
      'normal safe input'
    ],
    apiKeys = {}
  } = options;

  logger.info('Generating security report');

  const report = {
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    generator: 'HYDRA Security Audit',
    agent: 'Geralt',
    sections: {},
    summary: {
      overallRisk: 'unknown',
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
      warnings: 0
    },
    recommendations: []
  };

  // 1. Dependency Audit
  report.sections.dependencies = await auditDependencies(packageJsonPath);

  if (report.sections.dependencies.vulnerabilities) {
    for (const vuln of report.sections.dependencies.vulnerabilities) {
      switch (vuln.severity) {
        case 'critical': report.summary.criticalIssues++; break;
        case 'high': report.summary.highIssues++; break;
        case 'medium': report.summary.mediumIssues++; break;
        case 'low': report.summary.lowIssues++; break;
        case 'warning': report.summary.warnings++; break;
      }
    }
  }

  // 2. Input Sanitization Tests
  report.sections.inputSanitization = {
    tested: testInputs.length,
    results: testInputs.map(input => {
      const result = sanitizeInput(input, { logThreats: false });
      return {
        input: input.slice(0, 50) + (input.length > 50 ? '...' : ''),
        safe: result.safe,
        threatCount: result.threats.length,
        threats: result.threats.map(t => t.type)
      };
    })
  };

  // 3. API Key Validation
  report.sections.apiKeys = {
    checked: Object.keys(apiKeys).length,
    results: {}
  };

  for (const [provider, key] of Object.entries(apiKeys)) {
    const validation = validateApiKey(key, provider);
    report.sections.apiKeys.results[provider] = {
      valid: validation.valid,
      warnings: validation.warnings
    };
    if (!validation.valid) {
      report.summary.warnings++;
    }
  }

  // 4. File Permission Checks
  report.sections.permissions = {
    checked: checkPaths.length,
    results: []
  };

  for (const path of checkPaths) {
    const permResult = await checkPermissions(path);
    report.sections.permissions.results.push({
      path: permResult.path,
      exists: permResult.exists,
      permissions: permResult.permissions?.octal || 'N/A',
      warnings: permResult.warnings,
      recommendations: permResult.recommendations
    });

    report.summary.warnings += permResult.warnings.length;
    report.recommendations.push(...permResult.recommendations);
  }

  // 5. Calculate overall risk
  if (report.summary.criticalIssues > 0) {
    report.summary.overallRisk = 'critical';
  } else if (report.summary.highIssues > 0) {
    report.summary.overallRisk = 'high';
  } else if (report.summary.mediumIssues > 0) {
    report.summary.overallRisk = 'medium';
  } else if (report.summary.lowIssues > 0 || report.summary.warnings > 0) {
    report.summary.overallRisk = 'low';
  } else {
    report.summary.overallRisk = 'minimal';
  }

  // 6. Generate top recommendations
  const priorityRecommendations = [
    'Run `npm audit fix` to patch known vulnerabilities',
    'Enable strict Content-Security-Policy headers',
    'Implement rate limiting on all API endpoints',
    'Use parameterized queries for all database operations',
    'Store secrets in environment variables, never in code',
    'Implement input validation on all user inputs',
    'Enable HTTPS and HSTS in production',
    'Set up automated security scanning in CI/CD'
  ];

  report.recommendations = [
    ...new Set([...report.recommendations, ...priorityRecommendations])
  ].slice(0, 10);

  // 7. ASCII Report Summary
  report.asciiSummary = generateAsciiReport(report);

  logger.info('Security report generated', {
    overallRisk: report.summary.overallRisk,
    criticalIssues: report.summary.criticalIssues
  });

  return report;
}

/**
 * Generate ASCII art summary for the report
 * @param {Object} report - Security report object
 * @returns {string} ASCII formatted summary
 */
function generateAsciiReport(report) {
  const riskColors = {
    critical: '!!!',
    high: '!! ',
    medium: '!  ',
    low: '.  ',
    minimal: '   '
  };

  return `
+==============================================================================+
|                     HYDRA SECURITY AUDIT REPORT                              |
|                         Agent: Geralt                                        |
+==============================================================================+
| Generated: ${report.timestamp}
+------------------------------------------------------------------------------+
|                            RISK SUMMARY                                      |
+------------------------------------------------------------------------------+
| Overall Risk Level: ${report.summary.overallRisk.toUpperCase().padEnd(12)} ${riskColors[report.summary.overallRisk] || '???'}
|                                                                              |
| Critical Issues: ${String(report.summary.criticalIssues).padStart(3)}    High Issues: ${String(report.summary.highIssues).padStart(3)}
| Medium Issues:   ${String(report.summary.mediumIssues).padStart(3)}    Low Issues:  ${String(report.summary.lowIssues).padStart(3)}
| Warnings:        ${String(report.summary.warnings).padStart(3)}
+------------------------------------------------------------------------------+
|                          SECTIONS CHECKED                                    |
+------------------------------------------------------------------------------+
| [${report.sections.dependencies?.error ? 'X' : 'V'}] Dependencies: ${report.sections.dependencies?.dependencies?.production || 0} prod, ${report.sections.dependencies?.dependencies?.development || 0} dev
| [V] Input Sanitization: ${report.sections.inputSanitization?.tested || 0} patterns tested
| [V] API Keys: ${report.sections.apiKeys?.checked || 0} providers validated
| [V] Permissions: ${report.sections.permissions?.checked || 0} paths checked
+------------------------------------------------------------------------------+
|                       TOP RECOMMENDATIONS                                    |
+------------------------------------------------------------------------------+
${report.recommendations.slice(0, 5).map((r, i) => `| ${i + 1}. ${r.slice(0, 70)}`).join('\n')}
+==============================================================================+
`;
}

// Export all functions
export default {
  auditDependencies,
  sanitizeInput,
  validateApiKey,
  checkPermissions,
  generateSecurityReport
};
