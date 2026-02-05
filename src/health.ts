/**
 * Health Check Module for GeminiCLI
 *
 * Provides service health monitoring functionality including:
 * - Server status tracking (healthy, degraded, unhealthy)
 * - Uptime monitoring
 * - Memory usage statistics
 * - Version information
 *
 * @module health
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Valid health status values
 * @type {Set<string>}
 */
const VALID_STATUSES = new Set(['healthy', 'degraded', 'unhealthy']);

/**
 * Converts bytes to megabytes
 * @param {number} bytes - Value in bytes
 * @returns {number} Value in megabytes rounded to 2 decimal places
 */
function bytesToMB(bytes) {
  return Math.round((bytes / 1024 / 1024) * 100) / 100;
}

/**
 * Loads version from package.json
 * @returns {string} Version string or '1.0.0' as fallback
 */
function loadVersion() {
  try {
    const require = createRequire(import.meta.url);
    const packagePath = join(__dirname, '..', 'package.json');
    const pkg = require(packagePath);
    return pkg.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

/**
 * Creates a health check instance for monitoring service health
 *
 * @param {string} serverName - Name of the server/service to monitor
 * @returns {Object} Health check instance with methods:
 *   - getHealth(): Returns current health status object
 *   - setStatus(newStatus): Sets the health status
 *   - uptime(): Returns uptime in seconds
 *
 * @example
 * const healthCheck = createHealthCheck('MyService');
 * console.log(healthCheck.getHealth());
 * // {
 * //   name: 'MyService',
 * //   status: 'healthy',
 * //   uptimeSeconds: 123,
 * //   version: '2.0.0',
 * //   timestamp: '2024-01-19T12:00:00.000Z',
 * //   memory: { heapUsed: 45.23, heapTotal: 128.00, unit: 'MB' }
 * // }
 */
export function createHealthCheck(serverName) {
  const startTime = Date.now();
  let status = 'healthy';
  const version = loadVersion();

  /**
   * Gets the current uptime in seconds
   * @returns {number} Uptime in seconds
   */
  function uptime() {
    return Math.floor((Date.now() - startTime) / 1000);
  }

  /**
   * Sets the health status
   * @param {string} newStatus - New status: 'healthy', 'degraded', or 'unhealthy'
   * @throws {Error} If status is not a valid value
   */
  function setStatus(newStatus) {
    if (!VALID_STATUSES.has(newStatus)) {
      throw new Error(
        `Invalid status: ${newStatus}. Must be one of: ${[...VALID_STATUSES].join(', ')}`
      );
    }
    status = newStatus;
  }

  /**
   * Gets the current health status
   * @returns {Object} Health status object containing:
   *   - name: Server name
   *   - status: Current status ('healthy', 'degraded', 'unhealthy')
   *   - uptimeSeconds: Uptime in seconds
   *   - version: Server version from package.json
   *   - timestamp: ISO timestamp of the check
   *   - memory: Memory usage statistics in MB
   */
  function getHealth() {
    const memoryUsage = process.memoryUsage();

    return {
      name: serverName,
      status,
      uptimeSeconds: uptime(),
      version,
      timestamp: new Date().toISOString(),
      memory: {
        heapUsed: bytesToMB(memoryUsage.heapUsed),
        heapTotal: bytesToMB(memoryUsage.heapTotal),
        unit: 'MB',
      },
    };
  }

  return {
    getHealth,
    setStatus,
    uptime,
  };
}

/**
 * Pre-configured health check instance for GeminiCLI-MCP server
 * @type {Object}
 */
export const geminiHealth = createHealthCheck('GeminiCLI-MCP');

export default { createHealthCheck, geminiHealth };
