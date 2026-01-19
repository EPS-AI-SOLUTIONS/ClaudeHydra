/**
 * @fileoverview Ollama Client - Local LLM Provider
 * Provides interface to local Ollama server for AI text generation
 *
 * @description
 * This module enables communication with a local Ollama server,
 * providing fast, free AI generation with cost = $0.
 * Typical latency: ~200-500ms for most operations.
 *
 * @module hydra/providers/ollama-client
 */

/**
 * Base URL for Ollama API
 * Can be overridden via OLLAMA_URL environment variable
 * @type {string}
 * @constant
 */
const OLLAMA_BASE_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

/**
 * @typedef {Object} ModelRole
 * @property {string} role - Model specialization role
 * @property {number} maxTokens - Maximum tokens for this model
 * @property {string} speed - Speed classification (fastest, fast, medium)
 */

/**
 * Model specialization map
 * Defines roles and characteristics for each model
 * @type {Object<string, ModelRole>}
 * @constant
 */
const MODEL_ROLES = {
  'llama3.2:1b': { role: 'router', maxTokens: 512, speed: 'fastest' },
  'llama3.2:3b': { role: 'researcher', maxTokens: 2048, speed: 'fast' },
  'qwen2.5-coder:1.5b': { role: 'coder', maxTokens: 4096, speed: 'fast' },
  'phi3:mini': { role: 'reasoner', maxTokens: 2048, speed: 'medium' }
};

/**
 * @typedef {Object} GenerateOptions
 * @property {string} [model='llama3.2:3b'] - Model to use for generation
 * @property {boolean} [stream=false] - Enable response streaming
 * @property {number} [temperature=0.7] - Sampling temperature (0-1)
 * @property {number} [maxTokens=2048] - Maximum tokens to generate
 * @property {number} [timeout=120000] - Request timeout in milliseconds
 */

/**
 * @typedef {Object} GenerateResult
 * @property {string} content - Generated text content
 * @property {string} model - Model used for generation
 * @property {number} duration_ms - Request duration in milliseconds
 * @property {number} tokens - Number of tokens generated
 */

/**
 * @typedef {Object} HealthCheckResult
 * @property {boolean} available - Whether Ollama server is available
 * @property {string[]} models - List of available model names
 */

/**
 * Generate completion from Ollama
 *
 * @param {string} prompt - The prompt to send to Ollama
 * @param {GenerateOptions} [options={}] - Generation options
 * @returns {Promise<GenerateResult>} Generated content with metadata
 * @throws {Error} If request fails or times out
 *
 * @example
 * const result = await generate('What is 2+2?');
 * console.log(result.content); // '4'
 *
 * @example
 * // With custom options
 * const result = await generate('Write a poem', {
 *   model: 'llama3.2:3b',
 *   temperature: 0.9,
 *   maxTokens: 500
 * });
 */
export async function generate(prompt, options = {}) {
  const {
    model = 'llama3.2:3b',
    stream = false,
    temperature = 0.7,
    maxTokens = 2048,
    timeout = 120000  // Increased to 2 minutes for complex tasks
  } = options;

  const startTime = Date.now();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream,
        options: {
          temperature,
          num_predict: maxTokens
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return {
      content: data.response,
      model,
      duration_ms: Date.now() - startTime,
      tokens: data.eval_count || 0
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      throw new Error(`Ollama timeout after ${timeout}ms`);
    }
    throw error;
  }
}

/**
 * Stream completion from Ollama
 * Returns an async generator that yields content chunks
 *
 * @param {string} prompt - The prompt to send
 * @param {GenerateOptions} [options={}] - Generation options
 * @yields {string} Content chunks as they are generated
 *
 * @example
 * for await (const chunk of streamGenerate('Tell me a story')) {
 *   process.stdout.write(chunk);
 * }
 */
export async function* streamGenerate(prompt, options = {}) {
  const { model = 'llama3.2:3b', temperature = 0.7 } = options;

  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: true,
      options: { temperature }
    })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter(Boolean);

    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        if (data.response) {
          yield data.response;
        }
      } catch {
        // Skip invalid JSON lines
      }
    }
  }
}

/**
 * Check if Ollama server is available
 * Also retrieves list of available models
 *
 * @returns {Promise<HealthCheckResult>} Health check result
 *
 * @example
 * const health = await healthCheck();
 * if (health.available) {
 *   console.log('Available models:', health.models.join(', '));
 * }
 */
export async function healthCheck() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      return { available: false, models: [] };
    }

    const data = await response.json();
    const models = data.models?.map(m => m.name) || [];

    return { available: true, models };
  } catch {
    return { available: false, models: [] };
  }
}

/**
 * Select optimal model for a specific task type
 *
 * @param {string} taskType - Type of task (route, research, code, reason)
 * @returns {string} Recommended model name
 *
 * @example
 * const model = selectModel('code');
 * console.log(model); // 'qwen2.5-coder:1.5b'
 *
 * @example
 * const model = selectModel('route');
 * console.log(model); // 'llama3.2:1b' (fastest for simple routing)
 */
export function selectModel(taskType) {
  /**
   * Task type to model mapping
   * @type {Object<string, string>}
   */
  const modelMap = {
    route: 'llama3.2:1b',      // Fastest for simple routing
    research: 'llama3.2:3b',   // Good for context gathering
    code: 'qwen2.5-coder:1.5b', // Specialized for code
    reason: 'phi3:mini',        // Best for logical reasoning
    default: 'llama3.2:3b'
  };

  return modelMap[taskType] || modelMap.default;
}

/**
 * Get model role configuration
 *
 * @param {string} modelName - Name of the model
 * @returns {ModelRole|undefined} Model role configuration or undefined
 *
 * @example
 * const role = getModelRole('llama3.2:1b');
 * console.log(role.speed); // 'fastest'
 */
export function getModelRole(modelName) {
  return MODEL_ROLES[modelName];
}

/**
 * Get all available model roles
 *
 * @returns {Object<string, ModelRole>} All model roles
 */
export function getModelRoles() {
  return { ...MODEL_ROLES };
}

/**
 * Get the Ollama base URL
 *
 * @returns {string} Base URL for Ollama API
 */
export function getBaseUrl() {
  return OLLAMA_BASE_URL;
}

// Named exports for constants (for backward compatibility)
export { MODEL_ROLES, OLLAMA_BASE_URL };

// Default export as module object
export default {
  generate,
  streamGenerate,
  healthCheck,
  selectModel,
  getModelRole,
  getModelRoles,
  getBaseUrl,
  MODEL_ROLES,
  OLLAMA_BASE_URL
};
