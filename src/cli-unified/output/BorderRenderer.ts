/**
 * Unified Border Renderer
 * Based on src/cli/Borders.js with all 7 styles
 * @module cli-unified/output/BorderRenderer
 */

import { BORDER_STYLES, BOX_SINGLE, BOX_DOUBLE, BOX_ROUNDED, BOX_BOLD, BOX_DASHED, BOX_DOTTED, BOX_ASCII } from '../core/constants.js';
import { themeRegistry } from '../core/ThemeRegistry.js';

// Re-export border style constants
export { BORDER_STYLES, BOX_SINGLE, BOX_DOUBLE, BOX_ROUNDED, BOX_BOLD, BOX_DASHED, BOX_DOTTED, BOX_ASCII };

// Backward compatibility exports
export const SINGLE = BOX_SINGLE;
export const DOUBLE = BOX_DOUBLE;
export const ROUNDED = BOX_ROUNDED;
export const BOLD = BOX_BOLD;
export const DASHED = BOX_DASHED;
export const DOTTED = BOX_DOTTED;
export const ASCII = BOX_ASCII;

/**
 * Strip ANSI escape sequences from string
 */
export function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Get visible length of string (excluding ANSI codes)
 */
export function visibleLength(str) {
  return stripAnsi(str).length;
}

/**
 * Pad string to width (accounting for ANSI codes)
 */
export function padString(str, width, align = 'left', padChar = ' ') {
  const visible = visibleLength(str);
  const needed = width - visible;
  if (needed <= 0) return str;

  switch (align) {
    case 'center':
      const left = Math.floor(needed / 2);
      const right = needed - left;
      return padChar.repeat(left) + str + padChar.repeat(right);
    case 'right':
      return padChar.repeat(needed) + str;
    default:
      return str + padChar.repeat(needed);
  }
}

/**
 * Word wrap text to specified width
 */
export function wordWrap(text, width) {
  if (!text) return [''];
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (visibleLength(testLine) <= width) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = visibleLength(word) > width ? word.slice(0, width) : word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.length ? lines : [''];
}

/**
 * Border Renderer class
 */
export class BorderRenderer {
  constructor(options = {}) {
    this.theme = options.theme || themeRegistry.getCurrent();
    this.style = options.style || 'rounded';
    this.width = options.width || process.stdout.columns || 80;
    this.padding = options.padding ?? 1;
    this.margin = options.margin ?? 0;
  }

  /**
   * Get border characters for current style
   */
  getChars() {
    return BORDER_STYLES[this.style] || BOX_ROUNDED;
  }

  /**
   * Render a simple box around text
   */
  box(content, options = {}) {
    const chars = options.chars || this.getChars();
    const width = options.width || this.width;
    const padding = options.padding ?? this.padding;
    const title = options.title || '';
    const titleAlign = options.titleAlign || 'left';
    const contentAlign = options.align || 'left';
    const color = options.color || this.theme.colors.border;

    const innerWidth = width - 2 - (padding * 2);
    const lines = Array.isArray(content) ? content : wordWrap(content, innerWidth);
    const marginStr = ' '.repeat(this.margin);
    const paddingStr = ' '.repeat(padding);
    const output = [];

    // Top border with optional title
    let topLine = chars.topLeft + chars.horizontal.repeat(width - 2) + chars.topRight;
    if (title) {
      const titleText = ` ${title} `;
      const titlePos = titleAlign === 'center'
        ? Math.floor((width - titleText.length) / 2)
        : titleAlign === 'right'
          ? width - titleText.length - 2
          : 2;
      topLine = chars.topLeft +
        chars.horizontal.repeat(titlePos - 1) +
        this.theme.colors.highlight(titleText) +
        chars.horizontal.repeat(width - titlePos - titleText.length - 1) +
        chars.topRight;
    }
    output.push(marginStr + color(topLine));

    // Content lines with padding
    for (let i = 0; i < padding; i++) {
      output.push(marginStr + color(chars.vertical) + ' '.repeat(width - 2) + color(chars.vertical));
    }

    for (const line of lines) {
      const paddedContent = paddingStr + padString(line, innerWidth, contentAlign) + paddingStr;
      output.push(marginStr + color(chars.vertical) + paddedContent + color(chars.vertical));
    }

    for (let i = 0; i < padding; i++) {
      output.push(marginStr + color(chars.vertical) + ' '.repeat(width - 2) + color(chars.vertical));
    }

    // Bottom border
    output.push(marginStr + color(chars.bottomLeft + chars.horizontal.repeat(width - 2) + chars.bottomRight));

    return output.join('\n');
  }

  /**
   * Render a panel with header and content
   */
  panel(header, content, options = {}) {
    const chars = options.chars || this.getChars();
    const width = options.width || this.width;
    const padding = options.padding ?? this.padding;
    const headerColor = options.headerColor || this.theme.colors.primary;
    const borderColor = options.borderColor || this.theme.colors.border;

    const innerWidth = width - 2 - (padding * 2);
    const contentLines = Array.isArray(content) ? content : wordWrap(content, innerWidth);
    const paddingStr = ' '.repeat(padding);
    const output = [];

    // Top border
    output.push(borderColor(chars.topLeft + chars.horizontal.repeat(width - 2) + chars.topRight));

    // Header
    const headerText = paddingStr + padString(header, innerWidth, 'left') + paddingStr;
    output.push(borderColor(chars.vertical) + headerColor(headerText) + borderColor(chars.vertical));

    // Separator
    output.push(borderColor(chars.teeRight + chars.horizontal.repeat(width - 2) + chars.teeLeft));

    // Content
    for (const line of contentLines) {
      const paddedContent = paddingStr + padString(line, innerWidth, 'left') + paddingStr;
      output.push(borderColor(chars.vertical) + paddedContent + borderColor(chars.vertical));
    }

    // Bottom border
    output.push(borderColor(chars.bottomLeft + chars.horizontal.repeat(width - 2) + chars.bottomRight));

    return output.join('\n');
  }

  /**
   * Render multiple sections in a single box
   */
  sections(sectionsData, options = {}) {
    const chars = options.chars || this.getChars();
    const width = options.width || this.width;
    const padding = options.padding ?? this.padding;
    const borderColor = options.borderColor || this.theme.colors.border;

    const innerWidth = width - 2 - (padding * 2);
    const paddingStr = ' '.repeat(padding);
    const output = [];

    // Top border
    output.push(borderColor(chars.topLeft + chars.horizontal.repeat(width - 2) + chars.topRight));

    sectionsData.forEach((section, idx) => {
      const headerColor = section.headerColor || this.theme.colors.primary;
      const contentLines = Array.isArray(section.content)
        ? section.content
        : wordWrap(section.content, innerWidth);

      // Section header
      if (section.header) {
        const headerText = paddingStr + padString(section.header, innerWidth, 'left') + paddingStr;
        output.push(borderColor(chars.vertical) + headerColor(headerText) + borderColor(chars.vertical));
      }

      // Section content
      for (const line of contentLines) {
        const paddedContent = paddingStr + padString(line, innerWidth, 'left') + paddingStr;
        output.push(borderColor(chars.vertical) + paddedContent + borderColor(chars.vertical));
      }

      // Section separator (not for last section)
      if (idx < sectionsData.length - 1) {
        output.push(borderColor(chars.teeRight + chars.horizontal.repeat(width - 2) + chars.teeLeft));
      }
    });

    // Bottom border
    output.push(borderColor(chars.bottomLeft + chars.horizontal.repeat(width - 2) + chars.bottomRight));

    return output.join('\n');
  }

  /**
   * Render a horizontal rule
   */
  horizontalRule(options = {}) {
    const chars = options.chars || this.getChars();
    const width = options.width || this.width;
    const color = options.color || this.theme.colors.dim;
    const style = options.style || 'single';

    const char = style === 'double' ? chars.doubleHorizontal || chars.horizontal : chars.horizontal;
    return color(char.repeat(width));
  }

  /**
   * Create divider with text
   */
  divider(text, options = {}) {
    const width = options.width || this.width;
    const color = options.color || this.theme.colors.dim;
    const chars = this.getChars();

    if (!text) return this.horizontalRule(options);

    const textWithSpace = ` ${text} `;
    const remaining = width - textWithSpace.length;
    const left = Math.floor(remaining / 2);
    const right = remaining - left;

    return color(chars.horizontal.repeat(left)) +
           this.theme.colors.highlight(textWithSpace) +
           color(chars.horizontal.repeat(right));
  }
}

// Quick helper functions
export function quickBox(content, options = {}) {
  const renderer = new BorderRenderer(options);
  return renderer.box(content, options);
}

export function quickPanel(header, content, options = {}) {
  const renderer = new BorderRenderer(options);
  return renderer.panel(header, content, options);
}

export function createBorderRenderer(options) {
  return new BorderRenderer(options);
}

export default BorderRenderer;
