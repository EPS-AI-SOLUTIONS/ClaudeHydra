/**
 * Bash Agent (Eskel)
 *
 * Command execution specialist for system operations.
 * Maps to Eskel - the DevOps and Shell Operations expert.
 *
 * @module src/agents/bash-agent
 */

import { BaseAgent, AgentState } from './base-agent.js';

// ============================================================================
// Constants
// ============================================================================

const AGENT_CONFIG = {
  name: 'Bash',
  witcherName: 'Eskel',
  description: `DevOps specialist for shell and system operations.
Executes git commands, npm/yarn operations, docker commands, and other terminal tasks.
Handles CI/CD, deployment, and infrastructure operations.`,
  capabilities: [
    'shell',
    'git',
    'npm',
    'yarn',
    'docker',
    'deploy',
    'ci_cd',
    'infrastructure',
    'build'
  ],
  timeout: 120000
};

/**
 * Dangerous commands that should be blocked
 * @constant {RegExp[]}
 */
const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\/(?!\w)/,        // rm -rf /
  /rm\s+-rf\s+~\//,             // rm -rf ~/
  /sudo\s+rm/,                   // sudo rm
  /chmod\s+777/,                 // insecure permissions
  /\|\s*bash$/,                  // piped bash
  /curl.*\|\s*sh/,               // remote script execution
  /wget.*\|\s*sh/,               // remote script execution
  /mkfs\./,                      // format filesystem
  /dd\s+if=/,                    // disk destroyer
  /:\s*\(\s*\)\s*\{.*\}/,        // fork bomb
  />\/dev\/sd[a-z]/,             // write to disk
  /shutdown/,                    // shutdown command
  /reboot/,                      // reboot command
  /init\s+[0-6]/                 // init level change
];

/**
 * Safe commands whitelist
 * @constant {string[]}
 */
const SAFE_COMMANDS = [
  'git', 'npm', 'yarn', 'pnpm', 'node', 'npx',
  'ls', 'pwd', 'cd', 'echo', 'cat', 'head', 'tail', 'grep',
  'find', 'which', 'whereis', 'env', 'printenv',
  'docker', 'docker-compose', 'kubectl',
  'python', 'python3', 'pip', 'pip3',
  'cargo', 'rustc',
  'go', 'gofmt',
  'make', 'cmake',
  'curl', 'wget',
  'tar', 'unzip', 'zip',
  'mkdir', 'touch', 'cp', 'mv',
  'chmod', 'chown'
];

// ============================================================================
// Bash Agent Class
// ============================================================================

/**
 * Bash Agent (Eskel)
 *
 * Specialized for shell command execution and DevOps operations.
 *
 * @extends BaseAgent
 */
export class BashAgent extends BaseAgent {
  /**
   * @param {Object} [options] - Agent options
   * @param {boolean} [options.strictMode=true] - Enable strict security checks
   * @param {string[]} [options.allowedCommands] - Additional allowed commands
   */
  constructor(options = {}) {
    super({
      ...AGENT_CONFIG,
      ...options
    });

    this.strictMode = options.strictMode !== false;
    this.allowedCommands = [...SAFE_COMMANDS, ...(options.allowedCommands || [])];

    /** @type {Object[]} */
    this.commandHistory = [];
  }

  /**
   * Execute bash task
   *
   * @param {Object} params - Task parameters
   * @param {string} params.command - Command to execute
   * @param {string} [params.cwd] - Working directory
   * @param {Object} [params.env] - Environment variables
   * @param {number} [params.timeout] - Command timeout
   * @returns {Promise<Object>}
   */
  async execute(params) {
    const { command, cwd = process.cwd(), env = {}, timeout = 60000 } = params;

    this.reportProgress(0, 'Validating command');

    // Validate command
    const validation = this.validateCommand(command);
    if (!validation.safe) {
      throw new Error(`Command blocked: ${validation.reason}`);
    }

    this.reportProgress(20, 'Preparing execution');

    const result = {
      command,
      cwd,
      stdout: '',
      stderr: '',
      exitCode: null,
      duration: 0
    };

    try {
      this.reportProgress(40, 'Executing command');

      // Execute command
      const startTime = Date.now();
      const execResult = await this.executeCommand(command, {
        cwd,
        env: { ...process.env, ...env },
        timeout,
        signal: params.signal
      });

      result.stdout = execResult.stdout;
      result.stderr = execResult.stderr;
      result.exitCode = execResult.exitCode;
      result.duration = Date.now() - startTime;

      // Log to history
      this.commandHistory.push({
        command,
        timestamp: new Date().toISOString(),
        exitCode: result.exitCode,
        duration: result.duration
      });

      this.reportProgress(100, 'Command completed');

      return result;
    } catch (error) {
      result.exitCode = error.code || 1;
      result.stderr = error.message;
      result.duration = Date.now() - (params.startTime || Date.now());

      throw error;
    }
  }

  /**
   * Validate command safety
   *
   * @param {string} command - Command to validate
   * @returns {Object}
   */
  validateCommand(command) {
    // Check for dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        return {
          safe: false,
          reason: `Matches dangerous pattern: ${pattern.toString()}`
        };
      }
    }

    // In strict mode, check against whitelist
    if (this.strictMode) {
      const baseCommand = command.trim().split(/\s+/)[0];

      // Handle command with path
      const commandName = baseCommand.split('/').pop();

      if (!this.allowedCommands.includes(commandName)) {
        return {
          safe: false,
          reason: `Command not in whitelist: ${commandName}`
        };
      }
    }

    // Additional checks
    const checks = [
      this.checkNoSecretExposure(command),
      this.checkNoDestructiveGit(command),
      this.checkNoSystemModification(command)
    ];

    for (const check of checks) {
      if (!check.safe) {
        return check;
      }
    }

    return { safe: true };
  }

  /**
   * Check for secret exposure in command
   *
   * @param {string} command - Command to check
   * @returns {Object}
   */
  checkNoSecretExposure(command) {
    const secretPatterns = [
      /password\s*=\s*['"][^'"]+['"]/i,
      /api[_-]?key\s*=\s*['"][^'"]+['"]/i,
      /secret\s*=\s*['"][^'"]+['"]/i,
      /token\s*=\s*['"][^'"]+['"]/i
    ];

    for (const pattern of secretPatterns) {
      if (pattern.test(command)) {
        return {
          safe: false,
          reason: 'Command appears to contain secrets'
        };
      }
    }

    return { safe: true };
  }

  /**
   * Check for destructive git operations
   *
   * @param {string} command - Command to check
   * @returns {Object}
   */
  checkNoDestructiveGit(command) {
    const destructiveGitPatterns = [
      /git\s+push\s+--force(?:-with-lease)?\s+(?:origin\s+)?main/,
      /git\s+push\s+--force(?:-with-lease)?\s+(?:origin\s+)?master/,
      /git\s+reset\s+--hard\s+origin/,
      /git\s+clean\s+-fd?x?f/,
      /git\s+checkout\s+\.\s*$/
    ];

    for (const pattern of destructiveGitPatterns) {
      if (pattern.test(command)) {
        return {
          safe: false,
          reason: 'Destructive git operation detected'
        };
      }
    }

    return { safe: true };
  }

  /**
   * Check for system modification commands
   *
   * @param {string} command - Command to check
   * @returns {Object}
   */
  checkNoSystemModification(command) {
    const systemPatterns = [
      /systemctl\s+(start|stop|restart|enable|disable)/,
      /service\s+\w+\s+(start|stop|restart)/,
      /apt(-get)?\s+(install|remove|purge)/,
      /yum\s+(install|remove)/,
      /pacman\s+-[SR]/,
      /brew\s+(install|uninstall)/
    ];

    for (const pattern of systemPatterns) {
      if (pattern.test(command)) {
        return {
          safe: false,
          reason: 'System modification command detected'
        };
      }
    }

    return { safe: true };
  }

  /**
   * Execute command
   *
   * @param {string} command - Command to execute
   * @param {Object} options - Execution options
   * @returns {Promise<Object>}
   */
  async executeCommand(command, options) {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: options.cwd,
        env: options.env,
        timeout: options.timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash'
      });

      return {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: 0
      };
    } catch (error) {
      return {
        stdout: error.stdout?.trim() || '',
        stderr: error.stderr?.trim() || error.message,
        exitCode: error.code || 1
      };
    }
  }

  /**
   * Execute git command
   *
   * @param {string} subcommand - Git subcommand
   * @param {string[]} [args] - Command arguments
   * @param {Object} [options] - Execution options
   * @returns {Promise<Object>}
   */
  async git(subcommand, args = [], options = {}) {
    const command = `git ${subcommand} ${args.join(' ')}`.trim();
    return this.execute({ command, ...options });
  }

  /**
   * Execute npm command
   *
   * @param {string} subcommand - npm subcommand
   * @param {string[]} [args] - Command arguments
   * @param {Object} [options] - Execution options
   * @returns {Promise<Object>}
   */
  async npm(subcommand, args = [], options = {}) {
    const command = `npm ${subcommand} ${args.join(' ')}`.trim();
    return this.execute({ command, ...options });
  }

  /**
   * Get command history
   *
   * @param {number} [limit] - Limit results
   * @returns {Object[]}
   */
  getHistory(limit) {
    if (limit) {
      return this.commandHistory.slice(-limit);
    }
    return [...this.commandHistory];
  }

  /**
   * Clear command history
   */
  clearHistory() {
    this.commandHistory = [];
  }

  /**
   * Get system prompt
   *
   * @returns {string}
   */
  getSystemPrompt() {
    return `You are Eskel, the DevOps and Shell Operations Expert.

Your role is to execute shell commands and manage system operations.
You excel at:
- Git operations (commits, branches, merges)
- Package management (npm, yarn, pip)
- Docker and container operations
- CI/CD and deployment tasks
- Build and infrastructure operations

Safety rules you MUST follow:
- NEVER execute destructive commands without explicit confirmation
- NEVER expose secrets or credentials
- NEVER force push to main/master
- NEVER skip pre-commit hooks (--no-verify)
- ALWAYS validate commands before execution

When executing git commits, always add:
Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>`;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a Bash agent
 *
 * @param {Object} [options] - Agent options
 * @returns {BashAgent}
 */
export function createBashAgent(options = {}) {
  return new BashAgent(options);
}

export default BashAgent;
