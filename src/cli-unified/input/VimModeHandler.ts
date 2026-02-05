/**
 * Vim Mode Handler for CLI input
 * Based on src/cli-enhanced/input-enhancer.js vim mode features
 * @module cli-unified/input/VimModeHandler
 */

import { EventEmitter } from 'events';
import { KEYS } from '../core/constants.js';

/**
 * Vim modes
 */
export const VIM_MODES = {
  NORMAL: 'normal',
  INSERT: 'insert',
  VISUAL: 'visual',
  COMMAND: 'command'
};

/**
 * Vim Mode Handler
 */
export class VimModeHandler extends EventEmitter {
  constructor(options = {}) {
    super();

    this.enabled = options.enabled ?? false;
    this.mode = VIM_MODES.INSERT;
    this.buffer = '';
    this.commandBuffer = '';
    this.visualStart = 0;
    this.visualEnd = 0;
    this.count = '';
    this.lastCommand = '';
    this.registers = new Map();
    this.registers.set('"', ''); // Default register
  }

  /**
   * Enable vim mode
   */
  enable() {
    this.enabled = true;
    this.mode = VIM_MODES.NORMAL;
    this.emit('modeChange', this.mode);
  }

  /**
   * Disable vim mode
   */
  disable() {
    this.enabled = false;
    this.mode = VIM_MODES.INSERT;
    this.emit('modeChange', this.mode);
  }

  /**
   * Toggle vim mode
   */
  toggle() {
    if (this.enabled) {
      this.disable();
    } else {
      this.enable();
    }
    return this.enabled;
  }

  /**
   * Process key input
   * @returns {{ action: string, payload?: any } | null}
   */
  processKey(key, input, cursorPos) {
    if (!this.enabled) return null;

    switch (this.mode) {
      case VIM_MODES.NORMAL:
        return this.processNormalMode(key, input, cursorPos);
      case VIM_MODES.INSERT:
        return this.processInsertMode(key, input, cursorPos);
      case VIM_MODES.VISUAL:
        return this.processVisualMode(key, input, cursorPos);
      case VIM_MODES.COMMAND:
        return this.processCommandMode(key, input, cursorPos);
      default:
        return null;
    }
  }

  /**
   * Process normal mode keys
   */
  processNormalMode(key, input, cursorPos) {
    // Count prefix
    if (/[0-9]/.test(key) && (this.count || key !== '0')) {
      this.count += key;
      return null;
    }

    const count = parseInt(this.count) || 1;
    this.count = '';

    // Movement commands
    switch (key) {
      // Enter insert mode
      case 'i':
        this.setMode(VIM_MODES.INSERT);
        return { action: 'mode', payload: { mode: 'insert' } };

      case 'I':
        this.setMode(VIM_MODES.INSERT);
        return { action: 'cursor', payload: { position: 0 } };

      case 'a':
        this.setMode(VIM_MODES.INSERT);
        return { action: 'cursor', payload: { position: cursorPos + 1 } };

      case 'A':
        this.setMode(VIM_MODES.INSERT);
        return { action: 'cursor', payload: { position: input.length } };

      case 'o':
        this.setMode(VIM_MODES.INSERT);
        return { action: 'newline', payload: { after: true } };

      case 'O':
        this.setMode(VIM_MODES.INSERT);
        return { action: 'newline', payload: { after: false } };

      // Movement
      case 'h':
      case KEYS.LEFT:
        return { action: 'cursor', payload: { position: Math.max(0, cursorPos - count) } };

      case 'l':
      case KEYS.RIGHT:
        return { action: 'cursor', payload: { position: Math.min(input.length, cursorPos + count) } };

      case 'j':
      case KEYS.DOWN:
        return { action: 'history', payload: { direction: 'next' } };

      case 'k':
      case KEYS.UP:
        return { action: 'history', payload: { direction: 'prev' } };

      case '0':
        return { action: 'cursor', payload: { position: 0 } };

      case '$':
        return { action: 'cursor', payload: { position: input.length } };

      case 'w':
        return { action: 'cursor', payload: { position: this.findNextWord(input, cursorPos, count) } };

      case 'b':
        return { action: 'cursor', payload: { position: this.findPrevWord(input, cursorPos, count) } };

      case 'e':
        return { action: 'cursor', payload: { position: this.findWordEnd(input, cursorPos, count) } };

      // Delete
      case 'x':
        const deleteEnd = Math.min(input.length, cursorPos + count);
        this.registers.set('"', input.slice(cursorPos, deleteEnd));
        return { action: 'delete', payload: { start: cursorPos, end: deleteEnd } };

      case 'X':
        const deleteStart = Math.max(0, cursorPos - count);
        this.registers.set('"', input.slice(deleteStart, cursorPos));
        return { action: 'delete', payload: { start: deleteStart, end: cursorPos } };

      case 'd':
        this.buffer = 'd';
        return null;

      case 'c':
        this.buffer = 'c';
        return null;

      case 'y':
        this.buffer = 'y';
        return null;

      // Paste
      case 'p':
        const pasteContent = this.registers.get('"') || '';
        return { action: 'paste', payload: { content: pasteContent, after: true } };

      case 'P':
        const pasteContentBefore = this.registers.get('"') || '';
        return { action: 'paste', payload: { content: pasteContentBefore, after: false } };

      // Visual mode
      case 'v':
        this.setMode(VIM_MODES.VISUAL);
        this.visualStart = cursorPos;
        this.visualEnd = cursorPos;
        return { action: 'visual', payload: { start: cursorPos, end: cursorPos } };

      // Command mode
      case ':':
        this.setMode(VIM_MODES.COMMAND);
        this.commandBuffer = '';
        return { action: 'command', payload: { start: true } };

      // Undo/Redo
      case 'u':
        return { action: 'undo' };

      case KEYS.CTRL_R:
        return { action: 'redo' };

      // Search
      case '/':
        this.setMode(VIM_MODES.COMMAND);
        this.commandBuffer = '/';
        return { action: 'search', payload: { start: true } };

      // Replace
      case 'r':
        this.buffer = 'r';
        return null;

      // Submit
      case KEYS.ENTER:
        return { action: 'submit' };

      default:
        // Handle compound commands
        if (this.buffer) {
          return this.processCompoundCommand(this.buffer + key, input, cursorPos, count);
        }
        return null;
    }
  }

  /**
   * Process compound commands (dd, yy, cc, etc.)
   */
  processCompoundCommand(cmd, input, cursorPos, count) {
    this.buffer = '';

    switch (cmd) {
      case 'dd':
        this.registers.set('"', input);
        return { action: 'delete', payload: { start: 0, end: input.length } };

      case 'yy':
        this.registers.set('"', input);
        return { action: 'yank', payload: { content: input } };

      case 'cc':
        this.registers.set('"', input);
        this.setMode(VIM_MODES.INSERT);
        return { action: 'delete', payload: { start: 0, end: input.length } };

      case 'dw':
        const wordEnd = this.findNextWord(input, cursorPos, count);
        this.registers.set('"', input.slice(cursorPos, wordEnd));
        return { action: 'delete', payload: { start: cursorPos, end: wordEnd } };

      case 'db':
        const wordStart = this.findPrevWord(input, cursorPos, count);
        this.registers.set('"', input.slice(wordStart, cursorPos));
        return { action: 'delete', payload: { start: wordStart, end: cursorPos } };

      case 'd$':
        this.registers.set('"', input.slice(cursorPos));
        return { action: 'delete', payload: { start: cursorPos, end: input.length } };

      case 'd0':
        this.registers.set('"', input.slice(0, cursorPos));
        return { action: 'delete', payload: { start: 0, end: cursorPos } };

      default:
        // Replace single character
        if (cmd.startsWith('r') && cmd.length === 2) {
          const newChar = cmd[1];
          return { action: 'replace', payload: { position: cursorPos, char: newChar } };
        }
        return null;
    }
  }

  /**
   * Process insert mode keys
   */
  processInsertMode(key, input, cursorPos) {
    if (key === KEYS.ESCAPE) {
      this.setMode(VIM_MODES.NORMAL);
      return { action: 'mode', payload: { mode: 'normal' } };
    }

    // Let normal input handling take over
    return null;
  }

  /**
   * Process visual mode keys
   */
  processVisualMode(key, input, cursorPos) {
    switch (key) {
      case KEYS.ESCAPE:
        this.setMode(VIM_MODES.NORMAL);
        return { action: 'mode', payload: { mode: 'normal' } };

      case 'h':
      case KEYS.LEFT:
        this.visualEnd = Math.max(0, this.visualEnd - 1);
        return { action: 'visual', payload: { start: this.visualStart, end: this.visualEnd } };

      case 'l':
      case KEYS.RIGHT:
        this.visualEnd = Math.min(input.length, this.visualEnd + 1);
        return { action: 'visual', payload: { start: this.visualStart, end: this.visualEnd } };

      case 'y':
        const [start, end] = [Math.min(this.visualStart, this.visualEnd), Math.max(this.visualStart, this.visualEnd)];
        this.registers.set('"', input.slice(start, end + 1));
        this.setMode(VIM_MODES.NORMAL);
        return { action: 'yank', payload: { content: input.slice(start, end + 1) } };

      case 'd':
      case 'x':
        const [delStart, delEnd] = [Math.min(this.visualStart, this.visualEnd), Math.max(this.visualStart, this.visualEnd)];
        this.registers.set('"', input.slice(delStart, delEnd + 1));
        this.setMode(VIM_MODES.NORMAL);
        return { action: 'delete', payload: { start: delStart, end: delEnd + 1 } };

      default:
        return null;
    }
  }

  /**
   * Process command mode keys
   */
  processCommandMode(key, input, cursorPos) {
    if (key === KEYS.ESCAPE) {
      this.setMode(VIM_MODES.NORMAL);
      this.commandBuffer = '';
      return { action: 'mode', payload: { mode: 'normal' } };
    }

    if (key === KEYS.ENTER) {
      const cmd = this.commandBuffer;
      this.commandBuffer = '';
      this.setMode(VIM_MODES.NORMAL);
      return { action: 'execute', payload: { command: cmd } };
    }

    if (key === KEYS.BACKSPACE) {
      this.commandBuffer = this.commandBuffer.slice(0, -1);
      if (this.commandBuffer.length === 0) {
        this.setMode(VIM_MODES.NORMAL);
        return { action: 'mode', payload: { mode: 'normal' } };
      }
      return { action: 'commandUpdate', payload: { command: this.commandBuffer } };
    }

    this.commandBuffer += key;
    return { action: 'commandUpdate', payload: { command: this.commandBuffer } };
  }

  /**
   * Set mode
   */
  setMode(mode) {
    this.mode = mode;
    this.emit('modeChange', mode);
  }

  /**
   * Find next word position
   */
  findNextWord(input, pos, count = 1) {
    let p = pos;
    for (let i = 0; i < count; i++) {
      // Skip current word
      while (p < input.length && /\w/.test(input[p])) p++;
      // Skip whitespace
      while (p < input.length && /\s/.test(input[p])) p++;
    }
    return p;
  }

  /**
   * Find previous word position
   */
  findPrevWord(input, pos, count = 1) {
    let p = pos;
    for (let i = 0; i < count; i++) {
      // Skip whitespace
      while (p > 0 && /\s/.test(input[p - 1])) p--;
      // Skip word
      while (p > 0 && /\w/.test(input[p - 1])) p--;
    }
    return p;
  }

  /**
   * Find word end position
   */
  findWordEnd(input, pos, count = 1) {
    let p = pos;
    for (let i = 0; i < count; i++) {
      p++;
      // Skip whitespace
      while (p < input.length && /\s/.test(input[p])) p++;
      // Skip to end of word
      while (p < input.length && /\w/.test(input[p + 1])) p++;
    }
    return Math.min(p, input.length - 1);
  }

  /**
   * Get current mode
   */
  getMode() {
    return this.mode;
  }

  /**
   * Get mode indicator for prompt
   */
  getModeIndicator() {
    if (!this.enabled) return '';

    switch (this.mode) {
      case VIM_MODES.NORMAL:
        return '[N]';
      case VIM_MODES.INSERT:
        return '[I]';
      case VIM_MODES.VISUAL:
        return '[V]';
      case VIM_MODES.COMMAND:
        return '[:]';
      default:
        return '';
    }
  }

  /**
   * Get register content
   */
  getRegister(name = '"') {
    return this.registers.get(name) || '';
  }

  /**
   * Set register content
   */
  setRegister(name, content) {
    this.registers.set(name, content);
  }
}

export function createVimHandler(options) {
  return new VimModeHandler(options);
}

export default VimModeHandler;
