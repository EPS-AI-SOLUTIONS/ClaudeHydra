/**
 * Hydra Providers - Unified exports
 * @module hydra/providers
 */

// LlamaCpp (local via MCP)
export * from './llamacpp-bridge.js';
export * from './llamacpp-models.js';
export * from './llamacpp-provider.js';

// Gemini (cloud)
export * from './gemini-client.js';
export * from './gemini-models.js';
export * from './gemini-provider.js';

// Claude (cloud)
export * from './claude-client.js';

// Re-export main singletons for convenience
export { getLlamaCppBridge } from './llamacpp-bridge.js';
export { getLlamaCppProvider, resetLlamaCppProvider } from './llamacpp-provider.js';
export { getGeminiProvider, resetGeminiProvider } from './gemini-provider.js';
