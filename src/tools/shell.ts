/**
 * Shell Tool - Refactored with BaseTool architecture and security improvements
 * Provides secure command execution with sandboxing and audit logging
 * @module tools/shell
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { SecurityError, ValidationError } from '../errors/AppError.js';
import { assessCommandRisk, shellCommandSchema } from '../schemas/tools.js';
import AuditLogger from '../security/audit-logger.js';
import { sanitize as sanitizeString } from '../utils/string.js';
import { BaseTool } from './base-tool.js';

/**
 * Command sanitizer - validates and sanitizes shell commands
 */
class CommandSanitizer {
  constructor(options = {}) {
    this.maxCommandLength = options.maxCommandLength || 10000;
    this.allowedEnvVars =
      options.allowedEnvVars ||
      new Set([
        'PATH',
        'HOME',
        'USER',
        'SHELL',
        'TERM',
        'LANG',
        'NODE_ENV',
        'npm_config_registry',
        'npm_lifecycle_event',
      ]);
  }

  /**
   * Sanitize and validate a command
   * @param {string} command - Raw command
   * @returns {{ command: string, risks: string[], severity: string }}
   */
  sanitize(command) {
    // Check length
    if (command.length > this.maxCommandLength) {
      throw new ValidationError(
        `Command exceeds maximum length of ${this.maxCommandLength} characters`,
      );
    }

    // Assess risk
    const riskAssessment = assessCommandRisk(command);

    if (!riskAssessment.safe && riskAssessment.severity === 'critical') {
      throw new SecurityError(
        `Command blocked for security reasons: ${riskAssessment.risks.join(', ')}`,
      );
    }

    // Use utility function to remove control characters and normalize line endings
    const sanitized = sanitizeString(command);

    return {
      command: sanitized,
      risks: riskAssessment.risks,
      severity: riskAssessment.severity,
    };
  }

  /**
   * Filter environment variables to only allowed ones
   * @param {Object} env - Environment variables
   * @returns {Object} Filtered environment
   */
  filterEnv(env = {}) {
    const filtered = {};

    // Start with allowed vars from current environment
    for (const key of this.allowedEnvVars) {
      if (process.env[key]) {
        filtered[key] = process.env[key];
      }
    }

    // Add user-provided env vars (after validation)
    for (const [key, value] of Object.entries(env)) {
      // Skip potentially dangerous env vars
      if (this.isDangerousEnvVar(key, value)) {
        continue;
      }
      filtered[key] = value;
    }

    return filtered;
  }

  /**
   * Check if an environment variable is potentially dangerous
   */
  isDangerousEnvVar(key, value) {
    const dangerousPatterns = [
      /^LD_/i, // Library loading
      /^DYLD_/i, // macOS library loading
      /^PATH$/i, // Don't allow PATH override from user
      /PRELOAD/i, // Preloading
      /^IFS$/i, // Input field separator
      /^CDPATH$/i, // CD path manipulation
      /^BASH_ENV$/i, // Bash startup
      /^ENV$/i, // Shell startup
    ];

    if (dangerousPatterns.some((p) => p.test(key))) {
      return true;
    }

    // Check value for command injection
    if (typeof value === 'string' && /[`$();|&<>]/.test(value)) {
      return true;
    }

    return false;
  }
}

/**
 * Shell Command Execution Tool
 */
class RunShellTool extends BaseTool {
  constructor() {
    super({
      name: 'run_shell_command',
      description: 'Execute a shell command with security controls and timeout',
      inputSchema: shellCommandSchema,
      timeoutMs: 60000,
    });

    this.sanitizer = new CommandSanitizer();
    this.activeProcesses = new Map();
  }

  async run({ command, cwd, timeout, env, shell, captureStderr }) {
    // Sanitize command
    const { command: sanitizedCommand, risks, severity } = this.sanitizer.sanitize(command);

    // Log to audit
    AuditLogger.logCommand(sanitizedCommand, {
      cwd,
      risks,
      severity,
      requestedTimeout: timeout,
    });

    // Warn about risky commands but allow them (except critical)
    if (risks.length > 0) {
      this.logger.warn(`Executing command with risks: ${risks.join(', ')}`, { severity });
    }

    // Resolve working directory safely
    const workingDir = cwd ? path.resolve(process.cwd(), cwd) : process.cwd();

    // Verify working directory is within project
    if (!workingDir.startsWith(process.cwd())) {
      throw new SecurityError('Working directory must be within project root');
    }

    // Determine shell
    const shellConfig = this.getShellConfig(shell);

    // Filter environment
    const filteredEnv = this.sanitizer.filterEnv(env);

    // Execute command
    const result = await this.executeCommand(sanitizedCommand, {
      cwd: workingDir,
      timeout: timeout || this.timeoutMs,
      env: filteredEnv,
      shell: shellConfig,
      captureStderr,
    });

    return {
      ...result,
      command: sanitizedCommand,
      risks: risks.length > 0 ? risks : undefined,
      severity: severity !== 'low' ? severity : undefined,
    };
  }

  /**
   * Get shell configuration based on platform and preference
   */
  getShellConfig(preferredShell) {
    const isWindows = process.platform === 'win32';

    if (preferredShell) {
      switch (preferredShell) {
        case 'powershell':
          return isWindows ? 'powershell.exe' : 'pwsh';
        case 'cmd':
          return isWindows ? 'cmd.exe' : false;
        case 'bash':
          return isWindows ? 'bash.exe' : '/bin/bash';
        case 'sh':
          return isWindows ? false : '/bin/sh';
      }
    }

    // Default shell
    return isWindows ? true : '/bin/sh';
  }

  /**
   * Execute command with spawn for better control
   */
  executeCommand(command, options) {
    return new Promise((resolve, reject) => {
      const { cwd, timeout, env, shell, captureStderr } = options;

      const startTime = Date.now();
      let stdout = '';
      let stderr = '';
      let killed = false;

      // Use spawn with shell option for better control
      const child = spawn(command, [], {
        cwd,
        env: { ...process.env, ...env },
        shell,
        windowsHide: true,
        timeout: 0, // We handle timeout ourselves
      });

      // Store reference for potential cleanup
      const processId = `${Date.now()}-${Math.random()}`;
      this.activeProcesses.set(processId, child);

      // Set up timeout
      const timeoutId = setTimeout(() => {
        killed = true;
        child.kill('SIGTERM');

        // Force kill after 5 seconds if still running
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);
      }, timeout);

      // Capture output
      child.stdout.on('data', (data) => {
        stdout += data.toString();
        // Prevent memory issues with very large output
        if (stdout.length > 5 * 1024 * 1024) {
          // 5MB limit
          stdout = `${stdout.substring(0, 5 * 1024 * 1024)}\n...[OUTPUT TRUNCATED]`;
          child.stdout.removeAllListeners('data');
        }
      });

      if (captureStderr) {
        child.stderr.on('data', (data) => {
          stderr += data.toString();
          if (stderr.length > 1024 * 1024) {
            // 1MB limit for stderr
            stderr = `${stderr.substring(0, 1024 * 1024)}\n...[STDERR TRUNCATED]`;
            child.stderr.removeAllListeners('data');
          }
        });
      }

      // Handle errors
      child.on('error', (error) => {
        clearTimeout(timeoutId);
        this.activeProcesses.delete(processId);

        reject(new Error(`Failed to execute command: ${error.message}`));
      });

      // Handle completion
      child.on('close', (code, signal) => {
        clearTimeout(timeoutId);
        this.activeProcesses.delete(processId);

        const duration = Date.now() - startTime;

        if (killed) {
          resolve({
            exitCode: -1,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            signal: signal || 'SIGTERM',
            timedOut: true,
            durationMs: duration,
          });
        } else {
          resolve({
            exitCode: code ?? 0,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            signal: signal || null,
            timedOut: false,
            durationMs: duration,
          });
        }
      });
    });
  }

  /**
   * Cleanup any active processes (called on shutdown)
   */
  cleanup() {
    for (const [_id, child] of this.activeProcesses) {
      try {
        child.kill('SIGTERM');
      } catch {
        // Ignore errors during cleanup
      }
    }
    this.activeProcesses.clear();
  }
}

/**
 * Interactive Shell Session Tool (for persistent shells)
 */
class ShellSessionTool extends BaseTool {
  constructor() {
    super({
      name: 'shell_session',
      description: 'Manage interactive shell sessions',
      inputSchema: shellCommandSchema,
      timeoutMs: 120000,
    });

    this.sessions = new Map();
  }

  async run(_input) {
    // Placeholder for interactive session support
    // This would maintain persistent shell sessions
    throw new Error('Interactive shell sessions not yet implemented');
  }
}

// Create tool instances
const runShellTool = new RunShellTool();

/**
 * Export tools in legacy format for backward compatibility
 */
export const tools = {
  runShell: runShellTool,
};

// Legacy export format for existing tool registry
export default [
  {
    name: runShellTool.name,
    description: runShellTool.description,
    inputSchema: runShellTool.getJsonSchema(),
    execute: (input) => runShellTool.execute(input),
  },
];

// Named exports
export { RunShellTool, CommandSanitizer, ShellSessionTool };

// Cleanup handler
process.on('SIGINT', () => runShellTool.cleanup());
process.on('SIGTERM', () => runShellTool.cleanup());
