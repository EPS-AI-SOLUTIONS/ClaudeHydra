/**
 * Unified Input Handler
 * Merges src/cli/InputHandler.js with src/cli-enhanced/input-enhancer.js
 * @module cli-unified/input/UnifiedInputHandler
 */

import readline from 'readline';
import { EventEmitter } from 'events';
import { themeRegistry } from '../core/ThemeRegistry.js';
import { eventBus, EVENT_TYPES } from '../core/EventBus.js';
import { DEFAULT_PROMPT, MULTILINE_PROMPT, KEYS, ANSI } from '../core/constants.js';
import { VimModeHandler, VIM_MODES } from './VimModeHandler.js';
import { TemplateExpander } from './TemplateExpander.js';
import { MacroRecorder } from './MacroRecorder.js';
import { AutocompleteEngine } from './AutocompleteEngine.js';

/**
 * Undo History for input
 */
class UndoHistory {
  constructor(maxSize = 100) {
    this.history = [];
    this.position = -1;
    this.maxSize = maxSize;
  }

  push(state) {
    this.history = this.history.slice(0, this.position + 1);
    this.history.push(state);
    if (this.history.length > this.maxSize) {
      this.history.shift();
    } else {
      this.position++;
    }
  }

  undo() {
    if (this.position > 0) {
      this.position--;
      return this.history[this.position];
    }
    return null;
  }

  redo() {
    if (this.position < this.history.length - 1) {
      this.position++;
      return this.history[this.position];
    }
    return null;
  }

  current() {
    return this.history[this.position] || '';
  }

  clear() {
    this.history = [];
    this.position = -1;
  }
}

/**
 * Unified Input Handler
 */
export class UnifiedInputHandler extends EventEmitter {
  #rl;
  #theme;
  #history;
  #autocomplete;
  #prompt;
  #multilineBuffer = [];
  #inMultilineMode = false;
  #closed = false;

  // Enhanced features
  #vim;
  #templates;
  #macros;
  #undoHistory;
  #clipboard = '';

  constructor(options = {}) {
    super();

    this.#theme = options.theme || themeRegistry.getCurrent();
    this.#history = options.history || null;
    this.#autocomplete = options.autocomplete || null;
    this.#prompt = options.prompt || DEFAULT_PROMPT;

    // Initialize enhanced features
    this.#vim = new VimModeHandler({ enabled: options.vimMode || false });
    this.#templates = options.templates || new TemplateExpander();
    this.#macros = options.macros || new MacroRecorder();
    this.#undoHistory = new UndoHistory();

    // Forward vim events
    this.#vim.on('modeChange', (mode) => {
      this.emit('vimModeChange', mode);
      eventBus.emit(EVENT_TYPES.MODE_CHANGE, { vimMode: mode });
    });

    this.#setupReadline();
  }

  /**
   * Setup readline interface
   */
  #setupReadline() {
    this.#rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
      completer: this.#autocomplete ? this.#handleCompletion.bind(this) : undefined
    });

    this.#rl.on('line', (line) => {
      this.emit('line', line);

      // Record macro action if recording
      if (this.#macros.isRecording) {
        this.#macros.recordAction({ type: 'input', data: line });
      }
    });

    this.#rl.on('close', () => {
      this.#closed = true;
      this.emit('close');
    });

    this.#rl.on('SIGINT', () => {
      if (this.#inMultilineMode) {
        this.#multilineBuffer = [];
        this.#inMultilineMode = false;
        console.log();
        this.emit('cancel');
      } else {
        this.emit('sigint');
      }
    });

    if (process.stdin.isTTY) {
      this.#setupKeyHandlers();
    }
  }

  /**
   * Setup keyboard handlers
   */
  #setupKeyHandlers() {
    const originalWrite = this.#rl._writeToOutput;
    this.#rl._writeToOutput = (str) => {
      // Add vim mode indicator
      if (str.includes(this.#prompt) && this.#vim.enabled) {
        const indicator = this.#vim.getModeIndicator();
        str = str.replace(this.#prompt, this.#theme.colors.dim(indicator) + ' ' + this.#theme.colors.prompt(this.#prompt));
      } else if (str.includes(this.#prompt)) {
        str = str.replace(this.#prompt, this.#theme.colors.prompt(this.#prompt));
      }
      originalWrite.call(this.#rl, str);
    };
  }

  /**
   * Handle tab completion
   */
  async #handleCompletion(line) {
    if (!this.#autocomplete) {
      return [[], line];
    }

    try {
      const result = await this.#autocomplete.complete(line, line.length);
      return [result.suggestions, line];
    } catch {
      return [[], line];
    }
  }

  /**
   * Read a single line of input
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
          if (this.#history && answer.trim()) {
            this.#history.add(answer);
          }

          // Save to undo history
          this.#undoHistory.push(answer);

          eventBus.emit(EVENT_TYPES.INPUT_SUBMIT, { value: answer });

          resolve({
            value: answer,
            multiline: false,
            cancelled: false
          });
        }
      );

      if (this.#history) {
        this.#history.resetPosition();
      }
    });
  }

  /**
   * Read multiline input
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

      // Cleanup function to remove listener
      const cleanup = () => {
        this.removeListener('sigint', sigintHandler);
      };

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

      const readLine = (isFirst) => {
        const currentPrompt = isFirst ? prompt : continuationPrompt;

        this.#rl.question(
          this.#theme.colors.prompt(currentPrompt),
          (line) => {
            if (line === '') {
              this.#inMultilineMode = false;
              cleanup(); // Remove sigint handler

              const value = this.#multilineBuffer.join('\n');

              if (this.#history && value.trim()) {
                this.#history.add(value);
              }

              this.#undoHistory.push(value);
              eventBus.emit(EVENT_TYPES.INPUT_SUBMIT, { value, multiline: true });

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

      this.once('sigint', sigintHandler);
      readLine(true);
    });
  }

  /**
   * Read with template expansion
   */
  async readWithTemplate(templateName, vars = {}) {
    const result = this.#templates.apply(templateName, vars);
    if (!result) {
      throw new Error(`Template not found: ${templateName}`);
    }

    if (result.unresolvedVars.length > 0) {
      // Prompt for missing variables
      for (const varName of result.unresolvedVars) {
        const { value } = await this.read(`${varName}: `);
        vars[varName] = value;
      }
      return this.#templates.apply(templateName, vars);
    }

    return result;
  }

  /**
   * Set the prompt string
   */
  setPrompt(prompt) {
    this.#prompt = prompt;
    this.#rl.setPrompt(this.#theme.colors.prompt(prompt));
  }

  /**
   * Get current prompt
   */
  getPrompt() {
    return this.#prompt;
  }

  /**
   * Write text to output
   */
  write(text) {
    process.stdout.write(text);
  }

  /**
   * Write line to output
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

  // ============ Vim Mode Methods ============

  /**
   * Enable vim mode
   */
  enableVimMode() {
    this.#vim.enable();
  }

  /**
   * Disable vim mode
   */
  disableVimMode() {
    this.#vim.disable();
  }

  /**
   * Toggle vim mode
   */
  toggleVimMode() {
    return this.#vim.toggle();
  }

  /**
   * Get vim mode status
   */
  get vimEnabled() {
    return this.#vim.enabled;
  }

  /**
   * Get current vim mode
   */
  get vimMode() {
    return this.#vim.getMode();
  }

  // ============ Template Methods ============

  /**
   * Get templates manager
   */
  get templates() {
    return this.#templates;
  }

  // ============ Macro Methods ============

  /**
   * Start macro recording
   */
  startMacroRecording(name) {
    this.#macros.startRecording(name);
  }

  /**
   * Stop macro recording
   */
  stopMacroRecording() {
    return this.#macros.stopRecording();
  }

  /**
   * Execute a macro
   */
  async executeMacro(name) {
    return this.#macros.execute(name);
  }

  /**
   * Get macros manager
   */
  get macros() {
    return this.#macros;
  }

  // ============ Undo/Redo Methods ============

  /**
   * Undo last input
   */
  undo() {
    return this.#undoHistory.undo();
  }

  /**
   * Redo last undo
   */
  redo() {
    return this.#undoHistory.redo();
  }

  // ============ Clipboard Methods ============

  /**
   * Copy to clipboard
   */
  copy(text) {
    this.#clipboard = text;
    this.#vim.setRegister('"', text);
  }

  /**
   * Paste from clipboard
   */
  paste() {
    return this.#clipboard || this.#vim.getRegister('"');
  }

  // ============ Getters/Setters ============

  get isClosed() {
    return this.#closed;
  }

  get history() {
    return this.#history;
  }

  set history(history) {
    this.#history = history;
  }

  get autocomplete() {
    return this.#autocomplete;
  }

  set autocomplete(autocomplete) {
    this.#autocomplete = autocomplete;
  }

  get theme() {
    return this.#theme;
  }

  set theme(theme) {
    this.#theme = theme;
  }

  get isMultiline() {
    return this.#inMultilineMode;
  }
}

export function createInputHandler(options) {
  return new UnifiedInputHandler(options);
}

// Re-export sub-modules
export { VimModeHandler, VIM_MODES } from './VimModeHandler.js';
export { TemplateExpander, BUILTIN_TEMPLATES } from './TemplateExpander.js';
export { MacroRecorder } from './MacroRecorder.js';
export { AutocompleteEngine } from './AutocompleteEngine.js';

// Export new enhancements
export {
  GhostTextPreview,
  ExternalEditor,
  KeyboardShortcuts,
  FilePreview,
  ContextProgress,
  createGhostTextPreview,
  createExternalEditor,
  createKeyboardShortcuts,
  createFilePreview,
  createContextProgress
} from './InputEnhancements.js';

export default UnifiedInputHandler;
