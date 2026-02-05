/**
 * Streaming Renderer for real-time output
 * Based on src/cli-enhanced/ui-renderer.js streaming features
 * @module cli-unified/output/StreamingRenderer
 */

import { themeRegistry } from '../core/ThemeRegistry.js';
import { ANSI } from '../core/constants.js';

/**
 * Streaming Renderer for token-by-token output
 */
export class StreamingRenderer {
  constructor(options = {}) {
    this.theme = options.theme || themeRegistry.getCurrent();
    this.buffer = '';
    this.lineBuffer = '';
    this.inCodeBlock = false;
    this.codeBlockLang = '';
    this.currentLine = 0;
    this.maxWidth = options.maxWidth || process.stdout.columns || 80;
  }

  /**
   * Process incoming token
   */
  write(token) {
    this.buffer += token;

    // Process complete lines
    while (this.buffer.includes('\n')) {
      const idx = this.buffer.indexOf('\n');
      const line = this.lineBuffer + this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);
      this.lineBuffer = '';
      this.processLine(line);
    }

    // Handle partial line for display
    if (this.buffer.length > 0) {
      this.lineBuffer += this.buffer;
      this.buffer = '';
      this.displayPartial(this.lineBuffer);
    }
  }

  /**
   * Process a complete line
   */
  processLine(line) {
    const colors = this.theme.colors;

    // Code block detection
    if (line.startsWith('```')) {
      if (this.inCodeBlock) {
        this.inCodeBlock = false;
        this.codeBlockLang = '';
        process.stdout.write(colors.dim('└' + '─'.repeat(40)) + '\n');
      } else {
        this.inCodeBlock = true;
        this.codeBlockLang = line.slice(3).trim();
        process.stdout.write(colors.dim(`┌─ ${this.codeBlockLang || 'code'} ${'─'.repeat(Math.max(0, 35 - this.codeBlockLang.length))}`) + '\n');
      }
      return;
    }

    if (this.inCodeBlock) {
      this.currentLine++;
      const lineNum = colors.dim(`${this.currentLine.toString().padStart(3)} │`);
      process.stdout.write(`${lineNum} ${colors.code(line)}\n`);
      return;
    }

    // Reset line counter when exiting code block
    this.currentLine = 0;

    // Render markdown-style formatting
    let output = line;

    // Headers
    if (line.startsWith('#')) {
      const level = line.match(/^#+/)[0].length;
      const text = line.slice(level).trim();
      const headerColors = [
        colors.highlight,
        colors.secondary,
        colors.primary,
        colors.info,
        colors.dim,
        colors.dim
      ];
      output = headerColors[Math.min(level - 1, 5)](text);
    }
    // Bullet list
    else if (/^[\s]*[-*+]\s/.test(line)) {
      const content = line.replace(/^[\s]*[-*+]\s/, '');
      output = colors.primary('• ') + this.formatInline(content);
    }
    // Blockquote
    else if (line.startsWith('>')) {
      output = colors.dim('│ ') + colors.info(line.slice(1).trim());
    }
    // Regular line
    else {
      output = this.formatInline(line);
    }

    process.stdout.write('\r' + ANSI.CLEAR_LINE + output + '\n');
  }

  /**
   * Display partial line (being typed)
   */
  displayPartial(text) {
    const formatted = this.inCodeBlock
      ? this.theme.colors.code(text)
      : this.formatInline(text);
    process.stdout.write('\r' + ANSI.CLEAR_LINE + formatted);
  }

  /**
   * Format inline elements
   */
  formatInline(text) {
    const colors = this.theme.colors;
    let result = text;

    // Bold
    result = result.replace(/\*\*([^*]+)\*\*/g, (_, c) => colors.highlight(c));

    // Inline code
    result = result.replace(/`([^`]+)`/g, (_, c) => colors.code(c));

    // Links
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) =>
      colors.info(t) + colors.dim(` (${u})`)
    );

    return result;
  }

  /**
   * Flush remaining buffer
   */
  flush() {
    if (this.lineBuffer) {
      this.processLine(this.lineBuffer);
      this.lineBuffer = '';
    }
    if (this.buffer) {
      this.processLine(this.buffer);
      this.buffer = '';
    }
    if (this.inCodeBlock) {
      process.stdout.write(this.theme.colors.dim('└' + '─'.repeat(40)) + '\n');
      this.inCodeBlock = false;
    }
  }

  /**
   * Clear current line
   */
  clearLine() {
    process.stdout.write('\r' + ANSI.CLEAR_LINE);
  }

  /**
   * Reset renderer state
   */
  reset() {
    this.buffer = '';
    this.lineBuffer = '';
    this.inCodeBlock = false;
    this.codeBlockLang = '';
    this.currentLine = 0;
  }
}

/**
 * Progress Indicator for multi-stage operations
 */
export class ProgressIndicator {
  constructor(options = {}) {
    this.theme = options.theme || themeRegistry.getCurrent();
    this.stages = options.stages || [];
    this.currentStage = 0;
    this.startTime = null;
  }

  /**
   * Start progress tracking
   */
  start() {
    this.startTime = Date.now();
    this.currentStage = 0;
    this.render();
  }

  /**
   * Advance to next stage
   */
  advance(stageName) {
    this.currentStage++;
    if (stageName && this.currentStage <= this.stages.length) {
      this.stages[this.currentStage - 1] = stageName;
    }
    this.render();
  }

  /**
   * Complete all stages
   */
  complete() {
    this.currentStage = this.stages.length;
    this.render();
    const elapsed = Date.now() - this.startTime;
    console.log(this.theme.colors.success(`\n✓ Completed in ${(elapsed / 1000).toFixed(1)}s`));
  }

  /**
   * Render current progress
   */
  render() {
    const colors = this.theme.colors;
    process.stdout.write('\r' + ANSI.CLEAR_LINE);

    const parts = this.stages.map((stage, idx) => {
      if (idx < this.currentStage) {
        return colors.success(`✓ ${stage}`);
      } else if (idx === this.currentStage) {
        return colors.warning(`◉ ${stage}`);
      } else {
        return colors.dim(`○ ${stage}`);
      }
    });

    process.stdout.write(parts.join(colors.dim(' → ')));
  }
}

/**
 * Collapsible Section for long outputs
 */
export class CollapsibleSection {
  constructor(title, options = {}) {
    this.theme = options.theme || themeRegistry.getCurrent();
    this.title = title;
    this.expanded = options.expanded ?? true;
    this.content = [];
  }

  /**
   * Add content line
   */
  add(line) {
    this.content.push(line);
  }

  /**
   * Toggle expanded state
   */
  toggle() {
    this.expanded = !this.expanded;
  }

  /**
   * Render section
   */
  render() {
    const colors = this.theme.colors;
    const symbol = this.expanded ? '▼' : '▶';
    const header = colors.primary(`${symbol} ${this.title}`);

    if (!this.expanded) {
      return header + colors.dim(` (${this.content.length} lines)`);
    }

    return [header, ...this.content.map(l => '  ' + l)].join('\n');
  }
}

export function createStreamingRenderer(options) {
  return new StreamingRenderer(options);
}

export function createProgressIndicator(stages, options = {}) {
  return new ProgressIndicator({ ...options, stages });
}

export default StreamingRenderer;
