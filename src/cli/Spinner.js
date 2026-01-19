/**
 * CLI Spinner and Progress Indicators
 * @module cli/Spinner
 */

import ora from 'ora';
import { HydraTheme } from './Theme.js';

/**
 * @typedef {Object} SpinnerOptions
 * @property {string} [text] - Initial text
 * @property {string} [color] - Spinner color
 * @property {Object} [theme] - Theme object
 */

/**
 * Spinner wrapper for ora with theme integration
 */
export class Spinner {
  /** @type {import('ora').Ora} */
  #ora;

  /** @type {Object} */
  #theme;

  /** @type {boolean} */
  #active = false;

  /**
   * Create a new Spinner
   * @param {SpinnerOptions} options - Spinner options
   */
  constructor(options = {}) {
    this.#theme = options.theme || HydraTheme;
    this.#ora = ora({
      text: options.text || '',
      color: options.color || 'cyan',
      spinner: {
        interval: 80,
        frames: this.#theme.spinner
      }
    });
  }

  /**
   * Start the spinner
   * @param {string} [text] - Text to display
   * @returns {Spinner} This spinner instance
   */
  start(text) {
    if (text) this.#ora.text = text;
    this.#ora.start();
    this.#active = true;
    return this;
  }

  /**
   * Stop the spinner
   * @returns {Spinner} This spinner instance
   */
  stop() {
    this.#ora.stop();
    this.#active = false;
    return this;
  }

  /**
   * Stop with success state
   * @param {string} [text] - Success message
   * @returns {Spinner} This spinner instance
   */
  succeed(text) {
    this.#ora.succeed(text);
    this.#active = false;
    return this;
  }

  /**
   * Stop with failure state
   * @param {string} [text] - Failure message
   * @returns {Spinner} This spinner instance
   */
  fail(text) {
    this.#ora.fail(text);
    this.#active = false;
    return this;
  }

  /**
   * Stop with warning state
   * @param {string} [text] - Warning message
   * @returns {Spinner} This spinner instance
   */
  warn(text) {
    this.#ora.warn(text);
    this.#active = false;
    return this;
  }

  /**
   * Stop with info state
   * @param {string} [text] - Info message
   * @returns {Spinner} This spinner instance
   */
  info(text) {
    this.#ora.info(text);
    this.#active = false;
    return this;
  }

  /**
   * Update spinner text
   * @param {string} text - New text
   * @returns {Spinner} This spinner instance
   */
  text(text) {
    this.#ora.text = text;
    return this;
  }

  /**
   * Update spinner color
   * @param {string} color - New color
   * @returns {Spinner} This spinner instance
   */
  color(color) {
    this.#ora.color = color;
    return this;
  }

  /**
   * Check if spinner is active
   * @returns {boolean} True if spinning
   */
  get isSpinning() {
    return this.#active;
  }

  /**
   * Clear the spinner line
   * @returns {Spinner} This spinner instance
   */
  clear() {
    this.#ora.clear();
    return this;
  }

  /**
   * Render a frame manually
   * @returns {Spinner} This spinner instance
   */
  render() {
    this.#ora.render();
    return this;
  }
}

/**
 * Progress bar indicator
 */
export class ProgressBar {
  /** @type {number} */
  #current = 0;

  /** @type {number} */
  #total = 100;

  /** @type {number} */
  #width = 30;

  /** @type {string} */
  #label = '';

  /** @type {Object} */
  #theme;

  /**
   * Create a new progress bar
   * @param {Object} options - Progress bar options
   * @param {number} [options.total=100] - Total value
   * @param {number} [options.width=30] - Bar width in characters
   * @param {string} [options.label=''] - Label text
   * @param {Object} [options.theme] - Theme object
   */
  constructor(options = {}) {
    this.#total = options.total || 100;
    this.#width = options.width || 30;
    this.#label = options.label || '';
    this.#theme = options.theme || HydraTheme;
  }

  /**
   * Update progress
   * @param {number} value - Current value
   * @param {string} [label] - Optional new label
   * @returns {ProgressBar} This progress bar
   */
  update(value, label) {
    this.#current = Math.min(value, this.#total);
    if (label !== undefined) this.#label = label;
    this.#render();
    return this;
  }

  /**
   * Increment progress
   * @param {number} [amount=1] - Amount to increment
   * @returns {ProgressBar} This progress bar
   */
  increment(amount = 1) {
    return this.update(this.#current + amount);
  }

  /**
   * Complete the progress bar
   * @param {string} [label] - Completion label
   * @returns {ProgressBar} This progress bar
   */
  complete(label) {
    return this.update(this.#total, label || 'Complete');
  }

  /**
   * Render the progress bar
   * @private
   */
  #render() {
    const percent = this.#current / this.#total;
    const filled = Math.round(this.#width * percent);
    const empty = this.#width - filled;

    const bar = this.#theme.colors.primary('[') +
      this.#theme.colors.success('='.repeat(filled)) +
      this.#theme.colors.dim('-'.repeat(empty)) +
      this.#theme.colors.primary(']');

    const percentStr = this.#theme.colors.highlight(
      `${Math.round(percent * 100)}%`.padStart(4)
    );

    const label = this.#label ? ` ${this.#theme.colors.dim(this.#label)}` : '';

    // Clear line and write
    process.stdout.write(`\r\x1b[K${bar} ${percentStr}${label}`);
  }

  /**
   * Finish and move to new line
   */
  finish() {
    console.log();
  }

  /**
   * Get current value
   * @returns {number} Current value
   */
  get current() {
    return this.#current;
  }

  /**
   * Get total value
   * @returns {number} Total value
   */
  get total() {
    return this.#total;
  }

  /**
   * Get progress percentage (0-1)
   * @returns {number} Progress percentage
   */
  get percent() {
    return this.#current / this.#total;
  }
}

/**
 * Create a simple spinner
 * @param {string} [text] - Initial text
 * @returns {Spinner} New spinner instance
 */
export function createSpinner(text) {
  return new Spinner({ text });
}

/**
 * Create a progress bar
 * @param {Object} options - Progress bar options
 * @returns {ProgressBar} New progress bar instance
 */
export function createProgressBar(options) {
  return new ProgressBar(options);
}

export default Spinner;
