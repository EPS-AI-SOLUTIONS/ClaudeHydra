#!/usr/bin/env node
/**
 * HYDRA 10.6.1 - Ollama Stream Handler
 *
 * Streaming handler for local Ollama models with SSE-like support.
 * Interface consistent with GeminiStreamHandler and CodexStreamHandler.
 *
 * Features:
 * - Class-based OllamaStreamHandler with stream/abort interface
 * - Health check integration
 * - Model management (list, pull, delete)
 * - Token streaming with callbacks
 * - Retry logic with exponential backoff
 * - Backward-compatible legacy functions
 *
 * @module ollama-handler
 * @version 2.0.0
 */

import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES Module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_CONFIG = {
  host: process.env.OLLAMA_HOST || 'http://localhost:11434',
  model: process.env.DEFAULT_MODEL || 'llama3.2:3b',
  fastModel: process.env.FAST_MODEL || 'llama3.2:1b',
  coderModel: process.env.CODER_MODEL || 'qwen2.5-coder:1.5b',
  timeout: 120000,            // 120 seconds
  maxRetries: 3,
  retryDelayBase: 1000,       // 1 second
  retryDelayMax: 30000,       // 30 seconds
  temperature: 0.7,
  numPredict: 2048,           // max tokens
  contextSize: 4096
};

// Task-specific model mapping
const TASK_MODELS = {
  chat: 'default',
  query: 'default',
  analyze: 'default',
  summarize: 'fast',
  code: 'coder',
  memory: 'fast',
  batch: 'fast'
};

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Ollama-specific API error
 */
export class OllamaError extends Error {
  /**
   * @param {string} message - Error message
   * @param {string} code - Error code
   * @param {number} statusCode - HTTP status code
   * @param {Object} details - Additional details
   */
  constructor(message, code = 'OLLAMA_ERROR', statusCode = 0, details = {}) {
    super(message);
    this.name = 'OllamaError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp
    };
  }
}

/**
 * Error codes for Ollama operations
 */
export const ErrorCodes = {
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',
  GENERATION_FAILED: 'GENERATION_FAILED',
  TIMEOUT: 'TIMEOUT',
  ABORTED: 'ABORTED',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  PULL_FAILED: 'PULL_FAILED'
};

// ============================================================================
// OllamaStreamHandler Class
// ============================================================================

/**
 * Ollama Stream Handler - Streaming support for local Ollama models
 *
 * Provides a consistent interface matching GeminiStreamHandler and CodexStreamHandler.
 */
export class OllamaStreamHandler {
  /**
   * Create a new OllamaStreamHandler
   * @param {Object} config - Configuration options
   * @param {string} [config.host] - Ollama server URL
   * @param {string} [config.model] - Default model name
   * @param {string} [config.fastModel] - Fast model for quick tasks
   * @param {string} [config.coderModel] - Model optimized for code
   * @param {number} [config.timeout] - Request timeout in ms
   * @param {number} [config.maxRetries] - Maximum retry attempts
   * @param {number} [config.temperature] - Sampling temperature
   * @param {number} [config.numPredict] - Maximum tokens to generate
   */
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Parse host URL
    this._parseHost();

    // Abort controller for cancellation
    this.abortController = null;
    this.isStreaming = false;

    // Current request reference (for abortion)
    this._currentRequest = null;

    // Statistics
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      abortedRequests: 0,
      retries: 0,
      totalTokens: 0,
      totalChunks: 0,
      totalDurationMs: 0
    };
  }

  /**
   * Parse host URL and extract components
   * @private
   */
  _parseHost() {
    try {
      const url = new URL(this.config.host);
      this._protocol = url.protocol === 'https:' ? https : http;
      this._hostname = url.hostname;
      this._port = url.port || (url.protocol === 'https:' ? 443 : 11434);
    } catch (error) {
      // Fallback for malformed URLs
      this._protocol = http;
      this._hostname = 'localhost';
      this._port = 11434;
    }
  }

  /**
   * Get model name based on task type
   * @param {string} task - Task type (chat, code, summarize, etc.)
   * @returns {string} Model name
   */
  getModelForTask(task) {
    const modelType = TASK_MODELS[task] || 'default';
    switch (modelType) {
      case 'fast':
        return this.config.fastModel;
      case 'coder':
        return this.config.coderModel;
      default:
        return this.config.model;
    }
  }

  /**
   * Make HTTP request to Ollama API
   * @private
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request body
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Response data
   */
  async _request(endpoint, data = null, options = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, this.config.host);
      const postData = data ? JSON.stringify(data) : null;
      const isStream = data?.stream !== false;

      const requestOptions = {
        hostname: this._hostname,
        port: this._port,
        path: url.pathname,
        method: data ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(postData && { 'Content-Length': Buffer.byteLength(postData) })
        },
        timeout: options.timeout || this.config.timeout
      };

      const req = this._protocol.request(requestOptions, (res) => {
        let responseData = '';
        let fullResponse = '';

        res.on('data', (chunk) => {
          responseData += chunk;

          // Stream mode - process each line
          if (isStream && options.onToken) {
            const lines = responseData.split('\n');
            for (let i = 0; i < lines.length - 1; i++) {
              try {
                const json = JSON.parse(lines[i]);
                if (json.response) {
                  fullResponse += json.response;
                  options.onToken(json.response, {
                    accumulated: fullResponse,
                    done: json.done || false
                  });
                }
              } catch (e) {
                // Ignore parse errors for incomplete lines
              }
            }
            responseData = lines[lines.length - 1];
          }
        });

        res.on('end', () => {
          try {
            if (isStream) {
              // Process remaining buffer
              const lines = responseData.split('\n').filter(l => l.trim());
              for (const line of lines) {
                try {
                  const json = JSON.parse(line);
                  if (json.response) fullResponse += json.response;
                  if (json.done) {
                    resolve({
                      response: fullResponse,
                      model: json.model,
                      totalDuration: json.total_duration,
                      evalCount: json.eval_count,
                      promptEvalCount: json.prompt_eval_count
                    });
                    return;
                  }
                } catch (e) {
                  // Ignore
                }
              }
              resolve({ response: fullResponse });
            } else {
              resolve(JSON.parse(responseData));
            }
          } catch (e) {
            resolve({ response: responseData });
          }
        });
      });

      // Store request reference for abortion
      this._currentRequest = req;

      req.on('error', (error) => {
        if (error.code === 'ECONNREFUSED') {
          reject(new OllamaError(
            'Cannot connect to Ollama server',
            ErrorCodes.CONNECTION_FAILED,
            0,
            { host: this.config.host }
          ));
        } else {
          reject(new OllamaError(error.message, ErrorCodes.GENERATION_FAILED, 0));
        }
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new OllamaError(
          `Request timeout after ${this.config.timeout}ms`,
          ErrorCodes.TIMEOUT,
          0
        ));
      });

      if (postData) {
        req.write(postData);
      }
      req.end();
    });
  }

  /**
   * Stream a completion from Ollama
   * @param {string} prompt - The user prompt
   * @param {Object} callbacks - Callback functions
   * @param {Function} [callbacks.onChunk] - Called for each token/chunk
   * @param {Function} [callbacks.onComplete] - Called when streaming completes
   * @param {Function} [callbacks.onError] - Called on error
   * @param {Function} [callbacks.onStart] - Called when stream starts
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} Complete response with metadata
   */
  async stream(prompt, callbacks = {}, options = {}) {
    const {
      onChunk = () => {},
      onComplete = () => {},
      onError = () => {},
      onStart = () => {}
    } = callbacks;

    const model = options.model || this.config.model;
    const startTime = Date.now();

    this.isStreaming = true;
    this.stats.totalRequests++;

    // Result accumulator
    const result = {
      text: '',
      chunks: [],
      model,
      evalCount: 0,
      totalDuration: 0,
      aborted: false
    };

    try {
      // Notify stream start
      onStart({ model, timestamp: new Date().toISOString() });

      const response = await this._request('/api/generate', {
        model,
        prompt,
        stream: true,
        options: {
          temperature: options.temperature ?? this.config.temperature,
          num_predict: options.maxTokens ?? this.config.numPredict,
          num_ctx: options.contextSize ?? this.config.contextSize
        }
      }, {
        timeout: options.timeout || this.config.timeout,
        onToken: (token, meta) => {
          result.text = meta.accumulated;
          result.chunks.push({
            text: token,
            timestamp: Date.now()
          });
          this.stats.totalChunks++;

          // Call chunk callback
          onChunk(token, {
            accumulated: meta.accumulated,
            chunkIndex: result.chunks.length - 1,
            done: meta.done
          });
        }
      });

      // Update result with final metadata
      result.text = response.response;
      result.evalCount = response.evalCount || result.chunks.length;
      result.totalDuration = response.totalDuration || (Date.now() - startTime) * 1000000;
      result.durationMs = Date.now() - startTime;

      this.stats.successfulRequests++;
      this.stats.totalTokens += result.evalCount;
      this.stats.totalDurationMs += result.durationMs;
      this.isStreaming = false;

      // Call complete callback
      onComplete(result);

      return result;

    } catch (error) {
      this.isStreaming = false;

      if (error.code === ErrorCodes.ABORTED) {
        this.stats.abortedRequests++;
        result.aborted = true;
        result.error = 'Stream was aborted';
        onComplete(result);
        return result;
      }

      this.stats.failedRequests++;
      onError(error);
      throw error;
    }
  }

  /**
   * Generate with automatic retry on failure
   * @param {string} prompt - User prompt
   * @param {Object} callbacks - Callback functions
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Complete response
   */
  async generateWithRetry(prompt, callbacks = {}, options = {}) {
    const maxRetries = options.maxRetries ?? this.config.maxRetries;
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.stream(prompt, callbacks, { ...options, attempt });
      } catch (error) {
        lastError = error;

        // Check if retryable
        const isRetryable = error.code !== ErrorCodes.MODEL_NOT_FOUND &&
                           error.code !== ErrorCodes.ABORTED;

        if (!isRetryable || attempt >= maxRetries) {
          throw error;
        }

        // Calculate retry delay with exponential backoff
        const delay = Math.min(
          this.config.retryDelayBase * Math.pow(2, attempt),
          this.config.retryDelayMax
        );

        this.stats.retries++;

        // Notify retry callback
        if (callbacks.onRetry) {
          callbacks.onRetry({
            attempt: attempt + 1,
            maxRetries,
            delay,
            error
          });
        }

        await this._sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Abort the current streaming request
   * @returns {boolean} True if aborted, false if no active stream
   */
  abort() {
    if (!this.isStreaming) {
      return false;
    }

    if (this._currentRequest) {
      this._currentRequest.destroy();
      this._currentRequest = null;
    }

    this.isStreaming = false;
    return true;
  }

  /**
   * Check if currently streaming
   * @returns {boolean}
   */
  isActive() {
    return this.isStreaming;
  }

  /**
   * Health check - verify Ollama is running and responsive
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    const startTime = Date.now();

    try {
      const models = await this.getModels();
      const latency = Date.now() - startTime;

      return {
        status: 'healthy',
        host: this.config.host,
        latencyMs: latency,
        modelsAvailable: models.length,
        models: models.map(m => m.name),
        defaultModel: this.config.model,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        host: this.config.host,
        error: error.message,
        code: error.code || 'UNKNOWN',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get available models from Ollama
   * @returns {Promise<Array>} List of available models
   */
  async getModels() {
    try {
      const response = await this._request('/api/tags', null, {
        timeout: 10000
      });
      return response.models || [];
    } catch (error) {
      if (error.code === ErrorCodes.CONNECTION_FAILED) {
        throw error;
      }
      throw new OllamaError(
        'Failed to get models list',
        ErrorCodes.INVALID_RESPONSE,
        0,
        { originalError: error.message }
      );
    }
  }

  /**
   * Pull (download) a model from Ollama registry
   * @param {string} modelName - Model name to pull
   * @param {Object} callbacks - Progress callbacks
   * @returns {Promise<Object>} Pull result
   */
  async pullModel(modelName, callbacks = {}) {
    const { onProgress = () => {}, onComplete = () => {}, onError = () => {} } = callbacks;

    try {
      const response = await this._request('/api/pull', {
        name: modelName,
        stream: true
      }, {
        timeout: 600000, // 10 minutes for large models
        onToken: (data) => {
          try {
            // Parse pull progress
            if (data.includes('status')) {
              onProgress(data);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      });

      const result = {
        success: true,
        model: modelName,
        message: 'Model pulled successfully'
      };

      onComplete(result);
      return result;

    } catch (error) {
      const ollamaError = new OllamaError(
        `Failed to pull model: ${modelName}`,
        ErrorCodes.PULL_FAILED,
        0,
        { model: modelName, originalError: error.message }
      );
      onError(ollamaError);
      throw ollamaError;
    }
  }

  /**
   * Delete a model from Ollama
   * @param {string} modelName - Model name to delete
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteModel(modelName) {
    try {
      await this._request('/api/delete', { name: modelName });
      return true;
    } catch (error) {
      throw new OllamaError(
        `Failed to delete model: ${modelName}`,
        ErrorCodes.MODEL_NOT_FOUND,
        0,
        { model: modelName }
      );
    }
  }

  /**
   * Get model information
   * @param {string} modelName - Model name
   * @returns {Promise<Object>} Model information
   */
  async getModelInfo(modelName) {
    try {
      return await this._request('/api/show', { name: modelName });
    } catch (error) {
      throw new OllamaError(
        `Model not found: ${modelName}`,
        ErrorCodes.MODEL_NOT_FOUND,
        404,
        { model: modelName }
      );
    }
  }

  /**
   * Update configuration
   * @param {Object} config - New configuration values
   * @returns {OllamaStreamHandler} this for chaining
   */
  configure(config) {
    this.config = { ...this.config, ...config };
    this._parseHost();
    return this;
  }

  /**
   * Set default model
   * @param {string} model - Model name
   * @returns {OllamaStreamHandler} this for chaining
   */
  setModel(model) {
    this.config.model = model;
    return this;
  }

  /**
   * Get handler statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalRequests > 0
        ? ((this.stats.successfulRequests / this.stats.totalRequests) * 100).toFixed(2) + '%'
        : '0%',
      averageLatencyMs: this.stats.successfulRequests > 0
        ? Math.round(this.stats.totalDurationMs / this.stats.successfulRequests)
        : 0,
      averageTokensPerRequest: this.stats.successfulRequests > 0
        ? Math.round(this.stats.totalTokens / this.stats.successfulRequests)
        : 0
    };
  }

  /**
   * Reset statistics
   * @returns {OllamaStreamHandler} this for chaining
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      abortedRequests: 0,
      retries: 0,
      totalTokens: 0,
      totalChunks: 0,
      totalDurationMs: 0
    };
    return this;
  }

  /**
   * Sleep utility
   * @private
   * @param {number} ms - Milliseconds to sleep
   */
  async _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a pre-configured OllamaStreamHandler instance
 * @param {Object} config - Configuration options
 * @returns {OllamaStreamHandler}
 */
export function createOllamaHandler(config = {}) {
  return new OllamaStreamHandler(config);
}

/**
 * Default singleton instance
 */
let defaultHandler = null;

/**
 * Get or create default Ollama handler
 * @param {Object} config - Configuration (only used on first call)
 * @returns {OllamaStreamHandler}
 */
export function getDefaultHandler(config = {}) {
  if (!defaultHandler) {
    defaultHandler = new OllamaStreamHandler(config);
  }
  return defaultHandler;
}

// ============================================================================
// Legacy Compatible Functions (Backward Compatibility)
// ============================================================================

// Re-export config constants for backward compatibility
export const OLLAMA_HOST = DEFAULT_CONFIG.host;
export const DEFAULT_MODEL = DEFAULT_CONFIG.model;
export const FAST_MODEL = DEFAULT_CONFIG.fastModel;
export const CODER_MODEL = DEFAULT_CONFIG.coderModel;
export { TASK_MODELS };

/**
 * Check if Ollama is running (legacy)
 * @returns {Promise<boolean>}
 */
export async function isRunning() {
  try {
    const handler = getDefaultHandler();
    await handler.getModels();
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Get available models (legacy)
 * @returns {Promise<Array>}
 */
export async function getModels() {
  const handler = getDefaultHandler();
  return handler.getModels();
}

/**
 * Basic query (legacy)
 * @param {string} prompt - User prompt
 * @param {Object} options - Options
 * @returns {Promise<Object>}
 */
export async function query(prompt, options = {}) {
  const handler = getDefaultHandler();
  const task = options.task || 'query';
  const model = options.model || handler.getModelForTask(task);

  return handler.stream(prompt, {
    onChunk: options.onToken
  }, {
    model,
    temperature: options.temperature,
    maxTokens: options.maxTokens
  });
}

/**
 * Analyze content (legacy)
 * @param {string} content - Content to analyze
 * @param {string} type - Analysis type
 * @param {Object} options - Options
 * @returns {Promise<Object>}
 */
export async function analyze(content, type = 'code', options = {}) {
  const prompts = {
    code: `Analyze this code. Identify: 1) Purpose, 2) Key functions, 3) Potential issues, 4) Improvements.\n\nCode:\n${content}`,
    text: `Analyze this text. Summarize key points and provide insights.\n\nText:\n${content}`,
    error: `Analyze this error. Explain: 1) What caused it, 2) How to fix it.\n\nError:\n${content}`,
    security: `Security audit of this code. Find vulnerabilities and suggest fixes.\n\nCode:\n${content}`
  };

  return query(prompts[type] || prompts.code, {
    model: options.model,
    task: 'analyze',
    ...options
  });
}

/**
 * Summarize content (legacy)
 * @param {string} content - Content to summarize
 * @param {Object} options - Options
 * @returns {Promise<Object>}
 */
export async function summarize(content, options = {}) {
  const prompt = `Summarize this in ${options.sentences || 3} sentences. Be concise.\n\n${content}`;
  return query(prompt, {
    task: 'summarize',
    maxTokens: options.maxTokens || 500,
    ...options
  });
}

/**
 * Generate code (legacy)
 * @param {string} description - Code description
 * @param {string} language - Programming language
 * @param {Object} options - Options
 * @returns {Promise<Object>}
 */
export async function generateCode(description, language = 'javascript', options = {}) {
  const prompt = `Generate ${language} code for: ${description}\n\nProvide only the code, no explanations. Use best practices.`;
  return query(prompt, {
    task: 'code',
    temperature: 0.3,
    ...options
  });
}

/**
 * Process memory (legacy)
 * @param {string} memoryContent - Memory content
 * @param {string} action - Action type
 * @param {Object} options - Options
 * @returns {Promise<Object>}
 */
export async function processMemory(memoryContent, action = 'summarize', options = {}) {
  const prompts = {
    summarize: `Summarize this memory file. Extract key facts in bullet points.\n\n${memoryContent}`,
    extract: `Extract key technical details from this memory:\n\n${memoryContent}`,
    update: `Given this memory content, what should be updated or added?\n\n${memoryContent}`,
    query: `Based on this memory, answer: ${options.question}\n\nMemory:\n${memoryContent}`
  };

  return query(prompts[action] || prompts.summarize, {
    task: 'memory',
    ...options
  });
}

/**
 * Batch queries (legacy)
 * @param {Array} queries - Array of query strings
 * @param {Object} options - Options
 * @returns {Promise<Array>}
 */
export async function batch(queries, options = {}) {
  const concurrency = options.concurrency || 2;
  const results = [];

  for (let i = 0; i < queries.length; i += concurrency) {
    const chunk = queries.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(q => query(q, { task: 'batch', ...options }))
    );
    results.push(...chunkResults);
  }

  return results;
}

/**
 * Chat with context (legacy)
 * @param {Array} messages - Message history
 * @param {Object} options - Options
 * @returns {Promise<Object>}
 */
export async function chat(messages, options = {}) {
  let context = '';
  for (const msg of messages) {
    const role = msg.role === 'user' ? 'User' : 'Assistant';
    context += `${role}: ${msg.content}\n\n`;
  }

  const lastMessage = messages[messages.length - 1];
  if (lastMessage.role === 'user') {
    context += 'Assistant:';
  }

  return query(context, { task: 'chat', ...options });
}

/**
 * Execute function by name (legacy)
 * @param {string} functionName - Function name
 * @param {Object} args - Arguments
 * @returns {Promise<Object>}
 */
export async function execute(functionName, args = {}) {
  const handler = getDefaultHandler();

  switch (functionName) {
    case 'query':
    case 'ask':
      return query(args.prompt, args);

    case 'analyze':
      return analyze(args.content, args.type, args);

    case 'summarize':
      return summarize(args.content, args);

    case 'code':
    case 'generate':
      return generateCode(args.description, args.language, args);

    case 'memory':
      return processMemory(args.content, args.action, args);

    case 'batch':
      return batch(args.queries, args);

    case 'chat':
      return chat(args.messages, args);

    case 'models':
      return handler.getModels();

    case 'pull':
      return handler.pullModel(args.model || args.name, {
        onProgress: args.onProgress
      });

    case 'health':
      return handler.healthCheck();

    case 'status': {
      const running = await isRunning();
      const models = running ? await handler.getModels() : [];
      return {
        running,
        host: handler.config.host,
        models: models.map(m => m.name),
        defaultModel: handler.config.model,
        fastModel: handler.config.fastModel,
        coderModel: handler.config.coderModel,
        stats: handler.getStats()
      };
    }

    default:
      throw new Error(`Unknown function: ${functionName}`);
  }
}

// ============================================================================
// CLI Interface
// ============================================================================

/**
 * CLI main function
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'status';

  try {
    switch (command) {
      case 'status': {
        const status = await execute('status');
        console.log('\n' + '='.repeat(64));
        console.log('  OLLAMA STATUS');
        console.log('='.repeat(64));
        console.log(`  Running: ${status.running ? 'Yes' : 'No'}`);
        console.log(`  Host: ${status.host}`);
        console.log(`  Models: ${status.models.length}`);
        for (const model of status.models) {
          console.log(`    - ${model}`);
        }
        console.log('-'.repeat(64));
        console.log(`  Default: ${status.defaultModel}`);
        console.log(`  Fast:    ${status.fastModel}`);
        console.log(`  Coder:   ${status.coderModel}`);
        console.log('='.repeat(64) + '\n');
        break;
      }

      case 'health': {
        const health = await execute('health');
        console.log('\nHealth Check:', JSON.stringify(health, null, 2));
        break;
      }

      case 'query':
      case 'ask': {
        const prompt = args.slice(1).join(' ');
        if (!prompt) {
          console.log('Usage: ollama-handler.js query <prompt>');
          process.exit(1);
        }
        console.log('Querying Ollama...\n');
        const result = await query(prompt);
        console.log(result.text || result.response || result);
        console.log('\n');
        break;
      }

      case 'analyze': {
        const file = args[1];
        const type = args[2] || 'code';
        if (!file) {
          console.log('Usage: ollama-handler.js analyze <file> [type]');
          process.exit(1);
        }
        const content = fs.readFileSync(file, 'utf-8');
        console.log(`Analyzing ${file}...\n`);
        const result = await analyze(content, type);
        console.log(result.text || result.response || result);
        console.log('\n');
        break;
      }

      case 'summarize': {
        const input = args.slice(1).join(' ');
        if (!input) {
          console.log('Usage: ollama-handler.js summarize <text or file>');
          process.exit(1);
        }
        const content = fs.existsSync(input) ? fs.readFileSync(input, 'utf-8') : input;
        console.log('Summarizing...\n');
        const result = await summarize(content);
        console.log(result.text || result.response || result);
        console.log('\n');
        break;
      }

      case 'code': {
        const description = args.slice(1).join(' ');
        if (!description) {
          console.log('Usage: ollama-handler.js code <description>');
          process.exit(1);
        }
        console.log('Generating code...\n');
        const result = await generateCode(description, 'javascript');
        console.log(result.text || result.response || result);
        console.log('\n');
        break;
      }

      case 'pull': {
        const modelName = args[1];
        if (!modelName) {
          console.log('Usage: ollama-handler.js pull <model-name>');
          process.exit(1);
        }
        console.log(`Pulling model: ${modelName}...`);
        const handler = getDefaultHandler();
        await handler.pullModel(modelName, {
          onProgress: (data) => process.stdout.write('.'),
          onComplete: () => console.log('\nDone!')
        });
        break;
      }

      case 'models': {
        const models = await getModels();
        console.log('\nAvailable Ollama models:');
        for (const model of models) {
          const size = model.size ? (model.size / 1024 / 1024 / 1024).toFixed(2) : '?';
          console.log(`  - ${model.name} (${size} GB)`);
        }
        console.log('');
        break;
      }

      default:
        console.log(`
HYDRA Ollama Handler v2.0.0
===========================

Commands:
  status              Show Ollama status and models
  health              Run health check
  query <prompt>      Send query to Ollama
  analyze <file>      Analyze code file
  summarize <text>    Summarize text or file
  code <description>  Generate code
  pull <model>        Pull/download a model
  models              List available models

Environment:
  OLLAMA_HOST         Ollama server URL (default: http://localhost:11434)
  DEFAULT_MODEL       Default model (default: llama3.2:3b)
  FAST_MODEL          Fast model for quick tasks (default: llama3.2:1b)
  CODER_MODEL         Code generation model (default: qwen2.5-coder:1.5b)
`);
    }
  } catch (error) {
    console.error('Error:', error.message);
    if (error.details) {
      console.error('Details:', JSON.stringify(error.details, null, 2));
    }
    process.exit(1);
  }
}

// Run if called directly
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('ollama-handler.js') ||
  process.argv[1].includes('ollama-handler')
);

if (isMainModule) {
  main().catch(console.error);
}

// ============================================================================
// Default Export
// ============================================================================

export default OllamaStreamHandler;
