/**
 * @fileoverview LlamaCpp MCP Bridge
 * Adapter layer for invoking llama-cpp MCP tools
 *
 * This bridge provides a clean interface for calling llama-cpp MCP tools
 * and converts responses to the standard ProviderResult format.
 *
 * @module hydra/providers/llamacpp-bridge
 */

import { TASK_MODEL_MAP, GGUF_MODELS } from './llamacpp-models.js';

// =============================================================================
// MCP Tool Names
// =============================================================================

/**
 * MCP tool name constants
 * @type {Object<string, string>}
 */
export const MCP_TOOLS = {
  GENERATE: 'mcp__llama-cpp__llama_generate',
  GENERATE_FAST: 'mcp__llama-cpp__llama_generate_fast',
  CHAT: 'mcp__llama-cpp__llama_chat',
  JSON: 'mcp__llama-cpp__llama_json',
  CODE: 'mcp__llama-cpp__llama_code',
  ANALYZE: 'mcp__llama-cpp__llama_analyze',
  EMBED: 'mcp__llama-cpp__llama_embed',
  VISION: 'mcp__llama-cpp__llama_vision',
  FUNCTION_CALL: 'mcp__llama-cpp__llama_function_call',
  TOKENIZE: 'mcp__llama-cpp__llama_tokenize',
  DETOKENIZE: 'mcp__llama-cpp__llama_detokenize',
  COUNT_TOKENS: 'mcp__llama-cpp__llama_count_tokens',
  SIMILARITY: 'mcp__llama-cpp__llama_similarity',
  GRAMMAR: 'mcp__llama-cpp__llama_grammar',
  INFO: 'mcp__llama-cpp__llama_info',
  RESET: 'mcp__llama-cpp__llama_reset'
};

/**
 * Maps short tool names to full MCP tool names
 * @type {Object<string, string>}
 */
const TOOL_NAME_MAP = {
  'llama_generate': MCP_TOOLS.GENERATE,
  'llama_generate_fast': MCP_TOOLS.GENERATE_FAST,
  'llama_chat': MCP_TOOLS.CHAT,
  'llama_json': MCP_TOOLS.JSON,
  'llama_code': MCP_TOOLS.CODE,
  'llama_analyze': MCP_TOOLS.ANALYZE,
  'llama_embed': MCP_TOOLS.EMBED,
  'llama_vision': MCP_TOOLS.VISION,
  'llama_function_call': MCP_TOOLS.FUNCTION_CALL,
  'llama_tokenize': MCP_TOOLS.TOKENIZE,
  'llama_detokenize': MCP_TOOLS.DETOKENIZE,
  'llama_count_tokens': MCP_TOOLS.COUNT_TOKENS,
  'llama_similarity': MCP_TOOLS.SIMILARITY,
  'llama_grammar': MCP_TOOLS.GRAMMAR,
  'llama_info': MCP_TOOLS.INFO,
  'llama_reset': MCP_TOOLS.RESET
};

// =============================================================================
// LlamaCppBridge Class
// =============================================================================

/**
 * Bridge class for llama-cpp MCP tools
 * Provides unified interface for all llama-cpp operations
 */
export class LlamaCppBridge {
  /**
   * Create a new LlamaCppBridge instance
   * @param {Object} config - Configuration options
   * @param {Function} [config.mcpInvoker] - Custom MCP tool invoker function
   * @param {number} [config.defaultTimeout=120000] - Default timeout in ms
   */
  constructor(config = {}) {
    this.mcpInvoker = config.mcpInvoker || null;
    this.defaultTimeout = config.defaultTimeout || 120000;
    this._lastHealthCheck = null;
    this._healthCheckCache = null;
  }

  /**
   * Set the MCP invoker function
   * This should be called with the actual MCP tool invocation mechanism
   * @param {Function} invoker - Function that invokes MCP tools
   */
  setMcpInvoker(invoker) {
    this.mcpInvoker = invoker;
  }

  /**
   * Get full MCP tool name from short name
   * @param {string} shortName - Short tool name (e.g., 'llama_generate')
   * @returns {string} Full MCP tool name
   */
  getFullToolName(shortName) {
    return TOOL_NAME_MAP[shortName] || shortName;
  }

  /**
   * Call an MCP tool by name
   * @param {string} toolName - Tool name (short or full)
   * @param {Object} params - Tool parameters
   * @returns {Promise<Object>} Tool result
   * @throws {Error} If MCP invoker not set or tool call fails
   */
  async callTool(toolName, params = {}) {
    if (!this.mcpInvoker) {
      throw new Error('MCP invoker not set. Call setMcpInvoker() first.');
    }

    const fullName = this.getFullToolName(toolName);
    const startTime = Date.now();

    try {
      const result = await this.mcpInvoker(fullName, params);
      return {
        ...result,
        duration_ms: Date.now() - startTime,
        tool: fullName
      };
    } catch (error) {
      error.tool = fullName;
      error.duration_ms = Date.now() - startTime;
      throw error;
    }
  }

  // ===========================================================================
  // Generation Methods
  // ===========================================================================

  /**
   * Generate text using llama_generate
   * @param {string} prompt - Input prompt
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Generation result
   */
  async generate(prompt, options = {}) {
    const {
      maxTokens = 2048,
      temperature = 0.7,
      topK = 40,
      topP = 0.9,
      stop = []
    } = options;

    const result = await this.callTool('llama_generate', {
      prompt,
      max_tokens: maxTokens,
      temperature,
      top_k: topK,
      top_p: topP,
      stop
    });

    return this._normalizeResult(result, 'generate');
  }

  /**
   * Generate text using fast speculative decoding
   * @param {string} prompt - Input prompt
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Generation result
   */
  async generateFast(prompt, options = {}) {
    const {
      maxTokens = 512,
      temperature = 0.3,
      topP = 0.9
    } = options;

    const result = await this.callTool('llama_generate_fast', {
      prompt,
      max_tokens: maxTokens,
      temperature,
      top_p: topP
    });

    return this._normalizeResult(result, 'generate_fast');
  }

  /**
   * Chat with history
   * @param {Array<Object>} messages - Chat messages [{role, content}]
   * @param {Object} options - Chat options
   * @returns {Promise<Object>} Chat result
   */
  async chat(messages, options = {}) {
    const {
      maxTokens = 2048,
      temperature = 0.7
    } = options;

    const result = await this.callTool('llama_chat', {
      messages,
      max_tokens: maxTokens,
      temperature
    });

    return this._normalizeResult(result, 'chat');
  }

  // ===========================================================================
  // Specialized Methods
  // ===========================================================================

  /**
   * Generate or analyze code
   * @param {string} task - Task type (generate, explain, refactor, document, review, fix)
   * @param {Object} params - Task parameters
   * @returns {Promise<Object>} Code result
   */
  async code(task, params = {}) {
    const {
      code = '',
      description = '',
      language = 'javascript'
    } = params;

    const result = await this.callTool('llama_code', {
      task,
      code,
      description,
      language
    });

    return this._normalizeResult(result, 'code');
  }

  /**
   * Generate structured JSON output
   * @param {string} prompt - Input prompt
   * @param {Object} schema - JSON schema for output
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} JSON result
   */
  async json(prompt, schema, options = {}) {
    const { maxTokens = 2048 } = options;

    const result = await this.callTool('llama_json', {
      prompt,
      schema,
      max_tokens: maxTokens
    });

    return this._normalizeResult(result, 'json');
  }

  /**
   * Analyze text (sentiment, summary, keywords, etc.)
   * @param {string} text - Text to analyze
   * @param {string} task - Analysis task
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Analysis result
   */
  async analyze(text, task, options = {}) {
    const {
      categories = [],
      targetLanguage = 'en'
    } = options;

    const result = await this.callTool('llama_analyze', {
      text,
      task,
      categories,
      target_language: targetLanguage
    });

    return this._normalizeResult(result, 'analyze');
  }

  /**
   * Generate embeddings
   * @param {string|string[]} text - Text(s) to embed
   * @returns {Promise<Object>} Embedding result
   */
  async embed(text) {
    const params = Array.isArray(text)
      ? { texts: text }
      : { text };

    const result = await this.callTool('llama_embed', params);
    return this._normalizeResult(result, 'embed');
  }

  /**
   * Analyze image
   * @param {string} image - Image path or base64
   * @param {string} prompt - Question about the image
   * @param {Object} options - Vision options
   * @returns {Promise<Object>} Vision result
   */
  async vision(image, prompt, options = {}) {
    const { maxTokens = 1024 } = options;

    const result = await this.callTool('llama_vision', {
      image,
      prompt,
      max_tokens: maxTokens
    });

    return this._normalizeResult(result, 'vision');
  }

  /**
   * Execute function call
   * @param {Array<Object>} messages - Conversation messages
   * @param {Array<Object>} tools - Available tools
   * @param {Object} options - Function call options
   * @returns {Promise<Object>} Function call result
   */
  async functionCall(messages, tools, options = {}) {
    const {
      maxTokens = 2048,
      toolChoice = 'auto'
    } = options;

    const result = await this.callTool('llama_function_call', {
      messages,
      tools,
      max_tokens: maxTokens,
      tool_choice: toolChoice
    });

    return this._normalizeResult(result, 'function_call');
  }

  /**
   * Generate with grammar constraints
   * @param {string} prompt - Input prompt
   * @param {Object} options - Grammar options
   * @returns {Promise<Object>} Grammar-constrained result
   */
  async grammar(prompt, options = {}) {
    const {
      grammar = null,
      jsonSchema = null,
      maxTokens = 2048,
      temperature = 0.7
    } = options;

    const result = await this.callTool('llama_grammar', {
      prompt,
      grammar,
      json_schema: jsonSchema,
      max_tokens: maxTokens,
      temperature
    });

    return this._normalizeResult(result, 'grammar');
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Calculate semantic similarity
   * @param {string} text1 - First text
   * @param {string} text2 - Second text
   * @returns {Promise<Object>} Similarity result
   */
  async similarity(text1, text2) {
    const result = await this.callTool('llama_similarity', {
      text1,
      text2
    });
    return this._normalizeResult(result, 'similarity');
  }

  /**
   * Tokenize text
   * @param {string} text - Text to tokenize
   * @param {boolean} returnTokens - Whether to return token IDs
   * @returns {Promise<Object>} Tokenization result
   */
  async tokenize(text, returnTokens = false) {
    const result = await this.callTool('llama_tokenize', {
      text,
      return_tokens: returnTokens
    });
    return this._normalizeResult(result, 'tokenize');
  }

  /**
   * Count tokens in text
   * @param {string} text - Text to count
   * @returns {Promise<Object>} Token count result
   */
  async countTokens(text) {
    const result = await this.callTool('llama_count_tokens', { text });
    return this._normalizeResult(result, 'count_tokens');
  }

  /**
   * Get model information
   * @returns {Promise<Object>} Model info
   */
  async getInfo() {
    const result = await this.callTool('llama_info', {});
    this._healthCheckCache = {
      ...result,
      checkedAt: new Date()
    };
    return this._normalizeResult(result, 'info');
  }

  /**
   * Reset model state
   * @returns {Promise<Object>} Reset result
   */
  async reset() {
    const result = await this.callTool('llama_reset', {});
    return this._normalizeResult(result, 'reset');
  }

  // ===========================================================================
  // Health Check
  // ===========================================================================

  /**
   * Check if llama-cpp MCP is available
   * @param {boolean} forceRefresh - Force fresh check
   * @returns {Promise<Object>} Health check result
   */
  async healthCheck(forceRefresh = false) {
    // Return cached result if available and not forcing refresh
    if (!forceRefresh && this._healthCheckCache) {
      const cacheAge = Date.now() - this._healthCheckCache.checkedAt.getTime();
      if (cacheAge < 30000) { // 30 second cache
        return {
          available: true,
          ...this._healthCheckCache
        };
      }
    }

    try {
      const info = await this.getInfo();
      return {
        available: true,
        models: Object.keys(GGUF_MODELS),
        ...info,
        checkedAt: new Date()
      };
    } catch (error) {
      return {
        available: false,
        error: error.message,
        checkedAt: new Date()
      };
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Normalize tool result to ProviderResult format
   * @param {Object} result - Raw tool result
   * @param {string} operation - Operation name
   * @returns {Object} Normalized result
   * @private
   */
  _normalizeResult(result, operation) {
    // Handle different result formats from MCP tools
    const content = result.content || result.response || result.text || result.result || '';
    const tokens = result.tokens || result.token_count || 0;

    return {
      content: typeof content === 'string' ? content : JSON.stringify(content),
      model: result.model || 'llama-cpp',
      duration_ms: result.duration_ms || 0,
      tokens,
      success: true,
      operation,
      raw: result
    };
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let _bridgeInstance = null;

/**
 * Get or create LlamaCppBridge singleton
 * @param {Object} config - Configuration options
 * @returns {LlamaCppBridge} Bridge instance
 */
export function getLlamaCppBridge(config = {}) {
  if (!_bridgeInstance) {
    _bridgeInstance = new LlamaCppBridge(config);
  }
  return _bridgeInstance;
}

/**
 * Reset bridge singleton (for testing)
 */
export function resetLlamaCppBridge() {
  _bridgeInstance = null;
}

// =============================================================================
// Default Export
// =============================================================================

export default {
  LlamaCppBridge,
  getLlamaCppBridge,
  resetLlamaCppBridge,
  MCP_TOOLS
};
