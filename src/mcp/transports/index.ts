/**
 * MCP Transports
 *
 * Factory for creating transport instances based on configuration.
 *
 * @module src/mcp/transports
 */

import { StdioTransport, createStdioTransport } from './stdio.js';
import { HttpTransport, createHttpTransport } from './http.js';
import { SseTransport, createSseTransport } from './sse.js';

// ============================================================================
// Transport Types
// ============================================================================

/**
 * Transport type enum
 * @enum {string}
 */
export const TransportType = {
  STDIO: 'stdio',
  HTTP: 'http',
  SSE: 'sse'
};

// ============================================================================
// Transport Factory
// ============================================================================

/**
 * Create a transport based on configuration
 *
 * @param {Object} config - Server configuration
 * @param {string} config.type - Transport type (stdio, http, sse)
 * @returns {StdioTransport | HttpTransport | SseTransport}
 * @throws {Error} If transport type is unsupported
 */
export function createTransport(config) {
  switch (config.type) {
    case TransportType.STDIO:
      return createStdioTransport(config);

    case TransportType.HTTP:
      return createHttpTransport(config);

    case TransportType.SSE:
      return createSseTransport(config);

    default:
      throw new Error(`Unsupported transport type: ${config.type}`);
  }
}

/**
 * Check if transport type is supported
 *
 * @param {string} type - Transport type
 * @returns {boolean}
 */
export function isSupported(type) {
  return Object.values(TransportType).includes(type);
}

/**
 * Get list of supported transport types
 *
 * @returns {string[]}
 */
export function getSupportedTypes() {
  return Object.values(TransportType);
}

// ============================================================================
// Exports
// ============================================================================

export {
  StdioTransport,
  HttpTransport,
  SseTransport,
  createStdioTransport,
  createHttpTransport,
  createSseTransport
};

export default {
  createTransport,
  isSupported,
  getSupportedTypes,
  TransportType,
  StdioTransport,
  HttpTransport,
  SseTransport
};
