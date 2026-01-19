/**
 * CodexCLI Stream Handler
 * Advanced streaming handler for OpenAI Codex/GPT API with SSE support
 *
 * @module CodexStreamHandler
 * @version 1.0.0
 */

import OpenAI from 'openai';
import { CONFIG } from './config.js';
import { createLogger } from './logger.js';

const logger = createLogger('codex-handler');

/**
 * OpenAI API Error Codes
 * @see https://platform.openai.com/docs/guides/error-codes
 */
const OPENAI_ERROR_CODES = {
  INVALID_API_KEY: 'invalid_api_key',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  INSUFFICIENT_QUOTA: 'insufficient_quota',
  MODEL_NOT_FOUND: 'model_not_found',
  CONTEXT_LENGTH_EXCEEDED: 'context_length_exceeded',
  INVALID_REQUEST: 'invalid_request_error',
  SERVER_ERROR: 'server_error',
  SERVICE_UNAVAILABLE: 'service_unavailable',
  TIMEOUT: 'timeout'
};

/**
 * HTTP Status to Error Code mapping
 */
const HTTP_STATUS_MAP = {
  400: OPENAI_ERROR_CODES.INVALID_REQUEST,
  401: OPENAI_ERROR_CODES.INVALID_API_KEY,
  403: OPENAI_ERROR_CODES.INVALID_API_KEY,
  404: OPENAI_ERROR_CODES.MODEL_NOT_FOUND,
  429: OPENAI_ERROR_CODES.RATE_LIMIT_EXCEEDED,
  500: OPENAI_ERROR_CODES.SERVER_ERROR,
  502: OPENAI_ERROR_CODES.SERVICE_UNAVAILABLE,
  503: OPENAI_ERROR_CODES.SERVICE_UNAVAILABLE,
  504: OPENAI_ERROR_CODES.TIMEOUT
};

/**
 * Model context windows (approximate token limits)
 */
const MODEL_CONTEXT_LIMITS = {
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4-turbo-preview': 128000,
  'gpt-4': 8192,
  'gpt-4-32k': 32768,
  'gpt-3.5-turbo': 16385,
  'gpt-3.5-turbo-16k': 16385,
  'o1': 200000,
  'o1-preview': 128000,
  'o1-mini': 128000
};

/**
 * Approximate token count estimation
 * Uses ~4 characters per token heuristic for English text
 * @param {string} text - Text to estimate tokens for
 * @returns {number} Estimated token count
 */
function estimateTokens(text) {
  if (!text) return 0;
  // Rough estimation: ~4 chars per token for English
  // Adjust for code which tends to have more tokens per character
  const charCount = text.length;
  const wordCount = text.split(/\s+/).length;
  // Blend character and word-based estimates
  return Math.ceil((charCount / 4 + wordCount) / 2);
}

/**
 * CodexStreamHandler - Advanced streaming handler for OpenAI API
 *
 * Features:
 * - SSE (Server-Sent Events) streaming support
 * - Token counting and rate limit awareness
 * - Abort controller for cancellation
 * - Comprehensive error handling
 * - Automatic retries with exponential backoff
 */
export class CodexStreamHandler {
  /**
   * Create a new CodexStreamHandler instance
   * @param {Object} config - Configuration options
   * @param {string} config.apiKey - OpenAI API key
   * @param {string} [config.model='gpt-4o'] - Default model to use
   * @param {string} [config.baseUrl] - Custom base URL for API
   * @param {string} [config.organization] - OpenAI organization ID
   * @param {number} [config.timeout=120000] - Request timeout in ms
   * @param {number} [config.maxRetries=3] - Maximum retry attempts
   */
  constructor(config = {}) {
    this.apiKey = config.apiKey || CONFIG.OPENAI_API_KEY;
    this.model = config.model || CONFIG.DEFAULT_MODEL;
    this.baseUrl = config.baseUrl || CONFIG.OPENAI_BASE_URL;
    this.organization = config.organization || CONFIG.OPENAI_ORG_ID;
    this.timeout = config.timeout || CONFIG.REQUEST_TIMEOUT_MS;
    this.maxRetries = config.maxRetries ?? CONFIG.MAX_RETRIES;

    // Rate limiting state
    this.rateLimitState = {
      remaining: null,
      reset: null,
      lastRequest: null,
      requestsThisMinute: 0,
      tokensThisMinute: 0
    };

    // Abort controller for current request
    this.abortController = null;
    this.isStreaming = false;

    // Initialize OpenAI client
    this._initClient();

    logger.info('CodexStreamHandler initialized', {
      model: this.model,
      baseUrl: this.baseUrl,
      timeout: this.timeout
    });
  }

  /**
   * Initialize the OpenAI client
   * @private
   */
  _initClient() {
    if (!this.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    const clientConfig = {
      apiKey: this.apiKey,
      timeout: this.timeout,
      maxRetries: 0 // We handle retries ourselves
    };

    if (this.baseUrl && this.baseUrl !== 'https://api.openai.com/v1') {
      clientConfig.baseURL = this.baseUrl;
    }

    if (this.organization) {
      clientConfig.organization = this.organization;
    }

    this.client = new OpenAI(clientConfig);
  }

  /**
   * Stream a completion from the API with SSE support
   * @param {string} prompt - The user prompt
   * @param {Object} callbacks - Callback functions for stream events
   * @param {Function} [callbacks.onToken] - Called for each token/chunk
   * @param {Function} [callbacks.onComplete] - Called when stream completes
   * @param {Function} [callbacks.onError] - Called on error
   * @param {Function} [callbacks.onStart] - Called when stream starts
   * @param {Function} [callbacks.onUsage] - Called with usage statistics
   * @param {Object} [options] - Additional options
   * @param {string} [options.model] - Model to use
   * @param {string} [options.systemPrompt] - System prompt
   * @param {number} [options.temperature] - Temperature (0-2)
   * @param {number} [options.maxTokens] - Max tokens to generate
   * @param {Array} [options.history] - Conversation history
   * @param {Array} [options.stop] - Stop sequences
   * @returns {Promise<Object>} Complete response with usage info
   */
  async stream(prompt, callbacks = {}, options = {}) {
    const {
      onToken = () => {},
      onComplete = () => {},
      onError = () => {},
      onStart = () => {},
      onUsage = () => {}
    } = callbacks;

    const model = options.model || this.model;
    const systemPrompt = options.systemPrompt || 'You are a helpful AI coding assistant.';
    const temperature = options.temperature ?? CONFIG.DEFAULT_TEMPERATURE;
    const maxTokens = options.maxTokens ?? CONFIG.DEFAULT_MAX_TOKENS;

    // Check rate limits before making request
    await this._checkRateLimits(model, prompt, systemPrompt);

    // Create abort controller for this request
    this.abortController = new AbortController();
    this.isStreaming = true;

    const startTime = Date.now();
    let fullResponse = '';
    let finishReason = null;
    let promptTokens = 0;
    let completionTokens = 0;

    try {
      // Build messages array
      const messages = this._buildMessages(prompt, systemPrompt, options.history);

      // Estimate prompt tokens
      promptTokens = this._estimateMessagesTokens(messages);

      // Check context length
      const contextLimit = MODEL_CONTEXT_LIMITS[model] || 128000;
      if (promptTokens + maxTokens > contextLimit) {
        throw this._createError(
          `Request may exceed context limit. Estimated: ${promptTokens} prompt + ${maxTokens} max completion = ${promptTokens + maxTokens}, Limit: ${contextLimit}`,
          OPENAI_ERROR_CODES.CONTEXT_LENGTH_EXCEEDED,
          400
        );
      }

      // Notify stream start
      onStart({ model, promptTokens, timestamp: new Date().toISOString() });

      logger.debug('Starting stream', { model, promptTokens, maxTokens });

      // Create the stream
      const stream = await this.client.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        top_p: options.topP ?? CONFIG.DEFAULT_TOP_P,
        frequency_penalty: options.frequencyPenalty ?? CONFIG.DEFAULT_FREQUENCY_PENALTY,
        presence_penalty: options.presencePenalty ?? CONFIG.DEFAULT_PRESENCE_PENALTY,
        stop: options.stop,
        stream: true,
        stream_options: { include_usage: true }
      }, {
        signal: this.abortController.signal
      });

      // Process SSE stream
      for await (const chunk of stream) {
        // Check for abort
        if (this.abortController.signal.aborted) {
          logger.info('Stream aborted by user');
          break;
        }

        // Extract content from chunk
        const content = chunk.choices[0]?.delta?.content || '';

        if (content) {
          fullResponse += content;
          completionTokens++;

          // Call token callback with chunk data
          onToken({
            content,
            index: chunk.choices[0]?.index || 0,
            timestamp: Date.now() - startTime
          });
        }

        // Check for finish reason
        if (chunk.choices[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason;
        }

        // Extract usage if present (final chunk)
        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens;
          completionTokens = chunk.usage.completion_tokens;
        }
      }

      // Update rate limit tracking
      this._updateRateLimitTracking(promptTokens + completionTokens);

      const result = {
        response: fullResponse,
        model,
        finishReason: finishReason || 'stop',
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens
        },
        durationMs: Date.now() - startTime,
        aborted: this.abortController.signal.aborted
      };

      // Call usage callback
      onUsage(result.usage);

      // Call complete callback
      onComplete(result);

      logger.info('Stream completed', {
        model,
        tokens: result.usage.totalTokens,
        durationMs: result.durationMs,
        finishReason: result.finishReason
      });

      return result;

    } catch (error) {
      const handledError = this._handleError(error);
      onError(handledError);
      throw handledError;
    } finally {
      this.isStreaming = false;
      this.abortController = null;
    }
  }

  /**
   * Non-streaming completion
   * @param {string} prompt - The user prompt
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} Complete response
   */
  async complete(prompt, options = {}) {
    const model = options.model || this.model;
    const systemPrompt = options.systemPrompt || 'You are a helpful AI coding assistant.';
    const temperature = options.temperature ?? CONFIG.DEFAULT_TEMPERATURE;
    const maxTokens = options.maxTokens ?? CONFIG.DEFAULT_MAX_TOKENS;

    // Check rate limits
    await this._checkRateLimits(model, prompt, systemPrompt);

    // Create abort controller
    this.abortController = new AbortController();

    const startTime = Date.now();
    let attempt = 0;
    let lastError;

    while (attempt <= this.maxRetries) {
      try {
        const messages = this._buildMessages(prompt, systemPrompt, options.history);

        const response = await this.client.chat.completions.create({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          top_p: options.topP ?? CONFIG.DEFAULT_TOP_P,
          frequency_penalty: options.frequencyPenalty ?? CONFIG.DEFAULT_FREQUENCY_PENALTY,
          presence_penalty: options.presencePenalty ?? CONFIG.DEFAULT_PRESENCE_PENALTY,
          stop: options.stop,
          response_format: options.responseFormat
        }, {
          signal: this.abortController.signal
        });

        // Update rate limit tracking
        if (response.usage) {
          this._updateRateLimitTracking(response.usage.total_tokens);
        }

        const result = {
          response: response.choices[0]?.message?.content || '',
          model: response.model,
          finishReason: response.choices[0]?.finish_reason,
          usage: {
            promptTokens: response.usage?.prompt_tokens,
            completionTokens: response.usage?.completion_tokens,
            totalTokens: response.usage?.total_tokens
          },
          durationMs: Date.now() - startTime
        };

        logger.info('Completion finished', {
          model,
          tokens: result.usage.totalTokens,
          durationMs: result.durationMs
        });

        return result;

      } catch (error) {
        lastError = error;

        // Check if aborted
        if (this.abortController.signal.aborted) {
          throw this._createError('Request aborted', 'aborted', 0);
        }

        // Handle retryable errors
        if (this._isRetryableError(error) && attempt < this.maxRetries) {
          const delay = this._getRetryDelay(error, attempt);
          logger.warn('Retrying after error', {
            attempt,
            delay,
            error: error.message,
            status: error.status
          });
          await this._sleep(delay);
          attempt++;
          continue;
        }

        throw this._handleError(error);
      }
    }

    throw this._handleError(lastError);
  }

  /**
   * Abort the current streaming request
   * @returns {boolean} True if abort was triggered, false if no active stream
   */
  abort() {
    if (this.abortController && this.isStreaming) {
      this.abortController.abort();
      logger.info('Stream abort requested');
      return true;
    }
    return false;
  }

  /**
   * Check if currently streaming
   * @returns {boolean}
   */
  isActive() {
    return this.isStreaming;
  }

  /**
   * Get current rate limit state
   * @returns {Object} Rate limit information
   */
  getRateLimitState() {
    return { ...this.rateLimitState };
  }

  /**
   * Estimate token count for a string
   * @param {string} text - Text to estimate
   * @returns {number} Estimated token count
   */
  estimateTokens(text) {
    return estimateTokens(text);
  }

  /**
   * Get context limit for a model
   * @param {string} [model] - Model name (defaults to configured model)
   * @returns {number} Context window size
   */
  getContextLimit(model) {
    return MODEL_CONTEXT_LIMITS[model || this.model] || 128000;
  }

  // === Private Methods ===

  /**
   * Build messages array from prompt and options
   * @private
   */
  _buildMessages(prompt, systemPrompt, history = []) {
    const messages = [
      { role: 'system', content: systemPrompt }
    ];

    // Add conversation history
    if (Array.isArray(history) && history.length > 0) {
      messages.push(...history);
    }

    // Add current prompt
    messages.push({ role: 'user', content: prompt });

    return messages;
  }

  /**
   * Estimate tokens for messages array
   * @private
   */
  _estimateMessagesTokens(messages) {
    let total = 0;
    for (const msg of messages) {
      // Each message has ~4 tokens overhead
      total += 4;
      total += estimateTokens(msg.content);
      total += estimateTokens(msg.role);
    }
    // Add ~3 tokens for message formatting
    return total + 3;
  }

  /**
   * Check and wait for rate limits if needed
   * @private
   */
  async _checkRateLimits(model, prompt, systemPrompt) {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Reset counters if a minute has passed
    if (!this.rateLimitState.lastRequest || this.rateLimitState.lastRequest < oneMinuteAgo) {
      this.rateLimitState.requestsThisMinute = 0;
      this.rateLimitState.tokensThisMinute = 0;
    }

    // Estimate tokens for this request
    const estimatedTokens = estimateTokens(prompt) + estimateTokens(systemPrompt) + 100;

    // If we have rate limit info and are close to limit, wait
    if (this.rateLimitState.remaining !== null && this.rateLimitState.remaining <= 1) {
      if (this.rateLimitState.reset && this.rateLimitState.reset > now) {
        const waitTime = this.rateLimitState.reset - now + 1000;
        logger.warn('Approaching rate limit, waiting', { waitTime });
        await this._sleep(waitTime);
      }
    }

    // Log estimated usage
    logger.debug('Request token estimate', {
      estimatedTokens,
      requestsThisMinute: this.rateLimitState.requestsThisMinute
    });
  }

  /**
   * Update rate limit tracking after request
   * @private
   */
  _updateRateLimitTracking(tokensUsed) {
    this.rateLimitState.lastRequest = Date.now();
    this.rateLimitState.requestsThisMinute++;
    this.rateLimitState.tokensThisMinute += tokensUsed;
  }

  /**
   * Check if error is retryable
   * @private
   */
  _isRetryableError(error) {
    // Rate limit errors
    if (error.status === 429) return true;

    // Server errors
    if (error.status >= 500) return true;

    // Network errors
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') return true;

    return false;
  }

  /**
   * Calculate retry delay with exponential backoff
   * @private
   */
  _getRetryDelay(error, attempt) {
    // Check for Retry-After header
    if (error.headers?.['retry-after']) {
      return parseInt(error.headers['retry-after'], 10) * 1000;
    }

    // Exponential backoff: base * 2^attempt with jitter
    const baseDelay = CONFIG.RETRY_DELAY_BASE || 1000;
    const exponentialDelay = baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 1000;

    return Math.min(exponentialDelay + jitter, 60000); // Cap at 60s
  }

  /**
   * Handle and normalize API errors
   * @private
   */
  _handleError(error) {
    // Already normalized error
    if (error.code && error.status !== undefined) {
      return error;
    }

    // Abort error
    if (error.name === 'AbortError') {
      return this._createError('Request aborted by user', 'aborted', 0);
    }

    // OpenAI API error
    if (error.status) {
      const code = HTTP_STATUS_MAP[error.status] || OPENAI_ERROR_CODES.SERVER_ERROR;
      return this._createError(
        error.message || 'OpenAI API error',
        code,
        error.status,
        error
      );
    }

    // Network/timeout error
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') {
      return this._createError(
        `Network error: ${error.message}`,
        OPENAI_ERROR_CODES.TIMEOUT,
        0,
        error
      );
    }

    // Generic error
    return this._createError(
      error.message || 'Unknown error',
      'unknown_error',
      0,
      error
    );
  }

  /**
   * Create a normalized error object
   * @private
   */
  _createError(message, code, status, originalError = null) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    error.isRetryable = this._isRetryableError({ status, code });

    if (originalError) {
      error.originalError = originalError;
    }

    logger.error('CodexStreamHandler error', {
      message,
      code,
      status,
      isRetryable: error.isRetryable
    });

    return error;
  }

  /**
   * Sleep utility
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create a pre-configured handler instance
 * @param {Object} [config] - Configuration overrides
 * @returns {CodexStreamHandler}
 */
export function createCodexHandler(config = {}) {
  return new CodexStreamHandler(config);
}

/**
 * Export error codes for external use
 */
export { OPENAI_ERROR_CODES, MODEL_CONTEXT_LIMITS };

/**
 * Default export
 */
export default CodexStreamHandler;
