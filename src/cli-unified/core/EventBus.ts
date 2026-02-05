/**
 * Typed Event Bus for CLI-Unified
 * @module cli-unified/core/EventBus
 */

import { EventEmitter } from 'events';
import { EVENT_TYPES } from './constants.js';

/**
 * Typed Event Bus with middleware support
 */
export class EventBus extends EventEmitter {
  constructor() {
    super();
    this.middlewares = new Map();
    this.history = [];
    this.maxHistory = 100;
  }

  /**
   * Emit event with optional payload
   * @param {string} event - Event type from EVENT_TYPES
   * @param {*} payload - Event payload
   */
  emit(event, payload = {}) {
    const eventData = {
      type: event,
      payload,
      timestamp: Date.now()
    };

    // Run middlewares
    const middlewares = this.middlewares.get(event) || [];
    for (const mw of middlewares) {
      const result = mw(eventData);
      if (result === false) return false; // Middleware can cancel event
      if (result !== undefined) eventData.payload = result;
    }

    // Store in history
    this.history.push(eventData);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    return super.emit(event, eventData.payload);
  }

  /**
   * Add middleware for event type
   * @param {string} event - Event type
   * @param {Function} middleware - Middleware function
   */
  use(event, middleware) {
    if (!this.middlewares.has(event)) {
      this.middlewares.set(event, []);
    }
    this.middlewares.get(event).push(middleware);
  }

  /**
   * Get event history
   * @param {string} [eventType] - Filter by event type
   * @returns {Array} Event history
   */
  getHistory(eventType) {
    if (eventType) {
      return this.history.filter(e => e.type === eventType);
    }
    return [...this.history];
  }

  /**
   * Clear history
   */
  clearHistory() {
    this.history = [];
  }

  /**
   * Wait for event (Promise-based)
   * @param {string} event - Event type
   * @param {number} [timeout] - Timeout in ms
   * @returns {Promise<*>} Event payload
   */
  waitFor(event, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timer = timeout > 0 ? setTimeout(() => {
        this.off(event, handler);
        reject(new Error(`Timeout waiting for event: ${event}`));
      }, timeout) : null;

      const handler = (payload) => {
        if (timer) clearTimeout(timer);
        resolve(payload);
      };

      this.once(event, handler);
    });
  }
}

// Export singleton instance
export const eventBus = new EventBus();

// Re-export event types for convenience
export { EVENT_TYPES };

export default eventBus;
