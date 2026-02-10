/**
 * Tool definitions and executor for Claude Agent SDK tool_use loop.
 *
 * Provides MCP-style tools that Claude can invoke during multi-turn
 * conversations. Each tool is validated for security before execution.
 *
 * @module cli-unified/processing/tools-for-sdk
 */

import { execSync } from 'node:child_process';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, normalize, relative, resolve } from 'node:path';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger('ToolsForSDK');

// ============================================================================
// Security helpers
// ============================================================================

/** Maximum file size readable (5 MB) */
const MAX_READ_SIZE = 5 * 1024 * 1024;

/** Maximum shell command timeout (30 s) */
const SHELL_TIMEOUT = 30_000;

/** Maximum output length returned to the model (100 KB) */
const MAX_OUTPUT_LENGTH = 100_000;

/**
 * Resolve a path relative to CWD and ensure it doesn't escape the project.
 */
function safePath(inputPath: string): string {
  const cwd = process.cwd();
  const resolved = isAbsolute(inputPath) ? normalize(inputPath) : resolve(cwd, inputPath);

  // Must be within CWD subtree
  const rel = relative(cwd, resolved);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Path traversal blocked: "${inputPath}" resolves outside project root`);
  }

  return resolved;
}

/**
 * Truncate output that would blow up context.
 */
function truncate(text: string, max = MAX_OUTPUT_LENGTH): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n... [truncated, ${text.length - max} chars omitted]`;
}

/**
 * Blocked shell command patterns (destructive or dangerous).
 */
const BLOCKED_SHELL_PATTERNS = [
  /\brm\s+-rf?\b/i,
  /\bdel\s+\/[sfq]/i,
  /\bformat\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\b(shutdown|reboot|halt|poweroff)\b/i,
  /\bcurl\b.*\|\s*(sh|bash|powershell)/i,
  /\bwget\b.*\|\s*(sh|bash|powershell)/i,
  /\b(sudo|runas)\b/i,
  /\bchmod\s+777\b/i,
  /\breg\s+(delete|add)\b/i,
];

function validateShellCommand(command: string): void {
  for (const pattern of BLOCKED_SHELL_PATTERNS) {
    if (pattern.test(command)) {
      throw new Error(`Blocked shell command pattern: ${pattern.source}`);
    }
  }
}

// ============================================================================
// Tool Definitions (Claude SDK format)
// ============================================================================

export function getMCPToolDefinitions() {
  return [
    {
      name: 'read_file',
      description:
        'Read the contents of a file at the given path (relative to project root). Returns file content as text. Max 5 MB.',
      input_schema: {
        type: 'object' as const,
        properties: {
          path: {
            type: 'string' as const,
            description: 'File path (relative to project root or absolute)',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'write_file',
      description:
        'Write content to a file. Creates the file if it does not exist, overwrites if it does.',
      input_schema: {
        type: 'object' as const,
        properties: {
          path: {
            type: 'string' as const,
            description: 'File path (relative to project root or absolute)',
          },
          content: {
            type: 'string' as const,
            description: 'Content to write to the file',
          },
        },
        required: ['path', 'content'],
      },
    },
    {
      name: 'list_directory',
      description:
        'List files and directories at the given path. Returns entries separated by newlines with [FILE] or [DIR] prefix.',
      input_schema: {
        type: 'object' as const,
        properties: {
          path: {
            type: 'string' as const,
            description: 'Directory path (relative to project root, use "." for root)',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'run_shell_command',
      description:
        'Execute a shell command and return stdout. Use for npm, git, grep, find, etc. Timeout: 30s. Dangerous commands are blocked.',
      input_schema: {
        type: 'object' as const,
        properties: {
          command: {
            type: 'string' as const,
            description: 'Shell command to execute',
          },
        },
        required: ['command'],
      },
    },
    {
      name: 'search_files',
      description:
        'Search for files matching a glob pattern (e.g. "**/*.ts", "src/**/*.test.js"). Returns matching file paths.',
      input_schema: {
        type: 'object' as const,
        properties: {
          pattern: {
            type: 'string' as const,
            description: 'Glob pattern to match files',
          },
          directory: {
            type: 'string' as const,
            description: 'Directory to search in (default: project root)',
          },
        },
        required: ['pattern'],
      },
    },
    {
      name: 'search_content',
      description:
        'Search for a text pattern inside files (like grep). Returns matching lines with file path and line number.',
      input_schema: {
        type: 'object' as const,
        properties: {
          pattern: {
            type: 'string' as const,
            description: 'Text or regex pattern to search for',
          },
          directory: {
            type: 'string' as const,
            description: 'Directory to search in (default: project root)',
          },
          filePattern: {
            type: 'string' as const,
            description: 'Optional glob to filter files (e.g. "*.ts")',
          },
        },
        required: ['pattern'],
      },
    },
  ];
}

// ============================================================================
// Tool Executor
// ============================================================================

/**
 * Execute a tool call from Claude SDK.
 * Returns the result as a string to be fed back to the model.
 */
export async function executeToolCall(
  toolName: string,
  input: Record<string, any>,
): Promise<string> {
  logger.info(`Tool call: ${toolName}`, { input });
  const startTime = Date.now();

  try {
    let result: string;

    switch (toolName) {
      case 'read_file':
        result = await toolReadFile(input.path);
        break;

      case 'write_file':
        result = await toolWriteFile(input.path, input.content);
        break;

      case 'list_directory':
        result = await toolListDirectory(input.path);
        break;

      case 'run_shell_command':
        result = await toolRunShell(input.command);
        break;

      case 'search_files':
        result = await toolSearchFiles(input.pattern, input.directory);
        break;

      case 'search_content':
        result = await toolSearchContent(input.pattern, input.directory, input.filePattern);
        break;

      default:
        result = `Unknown tool: ${toolName}`;
    }

    const duration = Date.now() - startTime;
    logger.info(`Tool ${toolName} completed in ${duration}ms`, {
      resultLength: result.length,
    });

    return truncate(result);
  } catch (error: any) {
    logger.warn(`Tool ${toolName} failed: ${error.message}`);
    return `Error: ${error.message}`;
  }
}

// ============================================================================
// Individual tool implementations
// ============================================================================

async function toolReadFile(filePath: string): Promise<string> {
  const resolved = safePath(filePath);
  const stats = await stat(resolved);

  if (stats.size > MAX_READ_SIZE) {
    throw new Error(`File too large: ${stats.size} bytes (max ${MAX_READ_SIZE})`);
  }

  return await readFile(resolved, 'utf-8');
}

async function toolWriteFile(filePath: string, content: string): Promise<string> {
  const resolved = safePath(filePath);
  await writeFile(resolved, content, 'utf-8');
  return `File written successfully: ${filePath} (${content.length} bytes)`;
}

async function toolListDirectory(dirPath: string): Promise<string> {
  const resolved = safePath(dirPath || '.');
  const entries = await readdir(resolved, { withFileTypes: true });

  const lines = entries.map((entry) => {
    const prefix = entry.isDirectory() ? '[DIR]' : '[FILE]';
    return `${prefix} ${entry.name}`;
  });

  return lines.join('\n') || '(empty directory)';
}

async function toolRunShell(command: string): Promise<string> {
  if (!command || typeof command !== 'string') {
    throw new Error('Empty command');
  }

  validateShellCommand(command);

  try {
    const stdout = execSync(command, {
      encoding: 'utf-8',
      timeout: SHELL_TIMEOUT,
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024, // 1 MB
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return stdout || '(no output)';
  } catch (error: any) {
    const stderr = error.stderr || '';
    const stdout = error.stdout || '';
    return `Command failed (exit ${error.status || 'unknown'}):\n${stderr}\n${stdout}`.trim();
  }
}

async function toolSearchFiles(pattern: string, directory?: string): Promise<string> {
  const dir = safePath(directory || '.');
  // Use a simple shell glob via find/dir command
  const isWin = process.platform === 'win32';

  let command: string;
  if (isWin) {
    // PowerShell Get-ChildItem with wildcard
    const cleanPattern = pattern.replace(/"/g, '');
    command = `powershell -Command "Get-ChildItem -Path '${dir}' -Recurse -Name -Include '${cleanPattern}' | Select-Object -First 100"`;
  } else {
    command = `find "${dir}" -name "${pattern}" -type f 2>/dev/null | head -100`;
  }

  try {
    const result = execSync(command, {
      encoding: 'utf-8',
      timeout: SHELL_TIMEOUT,
      maxBuffer: 512 * 1024,
    });
    return result.trim() || '(no matches)';
  } catch {
    return '(search failed)';
  }
}

async function toolSearchContent(
  pattern: string,
  directory?: string,
  filePattern?: string,
): Promise<string> {
  const dir = safePath(directory || '.');
  const isWin = process.platform === 'win32';

  let command: string;
  const cleanPattern = pattern.replace(/"/g, '\\"');

  if (isWin) {
    const _includeFlag = filePattern ? `--include="${filePattern}"` : '';
    command = `powershell -Command "Select-String -Path '${dir}\\*' -Pattern '${cleanPattern}' -Recurse ${filePattern ? `-Include '${filePattern}'` : ''} | Select-Object -First 50 | ForEach-Object { $_.ToString() }"`;
  } else {
    const includeFlag = filePattern ? `--include="${filePattern}"` : '';
    command = `grep -rn "${cleanPattern}" "${dir}" ${includeFlag} 2>/dev/null | head -50`;
  }

  try {
    const result = execSync(command, {
      encoding: 'utf-8',
      timeout: SHELL_TIMEOUT,
      maxBuffer: 512 * 1024,
    });
    return result.trim() || '(no matches)';
  } catch {
    return '(search failed or no matches)';
  }
}

export default {
  getMCPToolDefinitions,
  executeToolCall,
};
