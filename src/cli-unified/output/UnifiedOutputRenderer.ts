/**
 * Unified Output Renderer - Facade for all output components
 * @module cli-unified/output/UnifiedOutputRenderer
 */

import { themeRegistry } from '../core/ThemeRegistry.js';
import { eventBus, EVENT_TYPES } from '../core/EventBus.js';
import { Spinner, createSpinner, createTypedSpinner, createProgressBar, createMultiSpinner, SpinnerTypes, getAvailableSpinnerTypes } from './SpinnerSystem.js';
import { BorderRenderer, quickBox, quickPanel, createBorderRenderer } from './BorderRenderer.js';
import { MarkdownRenderer, createMarkdownRenderer } from './MarkdownRenderer.js';
import { TableRenderer, ListRenderer, createTableRenderer, createListRenderer, renderTable, renderList, TABLE_STYLES, LIST_STYLES } from './TableRenderer.js';
import { StreamingRenderer, ProgressIndicator, CollapsibleSection, createStreamingRenderer, createProgressIndicator } from './StreamingRenderer.js';
import { ANSI } from '../core/constants.js';

/**
 * Unified Output Renderer - Main facade class
 */
export class UnifiedOutputRenderer {
  constructor(options = {}) {
    this.theme = options.theme || themeRegistry.getCurrent();
    this.width = options.width || process.stdout.columns || 80;

    // Initialize sub-renderers
    this.markdown = new MarkdownRenderer({ theme: this.theme, width: this.width });
    this.border = new BorderRenderer({ theme: this.theme, width: this.width });
    this.table = new TableRenderer({ theme: this.theme });
    this.list = new ListRenderer({ theme: this.theme });
    this.streaming = new StreamingRenderer({ theme: this.theme, maxWidth: this.width });

    // Active spinner reference
    this.activeSpinner = null;
  }

  /**
   * Update theme
   */
  setTheme(themeName) {
    this.theme = themeRegistry.set(themeName);
    this.markdown.theme = this.theme;
    this.border.theme = this.theme;
    this.table.theme = this.theme;
    this.list.theme = this.theme;
    this.streaming.theme = this.theme;
    eventBus.emit(EVENT_TYPES.THEME_CHANGE, { theme: themeName });
  }

  // ============================================================================
  // MESSAGE METHODS
  // ============================================================================

  /**
   * Print success message
   */
  success(message, options = {}) {
    const symbol = this.theme.symbols.check || '✔';
    const formatted = `${this.theme.colors.success(symbol)} ${message}`;
    this.print(formatted, options);
    eventBus.emit(EVENT_TYPES.RENDER_OUTPUT, { type: 'success', message });
  }

  /**
   * Print error message
   */
  error(message, options = {}) {
    const symbol = this.theme.symbols.cross || '✘';
    const formatted = `${this.theme.colors.error(symbol)} ${message}`;
    this.print(formatted, options);
    eventBus.emit(EVENT_TYPES.RENDER_ERROR, { message });
  }

  /**
   * Print warning message
   */
  warning(message, options = {}) {
    const symbol = this.theme.symbols.warning || '⚠';
    const formatted = `${this.theme.colors.warning(symbol)} ${message}`;
    this.print(formatted, options);
  }

  /**
   * Print info message
   */
  info(message, options = {}) {
    const symbol = this.theme.symbols.info || 'ℹ';
    const formatted = `${this.theme.colors.info(symbol)} ${message}`;
    this.print(formatted, options);
  }

  /**
   * Print dimmed/muted message
   */
  dim(message, options = {}) {
    this.print(this.theme.colors.dim(message), options);
  }

  /**
   * Print highlighted message
   */
  highlight(message, options = {}) {
    this.print(this.theme.colors.highlight(message), options);
  }

  /**
   * Print raw message
   */
  print(message, options = {}) {
    if (options.newline !== false) {
      console.log(message);
    } else {
      process.stdout.write(message);
    }
  }

  /**
   * Print empty line
   */
  newline(count = 1) {
    for (let i = 0; i < count; i++) {
      console.log();
    }
  }

  // ============================================================================
  // SPINNER METHODS
  // ============================================================================

  /**
   * Start a spinner
   */
  startSpinner(text, options = {}) {
    if (this.activeSpinner) {
      this.activeSpinner.stop();
    }
    this.activeSpinner = createSpinner({ text, ...options, theme: this.theme });
    this.activeSpinner.start();
    eventBus.emit(EVENT_TYPES.SPINNER_START, { text });
    return this.activeSpinner;
  }

  /**
   * Stop active spinner with success
   */
  stopSpinnerSuccess(text) {
    if (this.activeSpinner) {
      this.activeSpinner.succeed(text);
      eventBus.emit(EVENT_TYPES.SPINNER_STOP, { success: true, text });
      this.activeSpinner = null;
    }
  }

  /**
   * Stop active spinner with failure
   */
  stopSpinnerFail(text) {
    if (this.activeSpinner) {
      this.activeSpinner.fail(text);
      eventBus.emit(EVENT_TYPES.SPINNER_STOP, { success: false, text });
      this.activeSpinner = null;
    }
  }

  /**
   * Stop active spinner silently
   */
  stopSpinner() {
    if (this.activeSpinner) {
      this.activeSpinner.stop();
      eventBus.emit(EVENT_TYPES.SPINNER_STOP, {});
      this.activeSpinner = null;
    }
  }

  /**
   * Update spinner text
   */
  updateSpinner(text) {
    if (this.activeSpinner) {
      this.activeSpinner.text(text);
    }
  }

  // ============================================================================
  // BOX/PANEL METHODS
  // ============================================================================

  /**
   * Render a box
   */
  box(content, options = {}) {
    const rendered = this.border.box(content, options);
    this.print(rendered);
    return rendered;
  }

  /**
   * Render a panel with header
   */
  panel(header, content, options = {}) {
    const rendered = this.border.panel(header, content, options);
    this.print(rendered);
    return rendered;
  }

  /**
   * Render multiple sections
   */
  sections(sectionsData, options = {}) {
    const rendered = this.border.sections(sectionsData, options);
    this.print(rendered);
    return rendered;
  }

  /**
   * Render divider
   */
  divider(text, options = {}) {
    const rendered = this.border.divider(text, options);
    this.print(rendered);
    return rendered;
  }

  // ============================================================================
  // MARKDOWN METHODS
  // ============================================================================

  /**
   * Render markdown content
   */
  renderMarkdown(content) {
    const rendered = this.markdown.render(content);
    this.print(rendered);
    return rendered;
  }

  // ============================================================================
  // TABLE/LIST METHODS
  // ============================================================================

  /**
   * Render a table
   */
  renderTable(headers, rows, options = {}) {
    const rendered = this.table.render(headers, rows, options);
    this.print(rendered);
    return rendered;
  }

  /**
   * Render key-value table
   */
  renderKeyValue(data, options = {}) {
    const rendered = this.table.renderKeyValue(data, options);
    this.print(rendered);
    return rendered;
  }

  /**
   * Render a list
   */
  renderList(items, options = {}) {
    const rendered = this.list.render(items, options);
    this.print(rendered);
    return rendered;
  }

  // ============================================================================
  // STREAMING METHODS
  // ============================================================================

  /**
   * Write streaming content
   */
  streamWrite(token) {
    this.streaming.write(token);
  }

  /**
   * Flush streaming buffer
   */
  streamFlush() {
    this.streaming.flush();
  }

  /**
   * Reset streaming state
   */
  streamReset() {
    this.streaming.reset();
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Clear screen
   */
  clear() {
    process.stdout.write(ANSI.CLEAR_SCREEN + ANSI.CURSOR_HOME);
  }

  /**
   * Clear current line
   */
  clearLine() {
    process.stdout.write('\r' + ANSI.CLEAR_LINE);
  }

  /**
   * Get terminal width
   */
  getWidth() {
    return process.stdout.columns || this.width;
  }

  /**
   * Create progress indicator for stages
   */
  createProgressIndicator(stages) {
    return createProgressIndicator(stages, { theme: this.theme });
  }

  /**
   * Create collapsible section
   */
  createCollapsibleSection(title, options = {}) {
    return new CollapsibleSection(title, { theme: this.theme, ...options });
  }
}

// Factory function
export function createOutputRenderer(options = {}) {
  return new UnifiedOutputRenderer(options);
}

// Re-export all components for direct access
export {
  Spinner,
  createSpinner,
  createTypedSpinner,
  createProgressBar,
  createMultiSpinner,
  SpinnerTypes,
  getAvailableSpinnerTypes,
  BorderRenderer,
  quickBox,
  quickPanel,
  createBorderRenderer,
  MarkdownRenderer,
  createMarkdownRenderer,
  TableRenderer,
  ListRenderer,
  createTableRenderer,
  createListRenderer,
  renderTable,
  renderList,
  TABLE_STYLES,
  LIST_STYLES,
  StreamingRenderer,
  ProgressIndicator,
  CollapsibleSection,
  createStreamingRenderer,
  createProgressIndicator
};

export default UnifiedOutputRenderer;
