/**
 * CLI Input Handler
 * Enhanced readline with multi-line support, history, and autocomplete
 * @module cli/InputHandler
 */

import readline from 'readline';
import { EventEmitter } from 'events';
import { HydraTheme } from './Theme.js';
import { DEFAULT_PROMPT, MULTILINE_PROMPT, KEYS, ANSI } from './constants.js';

/**
 * @typedef {Object} InputOptions
 * @property {string} [prompt] - Prompt string
 * @property {boolean} [multiline=false] - Enable multiline mode
 * @property {import('./HistoryManager.js').HistoryManager} [history] - History manager
 * @property {import('./Autocomplete.js').Autocomplete} [autocomplete] - Autocomplete manager
 * @property {Object} [theme] - Theme object
 */

/**
 * @typedef {Object} InputResult
 * @property {string} value - The input text
 * @property {boolean} multiline - Whether multiline mode was used
 * @property {boolean} cancelled - Whether input was cancelled
 */

/**
 * Enhanced input handler with history, autocomplete, and multiline support
 * @extends EventEmitter
 */
export class InputHandler extends EventEmitter {
  /** @type {readline.Interface} */
  #rl;

  /** @type {Object} */
  #theme;

  /** @type {import('./HistoryManager.js').HistoryManager} */
  #history;

  /** @type {import('./Autocomplete.js').Autocomplete} */
  #autocomplete;

  /** @type {string} */
  #prompt;

  /** @type {string[]} */
  #multilineBuffer = [];

  /** @type {boolean} */
  #inMultilineMode = false;

  /** @type {boolean} */
  #closed = false;

  /** @type {string[]} */
  #completionSuggestions = [];

  /** @type {number} */
  #completionIndex = -1;

  /**
   * Create a new InputHandler
   * @param {InputOptions} [options] - Input options
   */
  constructor(options = {}) {
    super();

    this.#theme = options.theme || HydraTheme;
    this.#history = options.history || null;
    this.#autocomplete = options.autocomplete || null;
    this.#prompt = options.prompt || DEFAULT_PROMPT;

    this.#setupReadline();
  }

  /**
   * Setup readline interface
   * @private
   */
  #setupReadline() {
    this.#rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
      completer: this.#autocomplete ? this.#handleCompletion.bind(this) : undefined
    });

    // Handle line events
    this.#rl.on('line', (line) => {
      this.emit('line', line);
    });

    // Handle close
    this.#rl.on('close', () => {
      this.#closed = true;
      this.emit('close');
    });

    // Handle SIGINT (Ctrl+C)
    this.#rl.on('SIGINT', () => {
      if (this.#inMultilineMode) {
        // Cancel multiline mode
        this.#multilineBuffer = [];
        this.#inMultilineMode = false;
        console.log();
        this.emit('cancel');
      } else {
        this.emit('sigint');
      }
    });

    // Setup raw mode for special keys if available
    if (process.stdin.isTTY) {
      this.#setupKeyHandlers();
    }
  }

  /**
   * Setup keyboard handlers
   * @private
   */
  #setupKeyHandlers() {
    // History navigation is handled by readline by default
    // We enhance it with our history manager

    const originalWrite = this.#rl._writeToOutput;
    this.#rl._writeToOutput = (str) => {
      // Color the prompt
      if (str.includes(this.#prompt)) {
        str = str.replace(
          this.#prompt,
          this.#theme.colors.prompt(this.#prompt)
        );
      }
      originalWrite.call(this.#rl, str);
    };
  }

  /**
   * Handle tab completion
   * @param {string} line - Current line
   * @returns {[string[], string]} Completions and line
   * @private
   */
  async #handleCompletion(line) {
    if (!this.#autocomplete) {
      return [[], line];
    }

    try {
      const result = await this.#autocomplete.complete(line, line.length);
      this.#completionSuggestions = result.suggestions;
      this.#completionIndex = -1;

      return [result.suggestions, line];
    } catch {
      return [[], line];
    }
  }

  /**
   * Read a single line of input
   * @param {string} [prompt] - Optional prompt override
   * @returns {Promise<InputResult>} Input result
   */
  read(prompt) {
    return new Promise((resolve) => {
      if (this.#closed) {
        resolve({ value: '', multiline: false, cancelled: true });
        return;
      }

      const displayPrompt = prompt || this.#prompt;

      this.#rl.question(
        this.#theme.colors.prompt(displayPrompt),
        (answer) => {
          // Add to history if we have a history manager
          if (this.#history && answer.trim()) {
            this.#history.add(answer);
          }

          resolve({
            value: answer,
            multiline: false,
            cancelled: false
          });
        }
      );

      // Setup history navigation for this question
      if (this.#history) {
        this.#history.resetPosition();
      }
    });
  }

  /**
   * Read multiline input
   * Enter empty line or Ctrl+D to finish, Ctrl+C to cancel
   * @param {string} [initialPrompt] - Initial prompt
   * @returns {Promise<InputResult>} Input result
   */
  readMultiline(initialPrompt) {
    return new Promise((resolve) => {
      if (this.#closed) {
        resolve({ value: '', multiline: true, cancelled: true });
        return;
      }

      this.#inMultilineMode = true;
      this.#multilineBuffer = [];

      const prompt = initialPrompt || this.#prompt;
      const continuationPrompt = MULTILINE_PROMPT;

      console.log(this.#theme.colors.dim('(Enter empty line or Ctrl+D to finish, Ctrl+C to cancel)'));

      const readLine = (isFirst) => {
        const currentPrompt = isFirst ? prompt : continuationPrompt;

        this.#rl.question(
          this.#theme.colors.prompt(currentPrompt),
          (line) => {
            // Empty line finishes input
            if (line === '') {
              this.#inMultilineMode = false;
              const value = this.#multilineBuffer.join('\n');

              if (this.#history && value.trim()) {
                this.#history.add(value);
              }

              resolve({
                value,
                multiline: true,
                cancelled: false
              });
              return;
            }

            this.#multilineBuffer.push(line);
            readLine(false);
          }
        );
      };

      // Handle Ctrl+D
      const sigintHandler = () => {
        this.#inMultilineMode = false;
        const value = this.#multilineBuffer.join('\n');

        if (value.trim()) {
          if (this.#history) {
            this.#history.add(value);
          }
          resolve({ value, multiline: true, cancelled: false });
        } else {
          resolve({ value: '', multiline: true, cancelled: true });
        }
      };

      this.once('sigint', sigintHandler);

      readLine(true);
    });
  }

  /**
   * Read input with optional multiline based on user command
   * @param {Object} [options] - Read options
   * @param {string} [options.prompt] - Prompt string
   * @param {boolean} [options.forceMultiline] - Force multiline mode
   * @returns {Promise<InputResult>} Input result
   */
  async readSmart(options = {}) {
    if (options.forceMultiline) {
      return this.readMultiline(options.prompt);
    }
    return this.read(options.prompt);
  }

  /**
   * Set the prompt string
   * @param {string} prompt - New prompt
   */
  setPrompt(prompt) {
    this.#prompt = prompt;
    this.#rl.setPrompt(this.#theme.colors.prompt(prompt));
  }

  /**
   * Get current prompt
   * @returns {string} Current prompt
   */
  getPrompt() {
    return this.#prompt;
  }

  /**
   * Write text to output without newline
   * @param {string} text - Text to write
   */
  write(text) {
    process.stdout.write(text);
  }

  /**
   * Write line to output
   * @param {string} text - Text to write
   */
  writeLine(text) {
    console.log(text);
  }

  /**
   * Clear the current line
   */
  clearLine() {
    process.stdout.write(ANSI.CLEAR_LINE);
    process.stdout.write('\r');
  }

  /**
   * Pause input
   */
  pause() {
    this.#rl.pause();
  }

  /**
   * Resume input
   */
  resume() {
    this.#rl.resume();
  }

  /**
   * Close the input handler
   */
  close() {
    if (!this.#closed) {
      this.#rl.close();
      this.#closed = true;
    }
  }

  /**
   * Check if input is closed
   * @returns {boolean} True if closed
   */
  get isClosed() {
    return this.#closed;
  }

  /**
   * Get the history manager
   * @returns {import('./HistoryManager.js').HistoryManager|null} History manager
   */
  get history() {
    return this.#history;
  }

  /**
   * Set history manager
   * @param {import('./HistoryManager.js').HistoryManager} history - History manager
   */
  set history(history) {
    this.#history = history;
  }

  /**
   * Get the autocomplete manager
   * @returns {import('./Autocomplete.js').Autocomplete|null} Autocomplete manager
   */
  get autocomplete() {
    return this.#autocomplete;
  }

  /**
   * Set autocomplete manager
   * @param {import('./Autocomplete.js').Autocomplete} autocomplete - Autocomplete manager
   */
  set autocomplete(autocomplete) {
    this.#autocomplete = autocomplete;
  }

  /**
   * Get the theme
   * @returns {Object} Current theme
   */
  get theme() {
    return this.#theme;
  }

  /**
   * Set theme
   * @param {Object} theme - New theme
   */
  set theme(theme) {
    this.#theme = theme;
  }

  /**
   * Check if in multiline mode
   * @returns {boolean} True if in multiline mode
   */
  get isMultiline() {
    return this.#inMultilineMode;
  }
}

/**
 * Create a new input handler
 * @param {InputOptions} [options] - Input options
 * @returns {InputHandler} New input handler
 */
export function createInputHandler(options) {
  return new InputHandler(options);
}

export default InputHandler;
