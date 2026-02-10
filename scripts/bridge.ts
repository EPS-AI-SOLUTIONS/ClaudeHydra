#!/usr/bin/env node

/**
 * Bridge IPC - Bidirectional communication between CLI and GUI
 * Replacement for bridge.ps1
 *
 * Creates approval requests that can be approved/rejected from the GUI.
 * Supports auto-approve mode for trusted scenarios.
 *
 * Usage:
 *   node scripts/bridge.js --message "Execute: rm -rf /tmp" --type command
 *   node scripts/bridge.js -m "Read file.txt" -t file --timeout 60
 */

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BRIDGE_FILE = join(__dirname, '..', 'bridge.json');

// Request types
const REQUEST_TYPES = ['command', 'file', 'network', 'system'];

// Default settings
const DEFAULT_SETTINGS = {
  poll_interval_ms: 2000,
  max_pending_requests: 10,
  timeout_ms: 300000,
};

// ANSI colors
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
};

/**
 * Parse command line arguments
 * @returns {Object} Parsed arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    message: '',
    type: 'command',
    timeout: 300,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '-m':
      case '--message':
        result.message = next || '';
        i++;
        break;
      case '-t':
      case '--type':
        if (REQUEST_TYPES.includes(next)) {
          result.type = next;
        }
        i++;
        break;
      case '--timeout':
        result.timeout = parseInt(next, 10) || 300;
        i++;
        break;
      case '-h':
      case '--help':
        showHelp();
        process.exit(0);
    }
  }

  return result;
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
Bridge IPC - CLI/GUI Communication

Usage:
  node scripts/bridge.js --message <msg> [options]

Options:
  -m, --message <text>  The approval message to display (required)
  -t, --type <type>     Request type: command, file, network, system (default: command)
  --timeout <seconds>   Timeout in seconds (default: 300)
  -h, --help            Show this help

Examples:
  node scripts/bridge.js -m "Execute: npm install" -t command
  node scripts/bridge.js --message "Read config.json" --type file --timeout 60
`);
}

/**
 * Read bridge data from file
 * @returns {Object} Bridge data
 */
function getBridgeData() {
  if (existsSync(BRIDGE_FILE)) {
    try {
      const content = readFileSync(BRIDGE_FILE, 'utf-8');
      return JSON.parse(content);
    } catch {
      // Return default if parsing fails
    }
  }

  return {
    auto_approve: false,
    requests: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

/**
 * Write bridge data to file
 * @param {Object} data - Bridge data
 */
function setBridgeData(data) {
  writeFileSync(BRIDGE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create and monitor an approval request
 * @param {string} message - Request message
 * @param {string} type - Request type
 * @param {number} timeout - Timeout in seconds
 * @returns {Promise<boolean>} True if approved, false if rejected/timeout
 */
async function createRequest(message, type, timeout) {
  const data = getBridgeData();

  // Check auto-approve mode
  if (data.auto_approve) {
    console.log(colors.green(`[Bridge] Auto-approved: ${message}`));
    return true;
  }

  // Create request
  const requestId = randomUUID().substring(0, 8);
  const request = {
    id: requestId,
    message,
    type,
    status: 'pending',
    timestamp: new Date().toISOString(),
  };

  // Add request
  data.requests = [...(data.requests || []), request];
  setBridgeData(data);

  console.log(colors.yellow(`[Bridge] Request created: ${requestId}`));
  console.log(colors.yellow('[Bridge] Waiting for approval...'));

  // Poll for status
  const startTime = Date.now();
  const pollInterval = Math.max(1000, data.settings?.poll_interval_ms || 2000);

  while (true) {
    await sleep(pollInterval);

    const elapsed = (Date.now() - startTime) / 1000;
    if (elapsed > timeout) {
      console.log(colors.red(`\n[Bridge] Request timed out after ${timeout}s`));

      // Clean up timed out request
      const currentData = getBridgeData();
      currentData.requests = (currentData.requests || []).filter((r) => r.id !== requestId);
      setBridgeData(currentData);

      return false;
    }

    const currentData = getBridgeData();
    const myRequest = (currentData.requests || []).find((r) => r.id === requestId);

    if (!myRequest) {
      console.log(colors.red('\n[Bridge] Request not found (possibly cleared)'));
      return false;
    }

    switch (myRequest.status) {
      case 'approved': {
        console.log(colors.green('\n[Bridge] APPROVED by GUI'));

        // Clean up approved request
        currentData.requests = currentData.requests.filter((r) => r.id !== requestId);
        setBridgeData(currentData);

        return true;
      }
      case 'rejected': {
        console.log(colors.red('\n[Bridge] REJECTED by GUI'));

        // Clean up rejected request
        currentData.requests = currentData.requests.filter((r) => r.id !== requestId);
        setBridgeData(currentData);

        return false;
      }
      default: {
        // Still pending, continue polling
        const remaining = Math.floor(timeout - elapsed);
        process.stdout.write(`\r[Bridge] Waiting... (${remaining}s remaining)  `);
      }
    }
  }
}

/**
 * Main entry point
 */
async function main() {
  const args = parseArgs();

  if (!args.message) {
    console.error(colors.red('Error: Message is required'));
    showHelp();
    process.exit(1);
  }

  try {
    const approved = await createRequest(args.message, args.type, args.timeout);
    process.exit(approved ? 0 : 1);
  } catch (error) {
    console.error(colors.red(`[Bridge] Error: ${error.message}`));
    process.exit(1);
  }
}

main();

// Export for programmatic use
export { createRequest, getBridgeData, setBridgeData, REQUEST_TYPES };
