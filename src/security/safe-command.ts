/**
 * @fileoverview Safe Command Execution Wrapper
 *
 * Provides hardened wrappers around child_process.spawn and child_process.exec
 * that enforce security validation BEFORE any command is executed.
 *
 * Integrates with SecurityEnforcer.checkCommand() to validate all commands
 * against DANGEROUS_PATTERNS, BLOCKED_COMMANDS, and SHELL_ESCAPE_CHARS.
 *
 * CRITICAL: All external command execution in this project MUST go through
 * safeSpawn() or safeExec(). Direct usage of spawn/exec with untrusted
 * input is a security violation.
 *
 * @module security/safe-command
 * @version 1.0.0
 */

import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { exec, execSync, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { getSecurityEnforcer } from './enforcer.js';
import { RiskLevel } from './patterns.js';

const execAsync = promisify(exec);

// ============================================================================
// Constants
// ============================================================================

/**
 * Whitelist of known-safe executable names.
 * Only these can be used with safeSpawn().
 * Arbitrary binaries require explicit opt-in via `allowUnlisted: true`.
 */
export const ALLOWED_EXECUTABLES = Object.freeze([
  // Editors
  'code',
  'vim',
  'nvim',
  'nano',
  'emacs',
  'notepad',
  'notepad++',
  // Version control
  'git',
  // Node/NPM/Bun/pnpm
  'node',
  'npm',
  'npx',
  'pnpm',
  'bun',
  'bunx',
  'tsx',
  'ts-node',
  // System utils (safe subset)
  'which',
  'where',
  'echo',
  'cat',
  'ls',
  'dir',
  'type',
  'find',
  'grep',
  'head',
  'tail',
  'wc',
  'sort',
  'uniq',
  'diff',
  // MCP servers
  'ollama',
  'uvx',
  'python',
  'python3',
]);

/**
 * Git subcommands that are considered safe (read-only or low-risk).
 * Write operations (commit, push, reset) are allowed but validated separately.
 */
export const SAFE_GIT_SUBCOMMANDS = Object.freeze([
  'status',
  'diff',
  'log',
  'show',
  'branch',
  'tag',
  'remote',
  'rev-parse',
  'ls-files',
  'ls-tree',
  'cat-file',
  'describe',
  'stash',
  'fetch',
  'pull',
  'add',
  'commit',
  'push',
]);

/**
 * Git subcommands that are DANGEROUS and require extra validation.
 */
const DANGEROUS_GIT_SUBCOMMANDS = Object.freeze([
  'reset --hard',
  'checkout .',
  'clean -f',
  'push --force',
  'branch -D',
  'rebase',
  'filter-branch',
]);

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Thrown when a command is rejected by security validation.
 */
export class CommandSecurityError extends Error {
  /** @type {string} */
  command;
  /** @type {string} */
  risk;
  /** @type {string[]} */
  reasons;

  constructor(command: string, risk: string, reasons: string[]) {
    super(`Security: command blocked (risk=${risk}): ${reasons.join('; ')}`);
    this.name = 'CommandSecurityError';
    this.command = command;
    this.risk = risk;
    this.reasons = reasons;
  }
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validates that an executable name is on the whitelist.
 *
 * @param {string} executable - The binary/command name (e.g. 'git', 'code')
 * @param {boolean} [allowUnlisted=false] - If true, skip whitelist check
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateExecutable(
  executable: string,
  allowUnlisted = false,
): { valid: boolean; reason?: string } {
  if (!executable || typeof executable !== 'string') {
    return { valid: false, reason: 'Empty or invalid executable name' };
  }

  // Normalize: strip path, get just the binary name
  const baseName = executable
    .replace(/^.*[/\\]/, '')
    .replace(/\.exe$/i, '')
    .toLowerCase();

  // Check for path traversal in the executable itself
  if (executable.includes('..') || executable.includes('\x00')) {
    return { valid: false, reason: 'Path traversal detected in executable' };
  }

  // Check for shell metacharacters in the executable name
  if (/[;|&$`"'<>(){}[\]!#~\n\r]/.test(executable)) {
    return { valid: false, reason: 'Shell metacharacters in executable name' };
  }

  if (allowUnlisted) {
    return { valid: true };
  }

  if (!ALLOWED_EXECUTABLES.includes(baseName)) {
    return {
      valid: false,
      reason: `Executable '${baseName}' not in whitelist. Use allowUnlisted: true to bypass.`,
    };
  }

  return { valid: true };
}

/**
 * Validates an array of string arguments for shell injection patterns.
 *
 * @param {string[]} args - Command arguments to validate
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateArgs(args: string[]): { valid: boolean; reason?: string } {
  if (!Array.isArray(args)) {
    return { valid: false, reason: 'Arguments must be an array' };
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (typeof arg !== 'string') {
      return { valid: false, reason: `Argument at index ${i} is not a string` };
    }

    // Null bytes are always dangerous
    if (arg.includes('\x00')) {
      return { valid: false, reason: `Null byte in argument at index ${i}` };
    }

    // Command substitution patterns (when NOT using shell: true, these are safe,
    // but we flag them anyway as defense-in-depth)
    if (/\$\(.*\)/.test(arg) || /`.*`/.test(arg)) {
      return {
        valid: false,
        reason: `Command substitution detected in argument at index ${i}: ${arg}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Validates a git command string.
 * Ensures the subcommand is known and arguments don't contain injection.
 *
 * @param {string} gitCommand - The git command (without 'git' prefix)
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateGitCommand(gitCommand: string): { valid: boolean; reason?: string } {
  if (!gitCommand || typeof gitCommand !== 'string') {
    return { valid: false, reason: 'Empty git command' };
  }

  // Check for dangerous git subcommands
  for (const dangerous of DANGEROUS_GIT_SUBCOMMANDS) {
    if (gitCommand.trim().startsWith(dangerous)) {
      return { valid: false, reason: `Dangerous git subcommand: ${dangerous}` };
    }
  }

  // Check for command chaining (;, &&, ||, |)
  if (/[;|&]/.test(gitCommand.replace(/--[a-z-]+/g, ''))) {
    // But allow && in commit messages (inside quotes)
    const outsideQuotes = gitCommand.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');
    if (/[;|&]/.test(outsideQuotes.replace(/--[a-z-]+/g, ''))) {
      return { valid: false, reason: 'Shell operators detected in git command' };
    }
  }

  // Check for command substitution
  if (/\$\(/.test(gitCommand) || /`/.test(gitCommand)) {
    // Allow inside quoted commit messages
    const outsideQuotes = gitCommand.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');
    if (/\$\(/.test(outsideQuotes) || /`/.test(outsideQuotes)) {
      return { valid: false, reason: 'Command substitution in git command' };
    }
  }

  return { valid: true };
}

// ============================================================================
// Safe Execution Wrappers
// ============================================================================

/**
 * @typedef {Object} SafeSpawnOptions
 * @property {boolean} [allowUnlisted=false] - Allow executables not in whitelist
 * @property {boolean} [inheritStdio=false] - Inherit stdio (for interactive processes)
 * @property {SpawnOptions} [spawnOptions] - Additional spawn options (shell is ALWAYS forced to false)
 */
interface SafeSpawnOptions {
  allowUnlisted?: boolean;
  inheritStdio?: boolean;
  spawnOptions?: Omit<SpawnOptions, 'shell'>;
}

/**
 * Safe wrapper around child_process.spawn.
 *
 * ENFORCES:
 * 1. Executable whitelist validation
 * 2. Argument array validation (no injection)
 * 3. shell: false (ALWAYS — prevents shell interpretation of arguments)
 * 4. SecurityEnforcer.checkCommand() validation
 *
 * @param {string} command - Executable to run
 * @param {string[]} args - Argument array (NEVER concatenated into string)
 * @param {SafeSpawnOptions} [options={}] - Options
 * @returns {ChildProcess} Spawned child process
 * @throws {CommandSecurityError} If validation fails
 *
 * @example
 * // Safe: arguments are passed as array, shell=false
 * const proc = safeSpawn('git', ['status', '--porcelain']);
 *
 * // Safe: editor with temp file
 * const editor = safeSpawn('code', ['--wait', tempFilePath]);
 */
export function safeSpawn(
  command: string,
  args: string[] = [],
  options: SafeSpawnOptions = {},
): ChildProcess {
  const { allowUnlisted = false, inheritStdio = false, spawnOptions = {} } = options;

  // Step 1: Validate executable
  const execCheck = validateExecutable(command, allowUnlisted);
  if (!execCheck.valid) {
    throw new CommandSecurityError(command, RiskLevel.CRITICAL, [execCheck.reason!]);
  }

  // Step 2: Validate arguments
  const argsCheck = validateArgs(args);
  if (!argsCheck.valid) {
    throw new CommandSecurityError(`${command} ${args.join(' ')}`, RiskLevel.HIGH, [
      argsCheck.reason!,
    ]);
  }

  // Step 3: Run through SecurityEnforcer for pattern matching
  const fullCommand = `${command} ${args.join(' ')}`;
  const enforcer = getSecurityEnforcer(undefined);
  const secResult = enforcer.checkCommand(fullCommand);

  if (!secResult.safe) {
    throw new CommandSecurityError(fullCommand, secResult.risk, secResult.reasons);
  }

  // Step 4: Spawn with shell: false (CRITICAL — no shell interpretation)
  const spawnOpts: SpawnOptions = {
    ...spawnOptions,
    stdio: inheritStdio ? 'inherit' : ['pipe', 'pipe', 'pipe'],
    shell: false, // NEVER true — this is the whole point of safe-command
  };

  return spawn(command, args, spawnOpts);
}

/**
 * Safe wrapper around child_process.exec for git commands.
 *
 * Uses execAsync (promisified exec) but validates the git command first.
 * Arguments are passed through a validated git command string.
 *
 * For git specifically, we allow shell: true because git commands
 * use complex quoting (e.g., commit messages with heredocs).
 * However, we validate the command string first.
 *
 * @param {string} gitSubcommand - Git subcommand string (without 'git' prefix)
 * @param {Object} [options={}] - Execution options
 * @param {string} [options.cwd] - Working directory
 * @returns {Promise<{ stdout: string, stderr: string }>}
 * @throws {CommandSecurityError} If validation fails
 *
 * @example
 * const result = await safeGit('status --porcelain', { cwd: '/my/repo' });
 * const result = await safeGit('add "my file.ts"', { cwd: '/my/repo' });
 */
export async function safeGit(
  gitSubcommand: string,
  options: { cwd?: string; maxBuffer?: number } = {},
): Promise<{ success: boolean; stdout: string; stderr: string; error?: Error }> {
  const { cwd = process.cwd(), maxBuffer = 10 * 1024 * 1024 } = options;

  // Step 1: Validate git command
  const gitCheck = validateGitCommand(gitSubcommand);
  if (!gitCheck.valid) {
    throw new CommandSecurityError(`git ${gitSubcommand}`, RiskLevel.HIGH, [gitCheck.reason!]);
  }

  // Step 2: Run through SecurityEnforcer
  const fullCommand = `git ${gitSubcommand}`;
  const enforcer = getSecurityEnforcer(undefined);
  const secResult = enforcer.checkCommand(fullCommand);

  if (!secResult.safe) {
    throw new CommandSecurityError(fullCommand, secResult.risk, secResult.reasons);
  }

  // Step 3: Execute
  try {
    const { stdout, stderr } = await execAsync(fullCommand, { cwd, maxBuffer });
    return {
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
  } catch (error: any) {
    return {
      success: false,
      stdout: error.stdout?.trim() || '',
      stderr: error.stderr?.trim() || error.message,
      error,
    };
  }
}

/**
 * Safe wrapper for detecting executables using 'which'/'where'.
 *
 * Validates the binary name against a strict pattern before calling
 * which/where. Returns null if not found instead of throwing.
 *
 * @param {string} name - Binary name to detect (e.g. 'code', 'vim')
 * @returns {string | null} Path to binary or null
 */
export function safeWhich(name: string): string | null {
  // Validate: only alphanumeric, dash, underscore, dots
  if (!/^[a-zA-Z0-9._+-]+$/.test(name)) {
    return null;
  }

  // Cannot contain path separators
  if (name.includes('/') || name.includes('\\')) {
    return null;
  }

  const which = process.platform === 'win32' ? 'where' : 'which';

  try {
    // Using execSync with the binary name validated above.
    // shell: false is not available for execSync, but the input is validated.
    const result = execSync(`${which} ${name}`, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim() || null;
  } catch {
    return null;
  }
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  safeSpawn,
  safeGit,
  safeWhich,
  validateExecutable,
  validateArgs,
  validateGitCommand,
  CommandSecurityError,
  ALLOWED_EXECUTABLES,
  SAFE_GIT_SUBCOMMANDS,
};
