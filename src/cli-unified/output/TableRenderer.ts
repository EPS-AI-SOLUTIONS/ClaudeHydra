/**
 * Unified Table Renderer
 * Based on src/cli/TableRenderer.js
 * @module cli-unified/output/TableRenderer
 */

import { BORDER_STYLES, BOX_SINGLE, BOX_DOUBLE, BOX_ROUNDED, BOX_ASCII } from '../core/constants.js';
import { themeRegistry } from '../core/ThemeRegistry.js';

/** Table styles using border characters */
export const TABLE_STYLES = {
  simple: { ...BOX_SINGLE, showBorders: false },
  grid: { ...BOX_SINGLE, showBorders: true },
  outline: { ...BOX_SINGLE, showBorders: true, innerBorders: false },
  double: { ...BOX_DOUBLE, showBorders: true },
  rounded: { ...BOX_ROUNDED, showBorders: true },
  compact: { showBorders: false, padding: 1 },
  minimal: { showBorders: false, padding: 0, separator: ' ' },
  thick: { ...BOX_SINGLE, showBorders: true, thick: true }
};

/** List styles */
export const LIST_STYLES = {
  bullet: { marker: '\u2022', indent: 2 },
  dash: { marker: '-', indent: 2 },
  arrow: { marker: '\u2192', indent: 2 },
  star: { marker: '\u2605', indent: 2 },
  check: { marker: '\u2714', indent: 2 },
  number: { marker: null, indent: 3 },
  letter: { marker: null, indent: 3 }
};

/** Alignment options */
export const ALIGNMENT = {
  LEFT: 'left',
  CENTER: 'center',
  RIGHT: 'right'
};

/**
 * Strip ANSI codes and get visible length
 */
function visibleLength(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '').length;
}

/**
 * Pad string to width accounting for ANSI codes
 */
function padString(str, width, align = 'left') {
  const visible = visibleLength(str);
  const needed = width - visible;
  if (needed <= 0) return str;

  switch (align) {
    case 'center':
      const left = Math.floor(needed / 2);
      return ' '.repeat(left) + str + ' '.repeat(needed - left);
    case 'right':
      return ' '.repeat(needed) + str;
    default:
      return str + ' '.repeat(needed);
  }
}

/**
 * Table Renderer class
 */
export class TableRenderer {
  constructor(options = {}) {
    this.theme = options.theme || themeRegistry.getCurrent();
    this.style = options.style || 'rounded';
    this.padding = options.padding ?? 1;
    this.zebra = options.zebra ?? false;
    this.maxWidth = options.maxWidth || process.stdout.columns || 120;
  }

  /**
   * Get style configuration
   */
  getStyleConfig() {
    return TABLE_STYLES[this.style] || TABLE_STYLES.rounded;
  }

  /**
   * Render a table
   */
  render(headers, rows, options = {}) {
    const config = { ...this.getStyleConfig(), ...options };
    const colors = this.theme.colors;
    const alignments = options.alignments || headers.map(() => 'left');

    // Calculate column widths
    const colWidths = this.calculateWidths(headers, rows);
    const paddingStr = ' '.repeat(this.padding);
    const output = [];

    if (config.showBorders) {
      // Top border
      output.push(this.renderBorderLine(colWidths, config, 'top'));
    }

    // Header row
    const headerCells = headers.map((h, i) => {
      const content = paddingStr + padString(h, colWidths[i], alignments[i]) + paddingStr;
      return colors.highlight(content);
    });
    output.push(this.renderRow(headerCells, config));

    // Header separator
    if (config.showBorders) {
      output.push(this.renderBorderLine(colWidths, config, 'middle'));
    } else {
      const separator = colWidths.map(w => '-'.repeat(w + this.padding * 2)).join(config.separator || ' ');
      output.push(colors.dim(separator));
    }

    // Data rows
    rows.forEach((row, rowIdx) => {
      const rowCells = headers.map((_, i) => {
        const value = row[i] !== undefined ? String(row[i]) : '';
        const content = paddingStr + padString(value, colWidths[i], alignments[i]) + paddingStr;
        return this.zebra && rowIdx % 2 === 1 ? colors.dim(content) : content;
      });
      output.push(this.renderRow(rowCells, config));
    });

    if (config.showBorders) {
      // Bottom border
      output.push(this.renderBorderLine(colWidths, config, 'bottom'));
    }

    return output.join('\n');
  }

  /**
   * Calculate column widths
   */
  calculateWidths(headers, rows) {
    return headers.map((h, i) => {
      const headerLen = visibleLength(h);
      const maxRowLen = rows.reduce((max, row) => {
        const val = row[i] !== undefined ? String(row[i]) : '';
        return Math.max(max, visibleLength(val));
      }, 0);
      return Math.max(headerLen, maxRowLen);
    });
  }

  /**
   * Render a single row
   */
  renderRow(cells, config) {
    if (config.showBorders) {
      const vertical = config.vertical || '\u2502';
      return this.theme.colors.border(vertical) + cells.join(this.theme.colors.border(vertical)) + this.theme.colors.border(vertical);
    }
    return cells.join(config.separator || '  ');
  }

  /**
   * Render border line
   */
  renderBorderLine(widths, config, position) {
    const horizontal = config.horizontal || '\u2500';
    const paddedWidth = this.padding * 2;

    let left, middle, right;
    switch (position) {
      case 'top':
        left = config.topLeft || '\u250c';
        middle = config.teeDown || '\u252c';
        right = config.topRight || '\u2510';
        break;
      case 'middle':
        left = config.teeRight || '\u251c';
        middle = config.cross || '\u253c';
        right = config.teeLeft || '\u2524';
        break;
      case 'bottom':
        left = config.bottomLeft || '\u2514';
        middle = config.teeUp || '\u2534';
        right = config.bottomRight || '\u2518';
        break;
    }

    const segments = widths.map(w => horizontal.repeat(w + paddedWidth));
    return this.theme.colors.border(left + segments.join(middle) + right);
  }

  /**
   * Render simple key-value table
   */
  renderKeyValue(data, options = {}) {
    const entries = Array.isArray(data) ? data : Object.entries(data);
    const headers = options.headers || ['Key', 'Value'];
    return this.render(headers, entries, options);
  }
}

/**
 * List Renderer class
 */
export class ListRenderer {
  constructor(options = {}) {
    this.theme = options.theme || themeRegistry.getCurrent();
    this.style = options.style || 'bullet';
    this.indent = options.indent ?? 2;
  }

  /**
   * Get style configuration
   */
  getStyleConfig() {
    return LIST_STYLES[this.style] || LIST_STYLES.bullet;
  }

  /**
   * Render a list
   */
  render(items, options = {}) {
    const config = { ...this.getStyleConfig(), ...options };
    const colors = this.theme.colors;
    const output = [];

    items.forEach((item, idx) => {
      const indent = ' '.repeat(config.indent * (item.level || 0));
      let marker;

      if (this.style === 'number') {
        marker = `${idx + 1}.`;
      } else if (this.style === 'letter') {
        marker = `${String.fromCharCode(97 + (idx % 26))}.`;
      } else {
        marker = config.marker;
      }

      const text = typeof item === 'string' ? item : item.text;
      const markerStr = colors.primary(marker);
      output.push(`${indent}${markerStr} ${text}`);

      // Handle nested items
      if (item.children && item.children.length > 0) {
        const nestedItems = item.children.map(child => ({
          ...(typeof child === 'string' ? { text: child } : child),
          level: (item.level || 0) + 1
        }));
        output.push(this.render(nestedItems, options));
      }
    });

    return output.join('\n');
  }

  /**
   * Render a definition list
   */
  renderDefinitions(definitions, options = {}) {
    const colors = this.theme.colors;
    const output = [];

    for (const [term, definition] of Object.entries(definitions)) {
      output.push(colors.highlight(term));
      output.push('  ' + colors.dim(definition));
      output.push('');
    }

    return output.join('\n').trim();
  }
}

// Factory functions
export function createTableRenderer(options) {
  return new TableRenderer(options);
}

export function createListRenderer(options) {
  return new ListRenderer(options);
}

export function renderTable(headers, rows, options = {}) {
  return new TableRenderer(options).render(headers, rows, options);
}

export function renderList(items, options = {}) {
  return new ListRenderer(options).render(items, options);
}

export default TableRenderer;
