/**
 * Unified Markdown Renderer
 * Based on src/cli/MarkdownRenderer.js
 * @module cli-unified/output/MarkdownRenderer
 */

import { themeRegistry } from '../core/ThemeRegistry.js';

/**
 * Markdown Renderer for terminal output
 */
export class MarkdownRenderer {
  constructor(options = {}) {
    this.theme = options.theme || themeRegistry.getCurrent();
    this.width = options.width || process.stdout.columns || 80;
    this.indent = options.indent || 2;
    this.codeHighlight = options.codeHighlight !== false;
  }

  /**
   * Render markdown to terminal string
   */
  render(markdown) {
    if (!markdown) return '';

    const lines = markdown.split('\n');
    const output = [];
    let inCodeBlock = false;
    let codeBlockLang = '';
    let codeLines = [];

    for (const line of lines) {
      // Code block handling
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          output.push(this.renderCodeBlock(codeLines.join('\n'), codeBlockLang));
          codeLines = [];
          inCodeBlock = false;
          codeBlockLang = '';
        } else {
          inCodeBlock = true;
          codeBlockLang = line.slice(3).trim();
        }
        continue;
      }

      if (inCodeBlock) {
        codeLines.push(line);
        continue;
      }

      // Regular line parsing
      output.push(this.renderLine(line));
    }

    return output.join('\n');
  }

  /**
   * Render a single line
   */
  renderLine(line) {
    const colors = this.theme.colors;
    const symbols = this.theme.symbols;

    // Headers
    if (line.startsWith('######')) {
      return colors.dim(`${symbols.h6 || '·'} ${line.slice(6).trim()}`);
    }
    if (line.startsWith('#####')) {
      return colors.dim(`${symbols.h5 || '•'} ${line.slice(5).trim()}`);
    }
    if (line.startsWith('####')) {
      return colors.info(`${symbols.h4 || '▪'} ${line.slice(4).trim()}`);
    }
    if (line.startsWith('###')) {
      return colors.primary(`${symbols.h3 || '▶'} ${line.slice(3).trim()}`);
    }
    if (line.startsWith('##')) {
      return colors.secondary(`${symbols.h2 || '◆'} ${line.slice(2).trim()}`);
    }
    if (line.startsWith('#')) {
      return colors.highlight(`\n${symbols.h1 || '✦'} ${line.slice(1).trim()}\n`);
    }

    // Horizontal rule
    if (/^(-{3,}|={3,}|\*{3,})$/.test(line.trim())) {
      return colors.dim('─'.repeat(Math.min(this.width - 4, 60)));
    }

    // Blockquote
    if (line.startsWith('>')) {
      const content = line.slice(1).trim();
      return colors.dim(`${symbols.quoteBar || '┃'} `) + colors.info(content);
    }

    // Unordered list
    if (/^[\s]*[-*+]\s/.test(line)) {
      const indent = line.match(/^(\s*)/)[1].length;
      const content = line.replace(/^[\s]*[-*+]\s/, '');
      return ' '.repeat(indent) + colors.primary(`${symbols.bullet || '•'} `) + this.renderInline(content);
    }

    // Ordered list
    if (/^[\s]*\d+\.\s/.test(line)) {
      const match = line.match(/^(\s*)(\d+)\.\s(.*)/);
      if (match) {
        const [, indent, num, content] = match;
        return indent + colors.primary(`${num}.`) + ' ' + this.renderInline(content);
      }
    }

    // Task list
    if (/^[\s]*[-*]\s\[[ x]\]\s/.test(line)) {
      const checked = line.includes('[x]') || line.includes('[X]');
      const content = line.replace(/^[\s]*[-*]\s\[[ xX]\]\s/, '');
      const symbol = checked ? (symbols.taskDone || '✔') : (symbols.taskPending || '○');
      const color = checked ? colors.success : colors.dim;
      return '  ' + color(symbol) + ' ' + this.renderInline(content);
    }

    // Empty line
    if (!line.trim()) return '';

    // Regular paragraph
    return this.renderInline(line);
  }

  /**
   * Render inline markdown elements
   */
  renderInline(text) {
    const colors = this.theme.colors;
    let result = text;

    // Bold
    result = result.replace(/\*\*([^*]+)\*\*/g, (_, content) => colors.highlight(content));
    result = result.replace(/__([^_]+)__/g, (_, content) => colors.highlight(content));

    // Italic
    result = result.replace(/\*([^*]+)\*/g, (_, content) => `\x1b[3m${content}\x1b[23m`);
    result = result.replace(/_([^_]+)_/g, (_, content) => `\x1b[3m${content}\x1b[23m`);

    // Inline code
    result = result.replace(/`([^`]+)`/g, (_, content) => colors.code(content));

    // Links
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, linkText, url) => {
      return colors.info(linkText) + colors.dim(` (${url})`);
    });

    // Strikethrough
    result = result.replace(/~~([^~]+)~~/g, (_, content) => `\x1b[9m${content}\x1b[29m`);

    return result;
  }

  /**
   * Render code block
   */
  renderCodeBlock(code, lang = '') {
    const colors = this.theme.colors;
    const lines = code.split('\n');
    const output = [];

    // Header
    output.push(colors.dim(`┌─ ${lang || 'code'} ${'─'.repeat(Math.max(0, 40 - lang.length))}`));

    // Code lines with line numbers
    lines.forEach((line, i) => {
      const lineNum = colors.dim(`${(i + 1).toString().padStart(3)} │`);
      const codeLine = this.highlightSyntax(line, lang);
      output.push(`${lineNum} ${codeLine}`);
    });

    // Footer
    output.push(colors.dim('└' + '─'.repeat(45)));

    return output.join('\n');
  }

  /**
   * Basic syntax highlighting
   */
  highlightSyntax(code, lang) {
    const colors = this.theme.colors;
    if (!this.codeHighlight) return code;

    let result = code;

    // Keywords (common across languages)
    const keywords = /\b(function|const|let|var|if|else|for|while|return|import|export|from|class|extends|async|await|try|catch|throw|new|this|super|static|def|self|None|True|False|and|or|not|in|is|lambda|yield|with|as|pass|break|continue|elif|except|finally|raise|assert|global|nonlocal|fn|mut|pub|use|mod|impl|trait|struct|enum|match|loop|where|move|ref|dyn)\b/g;
    result = result.replace(keywords, match => colors.keyword(match));

    // Strings
    result = result.replace(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/g, match => colors.string(match));

    // Numbers
    result = result.replace(/\b(\d+\.?\d*)\b/g, match => colors.number(match));

    // Comments
    result = result.replace(/(\/\/.*$|#.*$|\/\*[\s\S]*?\*\/)/gm, match => colors.dim(match));

    return result;
  }

  /**
   * Render table
   */
  renderTable(headers, rows) {
    const colors = this.theme.colors;
    const output = [];

    // Calculate column widths
    const colWidths = headers.map((h, i) => {
      const maxRow = Math.max(...rows.map(r => (r[i] || '').toString().length));
      return Math.max(h.length, maxRow) + 2;
    });

    // Header
    const headerRow = headers.map((h, i) => h.padEnd(colWidths[i])).join('│');
    output.push(colors.highlight(headerRow));

    // Separator
    const separator = colWidths.map(w => '─'.repeat(w)).join('┼');
    output.push(colors.dim(separator));

    // Rows
    for (const row of rows) {
      const rowStr = headers.map((_, i) => (row[i] || '').toString().padEnd(colWidths[i])).join('│');
      output.push(rowStr);
    }

    return output.join('\n');
  }
}

export function createMarkdownRenderer(options) {
  return new MarkdownRenderer(options);
}

export default MarkdownRenderer;
