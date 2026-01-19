/**
 * HYDRA Retry Logic - Standardized retry mechanism with exponential backoff
 */

/**
 * Retry configuration options
 * @typedef {Object} RetryOptions
 * @property {number} maxRetries - Maximum retry attempts (default: 3)
 * @property {number} baseDelay - Base delay in ms (default: 1000)
 * @property {number} maxDelay - Maximum delay in ms (default: 30000)
 * @property {number} backoffMultiplier - Multiplier for exponential backoff (default: 2)
 * @property {boolean} jitter - Add random jitter to delays (default: true)
 * @property {Function} shouldRetry - Custom function to determine if retry should occur
 * @property {Function} onRetry - Callback on each retry attempt
 */

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'EPIPE',
    'ENOTFOUND',
    'ENETUNREACH',
    'EAI_AGAIN',
    'AbortError',
    'TimeoutError'
  ],
  retryableStatusCodes: [408, 429, 500, 502, 503, 504]
};

/**
 * Determines if an error is retryable
 * @param {Error} error - The error to check
 * @param {RetryOptions} options - Retry options
 * @returns {boolean}
 */
export function isRetryableError(error, options = DEFAULT_RETRY_CONFIG) {
  // Check custom shouldRetry function
  if (options.shouldRetry) {
    return options.shouldRetry(error);
  }

  // Check error code
  if (error.code && options.retryableErrors.includes(error.code)) {
    return true;
  }

  // Check error name
  if (error.name && options.retryableErrors.includes(error.name)) {
    return true;
  }

  // Check for timeout
  if (error.message && error.message.toLowerCase().includes('timeout')) {
    return true;
  }

  // Check HTTP status codes
  if (error.status && options.retryableStatusCodes.includes(error.status)) {
    return true;
  }

  // Check for rate limiting
  if (error.message && (
    error.message.includes('rate limit') ||
    error.message.includes('too many requests') ||
    error.message.includes('429')
  )) {
    return true;
  }

  return false;
}

/**
 * Calculate delay with exponential backoff and optional jitter
 * @param {number} attempt - Current attempt number (0-indexed)
 * @param {RetryOptions} options - Retry options
 * @returns {number} Delay in ms
 */
export function calculateDelay(attempt, options = DEFAULT_RETRY_CONFIG) {
  const { baseDelay, maxDelay, backoffMultiplier, jitter } = options;

  // Calculate exponential delay
  let delay = baseDelay * Math.pow(backoffMultiplier, attempt);

  // Apply jitter (random factor between 0.5 and 1.5)
  if (jitter) {
    const jitterFactor = 0.5 + Math.random();
    delay *= jitterFactor;
  }

  // Cap at max delay
  return Math.min(delay, maxDelay);
}

/**
 * Sleep for specified duration
 * @param {number} ms - Duration in milliseconds
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic
 * @template T
 * @param {() => Promise<T>} fn - Function to execute
 * @param {RetryOptions} options - Retry options
 * @returns {Promise<T>}
 */
export async function withRetry(fn, options = {}) {
  const config = { ...DEFAULT_RETRY_CONFIG, ...options };
  const { maxRetries, onRetry } = config;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt === maxRetries || !isRetryableError(error, config)) {
        throw error;
      }

      // Calculate delay
      const delay = calculateDelay(attempt, config);

      // Call onRetry callback if provided
      if (onRetry) {
        onRetry({
          attempt: attempt + 1,
          maxRetries,
          error,
          delay,
          willRetry: true
        });
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Create a retryable wrapper for a function
 * @template T
 * @param {() => Promise<T>} fn - Function to wrap
 * @param {RetryOptions} options - Default retry options
 * @returns {(overrides?: RetryOptions) => Promise<T>}
 */
export function createRetryable(fn, options = {}) {
  return (overrides = {}) => withRetry(fn, { ...options, ...overrides });
}

/**
 * Circuit breaker state
 */
const CircuitState = {
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half-open'
};

/**
 * Circuit Breaker implementation
 * Prevents cascading failures by temporarily blocking requests to a failing service
 */
export class CircuitBreaker {
  /**
   * @param {Object} options
   * @property {number} failureThreshold - Failures before opening circuit (default: 5)
   * @property {number} successThreshold - Successes before closing circuit (default: 2)
   * @property {number} timeout - Time in ms before trying again (default: 30000)
   */
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 30000;

    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
  }

  /**
   * Execute function through circuit breaker
   * @template T
   * @param {() => Promise<T>} fn - Function to execute
   * @returns {Promise<T>}
   */
  async execute(fn) {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        throw new Error(`Circuit breaker is OPEN. Next attempt at ${new Date(this.nextAttempt).toISOString()}`);
      }
      // Move to half-open state
      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure();
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  _onSuccess() {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this._reset();
      }
    } else {
      this.failureCount = 0;
    }
  }

  /**
   * Handle failed execution
   */
  _onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.timeout;
    }
  }

  /**
   * Reset circuit breaker to closed state
   */
  _reset() {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
  }

  /**
   * Force open the circuit
   */
  forceOpen() {
    this.state = CircuitState.OPEN;
    this.nextAttempt = Date.now() + this.timeout;
  }

  /**
   * Force close the circuit
   */
  forceClose() {
    this._reset();
  }

  /**
   * Get current circuit state
   * @returns {Object}
   */
  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttempt: this.nextAttempt
    };
  }
}

export { CircuitState };
