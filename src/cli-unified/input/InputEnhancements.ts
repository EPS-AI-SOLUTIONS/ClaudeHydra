/**
 * Input Enhancements - Advanced input features
 * Features: Inline Preview, External Editor, Keyboard Shortcuts, File Preview
 * @module cli-unified/input/InputEnhancements
 */

import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { safeSpawn, safeWhich } from '../../security/safe-command.js';
import { themeRegistry } from '../core/ThemeRegistry.js';

/**
 * Ghost Text Preview - shows predicted completion
 */
export class GhostTextPreview {
  constructor(options = {}) {
    this.theme = options.theme || themeRegistry.getCurrent();
    this.enabled = options.enabled ?? true;
    this.debounceMs = options.debounceMs || 300;
    this.minLength = options.minLength || 3;
    this.predictor = options.predictor || null;

    this._timeout = null;
    this._lastInput = '';
    this._ghostText = '';
  }

  /**
   * Set predictor function (async)
   */
  setPredictor(fn) {
    this.predictor = fn;
  }

  /**
   * Update ghost text based on input
   */
  async update(input) {
    if (!this.enabled || !this.predictor || input.length < this.minLength) {
      this._ghostText = '';
      return '';
    }

    // Debounce
    if (this._timeout) {
      clearTimeout(this._timeout);
    }

    return new Promise((resolve) => {
      this._timeout = setTimeout(async () => {
        try {
          if (input !== this._lastInput) {
            this._lastInput = input;
            const prediction = await this.predictor(input);
            this._ghostText = prediction || '';
          }
          resolve(this._ghostText);
        } catch {
          this._ghostText = '';
          resolve('');
        }
      }, this.debounceMs);
    });
  }

  /**
   * Get current ghost text
   */
  get() {
    return this._ghostText;
  }

  /**
   * Clear ghost text
   */
  clear() {
    this._ghostText = '';
    this._lastInput = '';
    if (this._timeout) {
      clearTimeout(this._timeout);
      this._timeout = null;
    }
  }

  /**
   * Render input with ghost text
   */
  render(input) {
    if (!this._ghostText || !this._ghostText.startsWith(input)) {
      return input;
    }

    const ghost = this._ghostText.slice(input.length);
    return input + this.theme.colors.dim(ghost);
  }

  /**
   * Accept ghost text
   */
  accept() {
    const result = this._ghostText;
    this.clear();
    return result;
  }
}

/**
 * External Editor Support
 */
export class ExternalEditor {
  constructor(options = {}) {
    this.editor =
      options.editor || process.env.EDITOR || process.env.VISUAL || this._detectEditor();
    this.tempDir = options.tempDir || tmpdir();
    this.extension = options.extension || '.md';
  }

  _detectEditor() {
    // SECURITY FIX: Use safeWhich() instead of unsanitized execSync.
    // Each editor name is validated against a strict alphanumeric pattern
    // before being passed to which/where.
    const editors = ['code', 'vim', 'nano', 'notepad', 'notepad++'];
    for (const editor of editors) {
      const found = safeWhich(editor);
      if (found) return editor;
    }
    return process.platform === 'win32' ? 'notepad' : 'nano';
  }

  /**
   * Open editor with initial content
   */
  async edit(initialContent = '', _options = {}) {
    const tempFile = join(this.tempDir, `claude-input-${Date.now()}${this.extension}`);

    // Write initial content
    writeFileSync(tempFile, initialContent, 'utf-8');

    return new Promise((resolve, reject) => {
      // SECURITY FIX: Use safeSpawn() with shell: false (enforced internally).
      // The editor name was validated during construction or _detectEditor().
      // Arguments are passed as array, preventing shell injection.
      const editorProcess = safeSpawn(this.editor, [tempFile], {
        inheritStdio: true,
        spawnOptions: {},
      });

      editorProcess.on('close', (code) => {
        try {
          if (code === 0 && existsSync(tempFile)) {
            const content = readFileSync(tempFile, 'utf-8');
            unlinkSync(tempFile);
            resolve(content.trim());
          } else {
            if (existsSync(tempFile)) unlinkSync(tempFile);
            resolve(initialContent); // Return original on cancel
          }
        } catch (error) {
          reject(error);
        }
      });

      editorProcess.on('error', (error) => {
        if (existsSync(tempFile)) unlinkSync(tempFile);
        reject(error);
      });
    });
  }

  /**
   * Get current editor
   */
  getEditor() {
    return this.editor;
  }

  /**
   * Set editor
   */
  setEditor(editor) {
    this.editor = editor;
  }
}

/**
 * Enhanced Keyboard Shortcuts Manager
 */
export class KeyboardShortcuts extends EventEmitter {
  constructor(_options = {}) {
    super();
    this.shortcuts = new Map();
    this.enabled = true;

    // Register default shortcuts
    this._registerDefaults();
  }

  _registerDefaults() {
    // Ctrl+U: Clear line
    this.register('ctrl+u', 'clearLine', 'Clear current line');

    // Ctrl+R: Reverse search
    this.register('ctrl+r', 'reverseSearch', 'Search history backwards');

    // Ctrl+T: Toggle mode
    this.register('ctrl+t', 'toggleMode', 'Toggle CLI mode');

    // Alt+Enter: Multiline
    this.register('alt+enter', 'multiline', 'Enter multiline mode');

    // Ctrl+L: Clear screen
    this.register('ctrl+l', 'clearScreen', 'Clear screen');

    // Ctrl+D: Exit
    this.register('ctrl+d', 'exit', 'Exit CLI');

    // Tab: Autocomplete
    this.register('tab', 'autocomplete', 'Autocomplete');

    // Ctrl+Space: Ghost accept
    this.register('ctrl+space', 'acceptGhost', 'Accept ghost text');

    // Ctrl+E: External editor
    this.register('ctrl+e', 'externalEditor', 'Open external editor');

    // Ctrl+P: File preview
    this.register('ctrl+p', 'filePreview', 'Preview file at cursor');

    // F1: Help
    this.register('f1', 'help', 'Show shortcuts help');
  }

  /**
   * Register a shortcut
   */
  register(key, action, description = '') {
    this.shortcuts.set(key.toLowerCase(), { action, description });
    return this;
  }

  /**
   * Unregister a shortcut
   */
  unregister(key) {
    return this.shortcuts.delete(key.toLowerCase());
  }

  /**
   * Handle keypress
   */
  handle(key, ctrl = false, meta = false, shift = false) {
    if (!this.enabled) return null;

    const keyName = this._normalizeKey(key, ctrl, meta, shift);
    const shortcut = this.shortcuts.get(keyName);

    if (shortcut) {
      this.emit('shortcut', shortcut.action, keyName);
      return shortcut.action;
    }

    return null;
  }

  _normalizeKey(key, ctrl, meta, shift) {
    const parts = [];
    if (ctrl) parts.push('ctrl');
    if (meta) parts.push('alt');
    if (shift) parts.push('shift');
    parts.push(key.toLowerCase());
    return parts.join('+');
  }

  /**
   * Get all shortcuts
   */
  list() {
    const result = [];
    for (const [key, { action, description }] of this.shortcuts) {
      result.push({ key, action, description });
    }
    return result;
  }

  /**
   * Get formatted help
   */
  getHelp() {
    const shortcuts = this.list();
    const maxKey = Math.max(...shortcuts.map((s) => s.key.length));

    return shortcuts.map((s) => `  ${s.key.padEnd(maxKey + 2)} ${s.description}`).join('\n');
  }
}

/**
 * File Preview - shows file content preview
 */
export class FilePreview {
  constructor(options = {}) {
    this.theme = options.theme || themeRegistry.getCurrent();
    this.maxLines = options.maxLines || 10;
    this.maxWidth = options.maxWidth || 60;
  }

  /**
   * Extract file path from input at cursor position
   */
  extractPath(input, cursorPos) {
    const beforeCursor = input.slice(0, cursorPos);
    const afterCursor = input.slice(cursorPos);

    // Match file path patterns
    const patterns = [
      /([a-zA-Z]:\\[^\s"'<>|]*)/, // Windows absolute
      /(\/[^\s"'<>|]+)/, // Unix absolute
      /(\.[^\s"'<>|]+)/, // Relative
      /([^\s"'<>|]+\.[a-zA-Z0-9]+)/, // File with extension
    ];

    for (const pattern of patterns) {
      const matchBefore = beforeCursor.match(new RegExp(`${pattern.source}$`));
      const matchAfter = afterCursor.match(new RegExp(`^${pattern.source}`));

      if (matchBefore || matchAfter) {
        const pathBefore = matchBefore ? matchBefore[1] : '';
        const pathAfter = matchAfter ? matchAfter[1] : '';
        return pathBefore + pathAfter;
      }
    }

    return null;
  }

  /**
   * Preview file content
   */
  async preview(filePath) {
    try {
      if (!existsSync(filePath)) {
        return { error: 'File not found', path: filePath };
      }

      const stats = statSync(filePath);

      if (stats.isDirectory()) {
        return {
          type: 'directory',
          path: filePath,
          size: 'directory',
        };
      }

      if (stats.size > 1024 * 1024) {
        return {
          type: 'file',
          path: filePath,
          size: this._formatSize(stats.size),
          preview: '[File too large to preview]',
        };
      }

      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').slice(0, this.maxLines);
      const truncated = content.split('\n').length > this.maxLines;

      return {
        type: 'file',
        path: filePath,
        size: this._formatSize(stats.size),
        modified: stats.mtime,
        lines: lines.length,
        totalLines: content.split('\n').length,
        preview: lines.map((l) => l.slice(0, this.maxWidth)).join('\n'),
        truncated,
        extension: filePath.split('.').pop(),
      };
    } catch (error) {
      return { error: error.message, path: filePath };
    }
  }

  _formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
      bytes /= 1024;
      i++;
    }
    return `${bytes.toFixed(1)} ${units[i]}`;
  }

  /**
   * Render preview box
   */
  render(previewData) {
    const colors = this.theme.colors;
    const lines = [];

    if (previewData.error) {
      lines.push(colors.error(`✘ ${previewData.error}`));
      return lines.join('\n');
    }

    // Header
    lines.push(colors.primary(`┌─ ${previewData.path} ─┐`));
    lines.push(colors.dim(`│ Size: ${previewData.size} | Lines: ${previewData.totalLines || '?'}`));
    lines.push(colors.primary(`├${'─'.repeat(this.maxWidth)}┤`));

    // Content
    if (previewData.preview) {
      for (const line of previewData.preview.split('\n')) {
        lines.push(colors.dim('│ ') + line);
      }
    }

    if (previewData.truncated) {
      lines.push(colors.dim('│ ...'));
    }

    lines.push(colors.primary(`└${'─'.repeat(this.maxWidth)}┘`));

    return lines.join('\n');
  }
}

/**
 * Context Progress Indicator - shows token usage
 */
export class ContextProgress {
  constructor(options = {}) {
    this.theme = options.theme || themeRegistry.getCurrent();
    this.maxTokens = options.maxTokens || 128000;
    this.warningThreshold = options.warningThreshold || 0.8;
    this.currentTokens = 0;
  }

  /**
   * Update token count
   */
  update(tokens) {
    this.currentTokens = tokens;
  }

  /**
   * Add tokens
   */
  add(tokens) {
    this.currentTokens += tokens;
  }

  /**
   * Estimate tokens from text (rough: 4 chars ≈ 1 token)
   */
  estimate(text) {
    return Math.ceil(text.length / 4);
  }

  /**
   * Get usage percentage
   */
  getPercentage() {
    return (this.currentTokens / this.maxTokens) * 100;
  }

  /**
   * Check if warning threshold reached
   */
  isWarning() {
    return this.currentTokens / this.maxTokens >= this.warningThreshold;
  }

  /**
   * Check if near limit
   */
  isNearLimit() {
    return this.currentTokens / this.maxTokens >= 0.95;
  }

  /**
   * Render progress bar
   */
  render(width = 30) {
    const colors = this.theme.colors;
    const percent = this.getPercentage();
    const filled = Math.round((width * percent) / 100);
    const empty = width - filled;

    let barColor = colors.success;
    if (this.isNearLimit()) {
      barColor = colors.error;
    } else if (this.isWarning()) {
      barColor = colors.warning;
    }

    const bar = barColor('█'.repeat(filled)) + colors.dim('░'.repeat(empty));
    const label = `${this.currentTokens.toLocaleString()}/${this.maxTokens.toLocaleString()} tokens (${percent.toFixed(1)}%)`;

    return `[${bar}] ${colors.dim(label)}`;
  }

  /**
   * Render compact indicator
   */
  renderCompact() {
    const colors = this.theme.colors;
    const percent = this.getPercentage();

    let color = colors.success;
    let icon = '●';

    if (this.isNearLimit()) {
      color = colors.error;
      icon = '◉';
    } else if (this.isWarning()) {
      color = colors.warning;
      icon = '◎';
    }

    return color(`${icon} ${percent.toFixed(0)}%`);
  }

  /**
   * Reset counter
   */
  reset() {
    this.currentTokens = 0;
  }
}

// Factory functions
export function createGhostTextPreview(options) {
  return new GhostTextPreview(options);
}

export function createExternalEditor(options) {
  return new ExternalEditor(options);
}

export function createKeyboardShortcuts(options) {
  return new KeyboardShortcuts(options);
}

export function createFilePreview(options) {
  return new FilePreview(options);
}

export function createContextProgress(options) {
  return new ContextProgress(options);
}

export default {
  GhostTextPreview,
  ExternalEditor,
  KeyboardShortcuts,
  FilePreview,
  ContextProgress,
};
