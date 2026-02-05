/**
 * @fileoverview Security patterns for command and path validation
 * Contains dangerous patterns, blocked commands, and sensitive file patterns.
 * @module security/patterns
 */

// ============================================================================
// Dangerous Shell Patterns
// ============================================================================

/**
 * Patterns that indicate potentially dangerous shell commands.
 * These patterns match commands that could cause system damage or security issues.
 * @type {ReadonlyArray<RegExp>}
 */
export const DANGEROUS_PATTERNS = Object.freeze([
  // Recursive deletion patterns
  /rm\s+-rf?\s+[\/~]/i,
  /rm\s+-rf?\s+\.\./i,
  /rmdir\s+\/s\s+\/q/i, // Windows recursive delete

  // Fork bomb pattern
  /:\s*\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/,

  // Direct device access
  />\s*\/dev\/sd[a-z]/i,
  /dd\s+of=\/dev\//i,

  // Filesystem destruction
  /mkfs/i,
  /dd\s+if=/i,

  // Dangerous permission changes
  /chmod\s+777/i,
  /chmod\s+-R\s+777/i,
  /chmod\s+666/i,

  // Piped execution from internet
  /curl.*\|\s*(?:ba)?sh/i,
  /wget.*\|\s*(?:ba)?sh/i,
  /curl.*\|\s*python/i,
  /wget.*\|\s*python/i,

  // History manipulation
  /history\s*-c/i,
  /history\s*-w/i,

  // System file overwrites
  />\s*\/etc\/passwd/i,
  />\s*\/etc\/shadow/i,
  />\s*\/etc\/sudoers/i,

  // Boot sector manipulation
  /dd.*bs=512.*count=1/i,

  // Environment manipulation for code injection
  /export\s+LD_PRELOAD/i,
  /export\s+PATH=.*:/i,

  // Kernel module manipulation
  /insmod/i,
  /rmmod/i,
  /modprobe/i,

  // Process manipulation
  /kill\s+-9\s+-1/i, // Kill all processes
  /killall\s+-9/i,

  // Disk operations
  /fdisk/i,
  /parted/i,

  // Windows-specific dangerous commands
  /format\s+[a-z]:/i,
  /del\s+\/s\s+\/q\s+[a-z]:\\/i,
  /rd\s+\/s\s+\/q\s+[a-z]:\\/i
]);

// ============================================================================
// Blocked Commands
// ============================================================================

/**
 * Commands that should be completely blocked from execution.
 * @type {ReadonlyArray<string>}
 */
export const BLOCKED_COMMANDS = Object.freeze([
  // System destruction
  'rm -rf /',
  'rm -rf /*',
  'rm -rf ~',
  'rm -rf ~/*',
  'rm -rf .',
  'rm -rf ..',

  // Windows equivalents
  'format c:',
  'del /s /q c:\\',
  'rd /s /q c:\\',

  // Dangerous utilities
  ':(){:|:&};:', // Fork bomb
  ':(){ :|:& };:',

  // History clearing (security evasion)
  'history -c',
  'history -w /dev/null',

  // Credential theft attempts
  'cat /etc/shadow',
  'cat /etc/passwd',

  // Network reconnaissance
  'nc -l',
  'netcat -l',

  // Reverse shells
  'bash -i >& /dev/tcp/',
  '/bin/bash -i >& /dev/tcp/',

  // Privilege escalation attempts
  'sudo su -',
  'sudo bash',
  'su root'
]);

// ============================================================================
// Sensitive File Patterns
// ============================================================================

/**
 * Patterns that match sensitive files that should be handled with care.
 * @type {ReadonlyArray<RegExp>}
 */
export const SENSITIVE_PATTERNS = Object.freeze([
  // Environment and config files
  /\.env$/i,
  /\.env\.[a-z]+$/i,
  /\.env\.local$/i,
  /\.env\.production$/i,
  /\.env\.development$/i,

  // Credential files
  /credentials\.json$/i,
  /secrets\.json$/i,
  /secrets\.ya?ml$/i,
  /\.credentials$/i,

  // SSH keys
  /id_rsa$/i,
  /id_ed25519$/i,
  /id_ecdsa$/i,
  /id_dsa$/i,
  /\.pem$/i,
  /\.key$/i,

  // API keys and tokens
  /api[_-]?key/i,
  /token\.json$/i,
  /auth\.json$/i,

  // Certificate files
  /\.crt$/i,
  /\.cer$/i,
  /\.p12$/i,
  /\.pfx$/i,

  // Password files
  /password/i,
  /passwd$/i,
  /shadow$/i,

  // Database files
  /\.db$/i,
  /\.sqlite$/i,
  /\.sqlite3$/i,

  // Configuration with potential secrets
  /config\.json$/i,
  /config\.ya?ml$/i,
  /settings\.json$/i,

  // AWS credentials
  /\.aws\/credentials$/i,
  /aws_credentials/i,

  // GCP credentials
  /gcp[_-]?credentials/i,
  /service[_-]?account\.json$/i,

  // Azure credentials
  /azure[_-]?credentials/i,

  // Kubernetes secrets
  /kubeconfig$/i,
  /\.kube\/config$/i,

  // Docker secrets
  /docker[_-]?config\.json$/i,

  // Git credentials
  /\.git-credentials$/i,
  /\.gitconfig$/i,

  // NPM tokens
  /\.npmrc$/i,

  // Shell history (may contain sensitive data)
  /\.bash_history$/i,
  /\.zsh_history$/i,
  /\.history$/i
]);

// ============================================================================
// Path Patterns
// ============================================================================

/**
 * Patterns for dangerous path operations
 * @type {ReadonlyArray<RegExp>}
 */
export const DANGEROUS_PATH_PATTERNS = Object.freeze([
  // Path traversal attempts
  /\.\.\//,
  /\.\.\\/,
  /%2e%2e/i, // URL encoded
  /%252e%252e/i, // Double URL encoded

  // Null byte injection
  /%00/,
  /\x00/,

  // System directories (Unix)
  /^\/etc\//,
  /^\/root\//,
  /^\/boot\//,
  /^\/sys\//,
  /^\/proc\//,
  /^\/dev\//,

  // System directories (Windows)
  /^[a-z]:\\windows\\/i,
  /^[a-z]:\\system32\\/i,
  /^[a-z]:\\program files\\/i,

  // Home directory sensitive locations
  /\.ssh\//i,
  /\.gnupg\//i,
  /\.aws\//i,
  /\.kube\//i
]);

// ============================================================================
// Network Patterns
// ============================================================================

/**
 * Patterns for suspicious network activity
 * @type {ReadonlyArray<RegExp>}
 */
export const SUSPICIOUS_NETWORK_PATTERNS = Object.freeze([
  // Common malicious domains/IPs
  /pastebin\.com/i,
  /hastebin\.com/i,

  // Raw execution endpoints
  /raw\.githubusercontent\.com/i,
  /gist\.githubusercontent\.com/i,

  // Local network scanning
  /192\.168\.\d+\.\d+/,
  /10\.\d+\.\d+\.\d+/,
  /172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+/,

  // Localhost variations
  /127\.0\.0\.1/,
  /0\.0\.0\.0/,
  /localhost/i,

  // Reverse shell ports
  /:4444\b/,
  /:1337\b/,
  /:31337\b/
]);

// ============================================================================
// Input Sanitization Patterns
// ============================================================================

/**
 * Characters that should be escaped in shell commands
 * @type {ReadonlyArray<string>}
 */
export const SHELL_ESCAPE_CHARS = Object.freeze([
  '`', // Command substitution
  '$', // Variable expansion
  '!', // History expansion
  '\\', // Escape character
  '"', // Double quote
  "'", // Single quote
  ';', // Command separator
  '|', // Pipe
  '&', // Background/AND
  '>', // Redirect output
  '<', // Redirect input
  '(', // Subshell start
  ')', // Subshell end
  '{', // Brace expansion start
  '}', // Brace expansion end
  '[', // Glob bracket start
  ']', // Glob bracket end
  '*', // Glob wildcard
  '?', // Glob single char
  '#', // Comment
  '~', // Home directory
  '\n', // Newline
  '\r' // Carriage return
]);

// ============================================================================
// Risk Level Definitions
// ============================================================================

/**
 * Risk level enumeration
 * @readonly
 * @enum {string}
 */
export const RiskLevel = Object.freeze({
  NONE: 'none',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
});

/**
 * Maps pattern categories to risk levels
 * @type {Readonly<Record<string, string>>}
 */
export const PATTERN_RISK_LEVELS = Object.freeze({
  DANGEROUS_PATTERNS: RiskLevel.CRITICAL,
  BLOCKED_COMMANDS: RiskLevel.CRITICAL,
  SENSITIVE_PATTERNS: RiskLevel.HIGH,
  DANGEROUS_PATH_PATTERNS: RiskLevel.HIGH,
  SUSPICIOUS_NETWORK_PATTERNS: RiskLevel.MEDIUM
});

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Tests if a string matches any pattern in an array
 * @param {string} input - String to test
 * @param {ReadonlyArray<RegExp>} patterns - Patterns to match against
 * @returns {boolean} True if any pattern matches
 */
export function matchesAnyPattern(input, patterns) {
  if (!input || typeof input !== 'string') return false;
  return patterns.some(pattern => pattern.test(input));
}

/**
 * Gets all matching patterns for an input
 * @param {string} input - String to test
 * @param {ReadonlyArray<RegExp>} patterns - Patterns to match against
 * @returns {RegExp[]} Array of matching patterns
 */
export function getMatchingPatterns(input, patterns) {
  if (!input || typeof input !== 'string') return [];
  return patterns.filter(pattern => pattern.test(input));
}

/**
 * Checks if a command is in the blocked list
 * @param {string} command - Command to check
 * @returns {boolean} True if blocked
 */
export function isBlockedCommand(command) {
  if (!command || typeof command !== 'string') return false;
  const normalized = command.toLowerCase().trim();
  return BLOCKED_COMMANDS.some(blocked =>
    normalized === blocked.toLowerCase() ||
    normalized.startsWith(blocked.toLowerCase() + ' ')
  );
}

/**
 * Checks if a path matches sensitive patterns
 * @param {string} filePath - Path to check
 * @returns {boolean} True if sensitive
 */
export function isSensitivePath(filePath) {
  return matchesAnyPattern(filePath, SENSITIVE_PATTERNS);
}

/**
 * Checks if a path is potentially dangerous
 * @param {string} filePath - Path to check
 * @returns {boolean} True if dangerous
 */
export function isDangerousPath(filePath) {
  return matchesAnyPattern(filePath, DANGEROUS_PATH_PATTERNS);
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  DANGEROUS_PATTERNS,
  BLOCKED_COMMANDS,
  SENSITIVE_PATTERNS,
  DANGEROUS_PATH_PATTERNS,
  SUSPICIOUS_NETWORK_PATTERNS,
  SHELL_ESCAPE_CHARS,
  RiskLevel,
  PATTERN_RISK_LEVELS,
  matchesAnyPattern,
  getMatchingPatterns,
  isBlockedCommand,
  isSensitivePath,
  isDangerousPath
};
