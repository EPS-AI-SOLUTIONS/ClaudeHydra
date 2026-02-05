#!/usr/bin/env node
/**
 * Claude Code Portable Launcher
 * Replacement for claude.ps1
 *
 * Usage: node scripts/launcher.js [arguments]
 */

import { spawn } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');

// Configuration
const CONFIG = {
  claudeCodePath: join(ROOT_DIR, 'bin', 'claude-code', 'cli.js'),
  configDir: join(ROOT_DIR, 'config'),
  dataDir: join(ROOT_DIR, 'data'),
  maxConcurrentAgents: '10',
  parallelTasks: 'true'
};

/**
 * Ensure directory exists
 * @param {string} dir - Directory path
 */
function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Check if Node.js is available
 * @returns {boolean}
 */
function checkNode() {
  try {
    // We're already running in Node, so this is always true
    return true;
  } catch {
    return false;
  }
}

/**
 * Setup portable environment variables
 */
function setupEnvironment() {
  const claudeDir = join(CONFIG.configDir, '.claude');

  ensureDir(CONFIG.configDir);
  ensureDir(claudeDir);
  ensureDir(CONFIG.dataDir);

  // Set environment variables for portable mode
  process.env.HOME = CONFIG.configDir;
  process.env.USERPROFILE = CONFIG.configDir;
  process.env.CLAUDE_CONFIG_DIR = claudeDir;

  // Agent configuration
  process.env.CLAUDE_MAX_CONCURRENT_AGENTS = CONFIG.maxConcurrentAgents;
  process.env.CLAUDE_PARALLEL_TASKS = CONFIG.parallelTasks;
}

/**
 * Launch Claude CLI
 * @param {string[]} args - Command line arguments
 */
function launchClaude(args) {
  // Check if cli.js exists
  if (!existsSync(CONFIG.claudeCodePath)) {
    console.error(`ERROR: cli.js not found at: ${CONFIG.claudeCodePath}`);
    process.exit(1);
  }

  console.log('\x1b[36mLaunching Claude Code Portable (no-confirm mode)...\x1b[0m');

  // Add --dangerously-skip-permissions flag
  const allArgs = ['--dangerously-skip-permissions', ...args];

  // Spawn Claude CLI
  const child = spawn('node', [CONFIG.claudeCodePath, ...allArgs], {
    stdio: 'inherit',
    env: process.env,
    cwd: process.cwd()
  });

  child.on('error', (err) => {
    console.error(`Failed to start Claude: ${err.message}`);
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}

/**
 * Main entry point
 */
function main() {
  if (!checkNode()) {
    console.error('ERROR: Node.js is not available');
    console.error('Install Node.js from: https://nodejs.org/');
    process.exit(1);
  }

  setupEnvironment();

  // Pass all arguments except the script name
  const args = process.argv.slice(2);
  launchClaude(args);
}

main();
