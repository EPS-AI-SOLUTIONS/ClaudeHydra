/**
 * @fileoverview Gemini CLI Client - Google AI Provider
 * Uses geminicli.com CLI tool for Gemini API access
 *
 * @description
 * This module provides a Node.js interface to the Gemini CLI,
 * enabling AI text generation through Google's Gemini models.
 *
 * @module hydra/providers/gemini-client
 * @requires child_process
 * @requires os
 * @requires fs
 * @requires path
 */

import { spawn } from 'child_process';
import { platform } from 'os';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Whether running on Windows platform
 * @type {boolean}
 * @constant
 */
const IS_WINDOWS = platform() === 'win32';

/**
 * @typedef {Object} GenerateOptions
 * @property {number} [timeout=120000] - Request timeout in milliseconds
 * @property {string} [model] - Specific Gemini model to use
 */

/**
 * @typedef {Object} GenerateResult
 * @property {string} content - Generated text content
 * @property {number} duration_ms - Request duration in milliseconds
 * @property {boolean} success - Whether generation was successful
 */

/**
 * @typedef {Object} HealthCheckResult
 * @property {boolean} available - Whether Gemini CLI is available
 * @property {string} version - CLI version string
 * @property {string} path - Path to Gemini CLI executable
 */

/**
 * @typedef {Object} StreamResult
 * @property {string} content - Full streamed content
 * @property {boolean} success - Whether streaming was successful
 */

/**
 * Finds the Gemini CLI executable path
 * Searches common installation locations on Windows and falls back to PATH
 *
 * @returns {string} Path to Gemini CLI executable
 * @private
 */
function getGeminiPath() {
  if (IS_WINDOWS) {
    const userProfile = process.env.USERPROFILE || '';
    const appData = process.env.APPDATA || '';

    const candidates = [
      `${userProfile}\\AppData\\Roaming\\npm\\gemini.cmd`,
      `${appData}\\npm\\gemini.cmd`,
      'gemini.cmd',
      'gemini'
    ];

    for (const path of candidates) {
      try {
        if (existsSync(path)) {
          return path;
        }
      } catch {
        // Continue to next candidate
      }
    }
  }

  return 'gemini';
}

/**
 * Path to Gemini CLI executable
 * @type {string}
 * @constant
 */
const GEMINI_PATH = getGeminiPath();

/**
 * Generate completion from Gemini CLI
 * Uses temp file for prompt to avoid shell escaping issues
 *
 * @param {string} prompt - The prompt to send to Gemini
 * @param {GenerateOptions} [options={}] - Generation options
 * @returns {Promise<GenerateResult>} Generated content with metadata
 * @throws {Error} If Gemini CLI returns an error or times out
 *
 * @example
 * const result = await generate('What is the capital of France?');
 * console.log(result.content); // 'Paris'
 *
 * @example
 * // With custom model
 * const result = await generate('Explain quantum physics', {
 *   model: 'gemini-pro',
 *   timeout: 60000
 * });
 */
export async function generate(prompt, options = {}) {
  const { timeout = 120000, model } = options;
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    // Build command with proper escaping for Windows
    const args = [];
    if (model) {
      args.push('-m', model);
    }

    // For Windows with shell=true, we need to carefully escape the prompt
    // Use JSON output format for easier parsing
    args.push('-o', 'json');
    args.push(prompt);

    // On Windows, avoid deprecation warning by using command string with shell=true
    let proc;
    if (IS_WINDOWS) {
      const escapedArgs = args.map(arg =>
        arg.includes(' ') || arg.includes('"') ? `"${arg.replace(/"/g, '\\"')}"` : arg
      );
      const command = `"${GEMINI_PATH}" ${escapedArgs.join(' ')}`;
      proc = spawn(command, [], { shell: true, windowsHide: true, env: { ...process.env } });
    } else {
      proc = spawn(GEMINI_PATH, args, { windowsHide: true, env: { ...process.env } });
    }

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      const duration_ms = Date.now() - startTime;

      if (code === 0) {
        // Try to parse JSON output
        let content = stdout;
        try {
          // Filter out warnings before JSON
          const lines = stdout.split('\n');
          const jsonStart = lines.findIndex(l => l.trim().startsWith('{') || l.trim().startsWith('['));
          if (jsonStart >= 0) {
            const jsonStr = lines.slice(jsonStart).join('\n');
            const data = JSON.parse(jsonStr);
            content = data.response || data.content || data.text || JSON.stringify(data, null, 2);
          }
        } catch {
          // If JSON parsing fails, use raw output but filter warnings
          content = stdout
            .split('\n')
            .filter(line => !line.includes('GOOGLE_API_KEY') && !line.includes('GEMINI_API_KEY'))
            .join('\n')
            .trim();
        }

        resolve({ content, duration_ms, success: true });
      } else {
        reject(new Error(`Gemini error (code ${code}): ${stderr || stdout}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to start Gemini: ${err.message}`));
    });

    // Timeout handling
    const timeoutId = setTimeout(() => {
      proc.kill();
      reject(new Error(`Gemini timeout after ${timeout}ms`));
    }, timeout);

    proc.on('close', () => clearTimeout(timeoutId));
  });
}

/**
 * Stream completion from Gemini CLI
 * Provides real-time output as content is generated
 *
 * @param {string} prompt - The prompt to send to Gemini
 * @param {Function} onChunk - Callback function called for each content chunk
 * @param {GenerateOptions} [options={}] - Generation options
 * @returns {Promise<StreamResult>} Full streamed content when complete
 * @throws {Error} If streaming fails
 *
 * @example
 * await streamGenerate('Tell me a story', (chunk) => {
 *   process.stdout.write(chunk);
 * });
 */
export async function streamGenerate(prompt, onChunk, options = {}) {
  const { model } = options;

  const args = [];
  if (model) {
    args.push('-m', model);
  }
  args.push(prompt);

  return new Promise((resolve, reject) => {
    let proc;
    if (IS_WINDOWS) {
      const escapedArgs = args.map(arg =>
        arg.includes(' ') || arg.includes('"') ? `"${arg.replace(/"/g, '\\"')}"` : arg
      );
      const command = `"${GEMINI_PATH}" ${escapedArgs.join(' ')}`;
      proc = spawn(command, [], { shell: true, windowsHide: true });
    } else {
      proc = spawn(GEMINI_PATH, args, { windowsHide: true });
    }
    let fullContent = '';

    proc.stdout.on('data', (data) => {
      const chunk = data.toString();
      // Filter API key warnings
      if (!chunk.includes('GOOGLE_API_KEY') && !chunk.includes('GEMINI_API_KEY')) {
        fullContent += chunk;
        onChunk(chunk);
      }
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ content: fullContent.trim(), success: true });
      } else {
        reject(new Error(`Gemini stream error (code ${code})`));
      }
    });

    proc.on('error', reject);
  });
}

/**
 * Check if Gemini CLI is available
 * Verifies installation and returns version information
 *
 * @returns {Promise<HealthCheckResult>} Health check result
 *
 * @example
 * const health = await healthCheck();
 * if (health.available) {
 *   console.log(`Gemini CLI v${health.version} is available`);
 * }
 */
export async function healthCheck() {
  return new Promise((resolve) => {
    let proc;
    if (IS_WINDOWS) {
      const command = `"${GEMINI_PATH}" --version`;
      proc = spawn(command, [], { shell: true, windowsHide: true });
    } else {
      proc = spawn(GEMINI_PATH, ['--version'], { windowsHide: true });
    }
    let version = '';

    proc.stdout.on('data', (data) => {
      version += data.toString();
    });

    proc.on('close', (code) => {
      resolve({
        available: code === 0,
        version: version.trim(),
        path: GEMINI_PATH
      });
    });

    proc.on('error', () => {
      resolve({ available: false, version: '', path: GEMINI_PATH });
    });

    setTimeout(() => {
      proc.kill();
      resolve({ available: false, version: '', path: GEMINI_PATH });
    }, 10000);
  });
}

/**
 * Get the configured Gemini CLI path
 * @returns {string} Path to Gemini CLI
 */
export function getPath() {
  return GEMINI_PATH;
}

/**
 * Check if running on Windows
 * @returns {boolean} True if on Windows
 */
export function isWindows() {
  return IS_WINDOWS;
}

// Named exports for constants (for backward compatibility)
export { GEMINI_PATH, IS_WINDOWS };

// Default export as module object
export default {
  generate,
  streamGenerate,
  healthCheck,
  getPath,
  isWindows,
  GEMINI_PATH,
  IS_WINDOWS
};
