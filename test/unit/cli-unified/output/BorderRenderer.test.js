/**
 * BorderRenderer Tests
 * @module test/unit/cli-unified/output/BorderRenderer.test
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock ThemeRegistry
vi.mock('../../../../src/cli-unified/core/ThemeRegistry.js', () => ({
  themeRegistry: {
    getCurrent: vi.fn(() => ({
      colors: {
        primary: vi.fn((s) => `[primary]${s}[/primary]`),
        highlight: vi.fn((s) => `[highlight]${s}[/highlight]`),
        border: vi.fn((s) => `[border]${s}[/border]`),
        dim: vi.fn((s) => `[dim]${s}[/dim]`),
      },
    })),
  },
}));

// Mock constants with BOX styles
vi.mock('../../../../src/cli-unified/core/constants.js', () => {
  const BOX_SINGLE = {
    horizontal: '─',
    vertical: '│',
    topLeft: '┌',
    topRight: '┐',
    bottomLeft: '└',
    bottomRight: '┘',
    teeDown: '┬',
    teeUp: '┴',
    teeRight: '├',
    teeLeft: '┤',
    cross: '┼',
  };
  const BOX_DOUBLE = {
    horizontal: '═',
    vertical: '║',
    topLeft: '╔',
    topRight: '╗',
    bottomLeft: '╚',
    bottomRight: '╝',
    teeDown: '╦',
    teeUp: '╩',
    teeRight: '╠',
    teeLeft: '╣',
    cross: '╬',
  };
  const BOX_ROUNDED = {
    horizontal: '─',
    vertical: '│',
    topLeft: '╭',
    topRight: '╮',
    bottomLeft: '╰',
    bottomRight: '╯',
    teeDown: '┬',
    teeUp: '┴',
    teeRight: '├',
    teeLeft: '┤',
    cross: '┼',
  };
  const BOX_BOLD = { ...BOX_SINGLE };
  const BOX_DASHED = { ...BOX_SINGLE };
  const BOX_DOTTED = { ...BOX_SINGLE };
  const BOX_ASCII = {
    horizontal: '-',
    vertical: '|',
    topLeft: '+',
    topRight: '+',
    bottomLeft: '+',
    bottomRight: '+',
    teeDown: '+',
    teeUp: '+',
    teeRight: '+',
    teeLeft: '+',
    cross: '+',
  };

  return {
    BORDER_STYLES: {
      single: BOX_SINGLE,
      double: BOX_DOUBLE,
      rounded: BOX_ROUNDED,
      bold: BOX_BOLD,
      dashed: BOX_DASHED,
      dotted: BOX_DOTTED,
      ascii: BOX_ASCII,
    },
    BOX_SINGLE,
    BOX_DOUBLE,
    BOX_ROUNDED,
    BOX_BOLD,
    BOX_DASHED,
    BOX_DOTTED,
    BOX_ASCII,
  };
});

import {
  ASCII,
  BorderRenderer,
  createBorderRenderer,
  DOUBLE,
  padString,
  quickBox,
  quickPanel,
  ROUNDED,
  SINGLE,
  stripAnsi,
  visibleLength,
  wordWrap,
} from '../../../../src/cli-unified/output/BorderRenderer.js';

describe('BorderRenderer Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Utility Functions Tests
  // ===========================================================================

  describe('stripAnsi()', () => {
    it('should strip ANSI escape codes', () => {
      const input = '\x1b[31mred text\x1b[0m';
      expect(stripAnsi(input)).toBe('red text');
    });

    it('should return unchanged string without ANSI codes', () => {
      const input = 'plain text';
      expect(stripAnsi(input)).toBe('plain text');
    });

    it('should handle multiple ANSI codes', () => {
      const input = '\x1b[1m\x1b[31mbold red\x1b[0m';
      expect(stripAnsi(input)).toBe('bold red');
    });
  });

  describe('visibleLength()', () => {
    it('should return correct length without ANSI codes', () => {
      const input = '\x1b[31mhello\x1b[0m';
      expect(visibleLength(input)).toBe(5);
    });

    it('should return string length for plain text', () => {
      expect(visibleLength('hello')).toBe(5);
    });
  });

  describe('padString()', () => {
    it('should pad left by default', () => {
      expect(padString('hi', 5)).toBe('hi   ');
    });

    it('should pad right', () => {
      expect(padString('hi', 5, 'right')).toBe('   hi');
    });

    it('should pad center', () => {
      expect(padString('hi', 6, 'center')).toBe('  hi  ');
    });

    it('should handle odd padding for center', () => {
      expect(padString('hi', 5, 'center')).toBe(' hi  ');
    });

    it('should return original if already wider', () => {
      expect(padString('hello', 3)).toBe('hello');
    });

    it('should use custom pad character', () => {
      expect(padString('hi', 5, 'left', '.')).toBe('hi...');
    });

    it('should handle strings with ANSI codes', () => {
      const input = '\x1b[31mhi\x1b[0m';
      const padded = padString(input, 5);
      expect(visibleLength(padded)).toBe(5);
    });
  });

  describe('wordWrap()', () => {
    it('should wrap long text', () => {
      const text = 'This is a long sentence that needs wrapping';
      const lines = wordWrap(text, 15);
      expect(lines.length).toBeGreaterThan(1);
      lines.forEach((line) => {
        expect(visibleLength(line)).toBeLessThanOrEqual(15);
      });
    });

    it('should return single line for short text', () => {
      const lines = wordWrap('short', 20);
      expect(lines).toEqual(['short']);
    });

    it('should handle empty text', () => {
      expect(wordWrap('', 10)).toEqual(['']);
      expect(wordWrap(null, 10)).toEqual(['']);
    });

    it('should truncate words longer than width', () => {
      const lines = wordWrap('superlongword', 5);
      expect(lines[0].length).toBeLessThanOrEqual(5);
    });
  });

  // ===========================================================================
  // Re-exports Tests
  // ===========================================================================

  describe('Re-exports', () => {
    it('should export SINGLE style', () => {
      expect(SINGLE).toBeDefined();
      expect(SINGLE.horizontal).toBeDefined();
    });

    it('should export DOUBLE style', () => {
      expect(DOUBLE).toBeDefined();
    });

    it('should export ROUNDED style', () => {
      expect(ROUNDED).toBeDefined();
    });

    it('should export ASCII style', () => {
      expect(ASCII).toBeDefined();
      expect(ASCII.horizontal).toBe('-');
    });
  });

  // ===========================================================================
  // BorderRenderer Class Tests
  // ===========================================================================

  describe('BorderRenderer', () => {
    describe('constructor', () => {
      it('should create with defaults', () => {
        const renderer = new BorderRenderer();
        expect(renderer.style).toBe('rounded');
        expect(renderer.padding).toBe(1);
        expect(renderer.margin).toBe(0);
      });

      it('should accept custom options', () => {
        const renderer = new BorderRenderer({
          style: 'double',
          width: 60,
          padding: 2,
          margin: 1,
        });
        expect(renderer.style).toBe('double');
        expect(renderer.width).toBe(60);
        expect(renderer.padding).toBe(2);
        expect(renderer.margin).toBe(1);
      });
    });

    describe('getChars()', () => {
      it('should return chars for style', () => {
        const renderer = new BorderRenderer({ style: 'rounded' });
        const chars = renderer.getChars();
        expect(chars.topLeft).toBe('╭');
      });

      it('should fallback to rounded for unknown style', () => {
        const renderer = new BorderRenderer({ style: 'nonexistent' });
        const chars = renderer.getChars();
        expect(chars).toBeDefined();
      });
    });

    describe('box()', () => {
      it('should render a simple box', () => {
        const renderer = new BorderRenderer({ width: 20 });
        const result = renderer.box('Hello');

        expect(result).toContain('[border]');
        expect(result).toContain('Hello');
        expect(result.split('\n').length).toBeGreaterThan(1);
      });

      it('should render box with title', () => {
        const renderer = new BorderRenderer({ width: 30 });
        const result = renderer.box('Content', { title: 'Title' });

        expect(result).toContain('[highlight] Title [/highlight]');
        expect(result).toContain('Content');
      });

      it('should render box with centered title', () => {
        const renderer = new BorderRenderer({ width: 30 });
        const result = renderer.box('Content', { title: 'Title', titleAlign: 'center' });

        expect(result).toContain('Title');
      });

      it('should render box with right-aligned title', () => {
        const renderer = new BorderRenderer({ width: 30 });
        const result = renderer.box('Content', { title: 'Title', titleAlign: 'right' });

        expect(result).toContain('Title');
      });

      it('should render box with array content', () => {
        const renderer = new BorderRenderer({ width: 20 });
        const result = renderer.box(['Line 1', 'Line 2']);

        expect(result).toContain('Line 1');
        expect(result).toContain('Line 2');
      });

      it('should respect content alignment', () => {
        const renderer = new BorderRenderer({ width: 30 });
        const result = renderer.box('Text', { align: 'center' });

        expect(result).toBeDefined();
      });
    });

    describe('panel()', () => {
      it('should render panel with header and content', () => {
        const renderer = new BorderRenderer({ width: 30 });
        const result = renderer.panel('Header', 'Body content');

        expect(result).toContain('[primary]');
        expect(result).toContain('Header');
        expect(result).toContain('Body content');
      });

      it('should render panel with array content', () => {
        const renderer = new BorderRenderer({ width: 30 });
        const result = renderer.panel('Header', ['Line 1', 'Line 2']);

        expect(result).toContain('Line 1');
        expect(result).toContain('Line 2');
      });
    });

    describe('sections()', () => {
      it('should render multiple sections', () => {
        const renderer = new BorderRenderer({ width: 30 });
        const sections = [
          { header: 'Section 1', content: 'Content 1' },
          { header: 'Section 2', content: 'Content 2' },
        ];
        const result = renderer.sections(sections);

        expect(result).toContain('Section 1');
        expect(result).toContain('Content 1');
        expect(result).toContain('Section 2');
        expect(result).toContain('Content 2');
      });

      it('should handle sections without headers', () => {
        const renderer = new BorderRenderer({ width: 30 });
        const sections = [{ content: 'Just content' }];
        const result = renderer.sections(sections);

        expect(result).toContain('Just content');
      });

      it('should handle sections with array content', () => {
        const renderer = new BorderRenderer({ width: 30 });
        const sections = [{ header: 'Multi-line', content: ['Line A', 'Line B'] }];
        const result = renderer.sections(sections);

        expect(result).toContain('Line A');
        expect(result).toContain('Line B');
      });
    });

    describe('horizontalRule()', () => {
      it('should render horizontal rule', () => {
        const renderer = new BorderRenderer({ width: 20 });
        const result = renderer.horizontalRule();

        expect(result).toContain('[dim]');
        expect(visibleLength(stripAnsi(result).replace(/\[.*?\]/g, ''))).toBeGreaterThan(0);
      });

      it('should render double horizontal rule', () => {
        const renderer = new BorderRenderer({ width: 20 });
        const result = renderer.horizontalRule({ style: 'double' });

        expect(result).toBeDefined();
      });
    });

    describe('divider()', () => {
      it('should render divider with text', () => {
        const renderer = new BorderRenderer({ width: 30 });
        const result = renderer.divider('Section');

        expect(result).toContain('[highlight] Section [/highlight]');
      });

      it('should render plain divider without text', () => {
        const renderer = new BorderRenderer({ width: 20 });
        const result = renderer.divider();

        expect(result).toContain('[dim]');
      });
    });
  });

  // ===========================================================================
  // Factory Functions Tests
  // ===========================================================================

  describe('Factory Functions', () => {
    describe('quickBox()', () => {
      it('should render box quickly', () => {
        const result = quickBox('Hello', { width: 20 });
        expect(result).toContain('Hello');
      });
    });

    describe('quickPanel()', () => {
      it('should render panel quickly', () => {
        const result = quickPanel('Header', 'Content', { width: 30 });
        expect(result).toContain('Header');
        expect(result).toContain('Content');
      });
    });

    describe('createBorderRenderer()', () => {
      it('should create BorderRenderer instance', () => {
        const renderer = createBorderRenderer({ style: 'double' });
        expect(renderer).toBeInstanceOf(BorderRenderer);
        expect(renderer.style).toBe('double');
      });
    });
  });
});
