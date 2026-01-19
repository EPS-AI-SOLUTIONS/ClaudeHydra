/**
 * Time Utilities
 * @module utils/time
 */

/**
 * Format date to ISO string without milliseconds
 * @param {Date} [date] - Date to format (defaults to now)
 * @returns {string} Formatted date string
 */
export function formatDate(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Format date to local string
 * @param {Date} [date] - Date to format (defaults to now)
 * @param {string} [locale='en-US'] - Locale string
 * @returns {string} Formatted date string
 */
export function formatLocalDate(date = new Date(), locale = 'en-US') {
  return date.toLocaleString(locale);
}

/**
 * Format timestamp to human-readable relative time
 * @param {number|Date} timestamp - Timestamp or Date
 * @returns {string} Relative time string
 */
export function formatRelative(timestamp) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) {
    return 'just now';
  } else if (minutes < 60) {
    return `${minutes}m ago`;
  } else if (hours < 24) {
    return `${hours}h ago`;
  } else if (days < 7) {
    return `${days}d ago`;
  } else {
    return formatLocalDate(date);
  }
}

/**
 * Format duration in milliseconds to human-readable string
 * @param {number} ms - Duration in milliseconds
 * @param {boolean} [long=false] - Use long format
 * @returns {string} Formatted duration
 */
export function formatDuration(ms, long = false) {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (long) {
    const parts = [];
    if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
    if (hours % 24 > 0) parts.push(`${hours % 24} hour${hours % 24 !== 1 ? 's' : ''}`);
    if (minutes % 60 > 0) parts.push(`${minutes % 60} minute${minutes % 60 !== 1 ? 's' : ''}`);
    if (seconds % 60 > 0) parts.push(`${seconds % 60} second${seconds % 60 !== 1 ? 's' : ''}`);
    return parts.join(', ') || '0 seconds';
  }

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a timeout promise that rejects after specified time
 * @param {number} ms - Timeout in milliseconds
 * @param {string} [message='Operation timed out'] - Error message
 * @returns {Promise<never>}
 */
export function timeout(ms, message = 'Operation timed out') {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

/**
 * Wrap a promise with a timeout
 * @param {Promise<T>} promise - Promise to wrap
 * @param {number} ms - Timeout in milliseconds
 * @param {string} [message] - Error message
 * @returns {Promise<T>} Promise that rejects if timeout
 * @template T
 */
export function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    timeout(ms, message)
  ]);
}

/**
 * Debounce a function
 * @param {Function} fn - Function to debounce
 * @param {number} ms - Debounce delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(fn, ms) {
  let timeoutId = null;
  return function (...args) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn.apply(this, args);
      timeoutId = null;
    }, ms);
  };
}

/**
 * Throttle a function
 * @param {Function} fn - Function to throttle
 * @param {number} ms - Throttle interval in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(fn, ms) {
  let lastCall = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastCall >= ms) {
      lastCall = now;
      return fn.apply(this, args);
    }
  };
}

/**
 * Get current timestamp in milliseconds
 * @returns {number} Current timestamp
 */
export function now() {
  return Date.now();
}

/**
 * Get current timestamp in seconds
 * @returns {number} Current timestamp in seconds
 */
export function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Parse duration string to milliseconds
 * @param {string} duration - Duration string (e.g., '1h', '30m', '5s')
 * @returns {number} Duration in milliseconds
 */
export function parseDuration(duration) {
  const match = duration.match(/^(\d+)\s*(ms|s|m|h|d)$/i);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  const multipliers = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  return value * multipliers[unit];
}

export default {
  formatDate,
  formatLocalDate,
  formatRelative,
  formatDuration,
  sleep,
  timeout,
  withTimeout,
  debounce,
  throttle,
  now,
  nowSeconds,
  parseDuration
};
