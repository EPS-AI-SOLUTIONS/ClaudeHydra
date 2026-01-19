/**
 * Gemini Stream Handler - Streaming support for Gemini API
 * Agent: Triss (Real-time Data)
 *
 * Features:
 * - Server-Sent Events (SSE) streaming
 * - Retry logic with exponential backoff
 * - Abort controller for cancellation
 * - Callbacks for chunk, complete, error events
 * - Token counting and usage tracking
 */

import { createLogger, generateCorrelationId, withCorrelationId } from './logger.js';
import { ApiError, TimeoutError, isRetryable, getRetryDelay } from './errors.js';

const logger = createLogger('gemini-handler');

/**
 * Default configuration for GeminiStreamHandler
 */
const DEFAULT_CONFIG = {
  apiKey: null,
  model: 'gemini-2.0-flash',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  timeout: 60000,           // 60 seconds
  maxRetries: 3,
  retryDelayBase: 1000,     // 1 second
  retryDelayMax: 30000,     // 30 seconds
  temperature: 0.7,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
  safetySettings: null,     // Use default safety settings
  systemInstruction: null
};

/**
 * Stream Event Types
 */
export const StreamEventType = {
  CHUNK: 'chunk',
  COMPLETE: 'complete',
  ERROR: 'error',
  ABORT: 'abort',
  RETRY: 'retry'
};

/**
 * Gemini Stream Handler class
 * Handles streaming responses from Gemini API using SSE
 */
export class GeminiStreamHandler {
  /**
   * @param {Object} config - Configuration options
   * @param {string} config.apiKey - Gemini API key (required)
   * @param {string} config.model - Model name (default: gemini-2.0-flash)
   * @param {string} config.baseUrl - API base URL
   * @param {number} config.timeout - Request timeout in ms
   * @param {number} config.maxRetries - Maximum retry attempts
   * @param {number} config.retryDelayBase - Base delay for exponential backoff
   * @param {number} config.retryDelayMax - Maximum retry delay
   * @param {number} config.temperature - Sampling temperature
   * @param {number} config.topP - Top-p sampling
   * @param {number} config.topK - Top-k sampling
   * @param {number} config.maxOutputTokens - Maximum output tokens
   * @param {Array} config.safetySettings - Safety settings array
   * @param {string} config.systemInstruction - System instruction
   */
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (!this.config.apiKey) {
      // Try environment variable
      this.config.apiKey = process.env.GEMINI_API_KEY;
    }

    // Abort controller for cancellation
    this.abortController = null;
    this.isStreaming = false;

    // Statistics
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      abortedRequests: 0,
      retries: 0,
      totalTokens: 0,
      totalChunks: 0
    };

    logger.info('GeminiStreamHandler initialized', {
      model: this.config.model,
      timeout: this.config.timeout
    });
  }

  /**
   * Build the streaming URL for Gemini API
   * @param {string} model - Model name
   * @returns {string} Full URL for streaming endpoint
   */
  _buildStreamUrl(model = null) {
    const modelName = model || this.config.model;
    return `${this.config.baseUrl}/models/${modelName}:streamGenerateContent?key=${this.config.apiKey}&alt=sse`;
  }

  /**
   * Build request body for Gemini API
   * @param {string|Array} prompt - User prompt (string or messages array)
   * @param {Object} options - Additional options
   * @returns {Object} Request body
   */
  _buildRequestBody(prompt, options = {}) {
    const body = {
      generationConfig: {
        temperature: options.temperature ?? this.config.temperature,
        topP: options.topP ?? this.config.topP,
        topK: options.topK ?? this.config.topK,
        maxOutputTokens: options.maxOutputTokens ?? this.config.maxOutputTokens
      }
    };

    // Handle prompt - can be string or array of messages
    if (typeof prompt === 'string') {
      body.contents = [{
        role: 'user',
        parts: [{ text: prompt }]
      }];
    } else if (Array.isArray(prompt)) {
      body.contents = prompt;
    } else {
      throw new Error('Prompt must be a string or array of messages');
    }

    // Add system instruction if provided
    const systemInstruction = options.systemInstruction || this.config.systemInstruction;
    if (systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    // Add safety settings if provided
    const safetySettings = options.safetySettings || this.config.safetySettings;
    if (safetySettings) {
      body.safetySettings = safetySettings;
    }

    return body;
  }

  /**
   * Parse SSE data line
   * @param {string} line - SSE data line
   * @returns {Object|null} Parsed data or null
   */
  _parseSSELine(line) {
    if (!line || !line.startsWith('data: ')) {
      return null;
    }

    const jsonStr = line.slice(6).trim();
    if (!jsonStr || jsonStr === '[DONE]') {
      return null;
    }

    try {
      return JSON.parse(jsonStr);
    } catch (error) {
      logger.warn('Failed to parse SSE line', { line, error: error.message });
      return null;
    }
  }

  /**
   * Extract text from Gemini response chunk
   * @param {Object} data - Parsed SSE data
   * @returns {Object} Extracted content and metadata
   */
  _extractContent(data) {
    const result = {
      text: '',
      finishReason: null,
      safetyRatings: null,
      usageMetadata: null
    };

    if (!data) return result;

    // Extract text from candidates
    if (data.candidates && data.candidates.length > 0) {
      const candidate = data.candidates[0];

      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          if (part.text) {
            result.text += part.text;
          }
        }
      }

      result.finishReason = candidate.finishReason || null;
      result.safetyRatings = candidate.safetyRatings || null;
    }

    // Extract usage metadata
    if (data.usageMetadata) {
      result.usageMetadata = data.usageMetadata;
    }

    return result;
  }

  /**
   * Sleep utility for retry delays
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  async _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Stream response from Gemini API
   * @param {string|Array} prompt - User prompt
   * @param {Object} callbacks - Callback functions
   * @param {Function} callbacks.onChunk - Called for each text chunk
   * @param {Function} callbacks.onComplete - Called when streaming completes
   * @param {Function} callbacks.onError - Called on error
   * @param {Function} callbacks.onRetry - Called before retry attempt
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Complete response data
   */
  async stream(prompt, callbacks = {}, options = {}) {
    const correlationId = options.correlationId || generateCorrelationId();

    return withCorrelationId(correlationId, async () => {
      const { onChunk, onComplete, onError, onRetry } = callbacks;

      // Validate API key
      if (!this.config.apiKey) {
        const error = new Error('Gemini API key is required');
        if (onError) onError(error);
        throw error;
      }

      // Initialize abort controller
      this.abortController = new AbortController();
      this.isStreaming = true;
      this.stats.totalRequests++;

      const model = options.model || this.config.model;
      const url = this._buildStreamUrl(model);
      const body = this._buildRequestBody(prompt, options);

      // Result accumulator
      const result = {
        text: '',
        chunks: [],
        finishReason: null,
        usageMetadata: null,
        correlationId,
        model
      };

      try {
        logger.info('Starting stream', {
          correlationId,
          model,
          promptLength: typeof prompt === 'string' ? prompt.length : prompt.length
        });

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body),
          signal: this.abortController.signal
        });

        // Handle error responses
        if (!response.ok) {
          const errorText = await response.text();
          throw new ApiError(
            `Gemini API error: ${response.status} ${response.statusText}`,
            response.status,
            { response: errorText, correlationId }
          );
        }

        // Process SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          // Decode chunk and add to buffer
          buffer += decoder.decode(value, { stream: true });

          // Process complete lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            const data = this._parseSSELine(line);
            if (!data) continue;

            const content = this._extractContent(data);

            if (content.text) {
              result.text += content.text;
              result.chunks.push({
                text: content.text,
                timestamp: Date.now()
              });
              this.stats.totalChunks++;

              // Call chunk callback
              if (onChunk) {
                onChunk(content.text, {
                  accumulated: result.text,
                  chunkIndex: result.chunks.length - 1
                });
              }
            }

            // Update metadata
            if (content.finishReason) {
              result.finishReason = content.finishReason;
            }
            if (content.usageMetadata) {
              result.usageMetadata = content.usageMetadata;
              if (content.usageMetadata.totalTokenCount) {
                this.stats.totalTokens += content.usageMetadata.totalTokenCount;
              }
            }
          }
        }

        // Process any remaining buffer
        if (buffer.trim()) {
          const data = this._parseSSELine(buffer);
          if (data) {
            const content = this._extractContent(data);
            if (content.text) {
              result.text += content.text;
            }
          }
        }

        this.stats.successfulRequests++;
        this.isStreaming = false;

        logger.info('Stream completed', {
          correlationId,
          textLength: result.text.length,
          chunks: result.chunks.length,
          finishReason: result.finishReason
        });

        // Call complete callback
        if (onComplete) {
          onComplete(result);
        }

        return result;

      } catch (error) {
        this.isStreaming = false;

        // Handle abort
        if (error.name === 'AbortError') {
          this.stats.abortedRequests++;
          logger.info('Stream aborted', { correlationId });

          const abortResult = {
            ...result,
            aborted: true,
            error: 'Stream was aborted'
          };

          if (onComplete) {
            onComplete(abortResult);
          }

          return abortResult;
        }

        this.stats.failedRequests++;
        logger.error('Stream error', {
          correlationId,
          error: error.message,
          status: error.statusCode
        });

        if (onError) {
          onError(error);
        }

        throw error;
      }
    });
  }

  /**
   * Generate with automatic retry on failure
   * @param {string|Array} prompt - User prompt
   * @param {number} maxRetries - Maximum retry attempts (default: config.maxRetries)
   * @param {Object} callbacks - Callback functions
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Complete response data
   */
  async generateWithRetry(prompt, maxRetries = null, callbacks = {}, options = {}) {
    const retries = maxRetries ?? this.config.maxRetries;
    const correlationId = options.correlationId || generateCorrelationId();

    return withCorrelationId(correlationId, async () => {
      let lastError;

      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          // Add attempt info to options
          const attemptOptions = {
            ...options,
            correlationId,
            attempt
          };

          const result = await this.stream(prompt, callbacks, attemptOptions);
          return result;

        } catch (error) {
          lastError = error;

          // Check if error is retryable
          const canRetry = isRetryable(error, {
            maxRetries: retries,
            currentRetry: attempt
          });

          if (!canRetry || attempt >= retries) {
            logger.error('All retry attempts failed', {
              correlationId,
              attempts: attempt + 1,
              error: error.message
            });
            throw error;
          }

          // Calculate retry delay
          const delay = getRetryDelay(attempt, {
            baseDelay: this.config.retryDelayBase,
            maxDelay: this.config.retryDelayMax
          });

          this.stats.retries++;

          logger.warn('Retrying stream', {
            correlationId,
            attempt: attempt + 1,
            maxRetries: retries,
            delay,
            error: error.message
          });

          // Notify retry callback
          if (callbacks.onRetry) {
            callbacks.onRetry({
              attempt: attempt + 1,
              maxRetries: retries,
              delay,
              error
            });
          }

          await this._sleep(delay);
        }
      }

      throw lastError;
    });
  }

  /**
   * Abort the current stream
   * @returns {boolean} True if aborted, false if no stream was active
   */
  abort() {
    if (!this.abortController || !this.isStreaming) {
      logger.debug('No active stream to abort');
      return false;
    }

    logger.info('Aborting stream');
    this.abortController.abort();
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
   * Update configuration
   * @param {Object} config - New configuration values
   * @returns {GeminiStreamHandler} this for chaining
   */
  configure(config) {
    this.config = { ...this.config, ...config };
    logger.info('Configuration updated', config);
    return this;
  }

  /**
   * Set model
   * @param {string} model - Model name
   * @returns {GeminiStreamHandler} this for chaining
   */
  setModel(model) {
    this.config.model = model;
    logger.info('Model updated', { model });
    return this;
  }

  /**
   * Set API key
   * @param {string} apiKey - Gemini API key
   * @returns {GeminiStreamHandler} this for chaining
   */
  setApiKey(apiKey) {
    this.config.apiKey = apiKey;
    logger.info('API key updated');
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
      averageChunksPerRequest: this.stats.successfulRequests > 0
        ? Math.round(this.stats.totalChunks / this.stats.successfulRequests)
        : 0
    };
  }

  /**
   * Reset statistics
   * @returns {GeminiStreamHandler} this for chaining
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      abortedRequests: 0,
      retries: 0,
      totalTokens: 0,
      totalChunks: 0
    };
    logger.info('Statistics reset');
    return this;
  }
}

/**
 * Create a pre-configured GeminiStreamHandler instance
 * @param {Object} config - Configuration options
 * @returns {GeminiStreamHandler}
 */
export function createGeminiHandler(config = {}) {
  return new GeminiStreamHandler(config);
}

/**
 * Default singleton instance
 */
let defaultHandler = null;

/**
 * Get or create default Gemini handler
 * @param {Object} config - Configuration options (only used on first call)
 * @returns {GeminiStreamHandler}
 */
export function getDefaultHandler(config = {}) {
  if (!defaultHandler) {
    defaultHandler = new GeminiStreamHandler(config);
  }
  return defaultHandler;
}

/**
 * Quick streaming helper function
 * @param {string} prompt - User prompt
 * @param {Object} options - Options including callbacks
 * @returns {Promise<Object>} Response data
 */
export async function streamGemini(prompt, options = {}) {
  const { onChunk, onComplete, onError, onRetry, ...config } = options;
  const handler = getDefaultHandler(config);

  return handler.stream(prompt, {
    onChunk,
    onComplete,
    onError,
    onRetry
  }, config);
}

export default GeminiStreamHandler;
