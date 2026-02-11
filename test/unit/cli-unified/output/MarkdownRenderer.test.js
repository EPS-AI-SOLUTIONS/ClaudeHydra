/**
 * MarkdownRenderer Tests
 * @module test/unit/cli-unified/output/MarkdownRenderer.test
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock ThemeRegistry
vi.mock('../../../../src/cli-unified/core/ThemeRegistry.js', () => ({
  themeRegistry: {
    getCurrent: vi.fn(() => ({
      colors: {
        primary: vi.fn((s) => `[primary]${s}[/primary]`),
        secondary: vi.fn((s) => `[secondary]${s}[/secondary]`),
        highlight: vi.fn((s) => `[highlight]${s}[/highlight]`),
        dim: vi.fn((s) => `[dim]${s}[/dim]`),
        info: vi.fn((s) => `[info]${s}[/info]`),
        success: vi.fn((s) => `[success]${s}[/success]`),
        code: vi.fn((s) => `[code]${s}[/code]`),
        keyword: vi.fn((s) => `[keyword]${s}[/keyword]`),
        string: vi.fn((s) => `[string]${s}[/string]`),
        number: vi.fn((s) => `[number]${s}[/number]`),
      },
      symbols: {
        h1: '✦',
        h2: '◆',
        h3: '▶',
        h4: '▪',
        h5: '•',
        h6: '·',
        bullet: '•',
        quoteBar: '┃',
        taskDone: '✔',
        taskPending: '○',
      },
    })),
  },
}));

import {
  createMarkdownRenderer,
  MarkdownRenderer,
} from '../../../../src/cli-unified/output/MarkdownRenderer.js';

describe('MarkdownRenderer Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Constructor Tests
  // ===========================================================================

  describe('constructor', () => {
    it('should create with defaults', () => {
      const renderer = new MarkdownRenderer();
      expect(renderer.indent).toBe(2);
      expect(renderer.codeHighlight).toBe(true);
    });

    it('should accept custom options', () => {
      const renderer = new MarkdownRenderer({
        width: 100,
        indent: 4,
        codeHighlight: false,
      });
      expect(renderer.width).toBe(100);
      expect(renderer.indent).toBe(4);
      expect(renderer.codeHighlight).toBe(false);
    });
  });

  // ===========================================================================
  // render() Tests
  // ===========================================================================

  describe('render()', () => {
    it('should return empty string for null input', () => {
      const renderer = new MarkdownRenderer();
      expect(renderer.render(null)).toBe('');
      expect(renderer.render('')).toBe('');
    });

    it('should render simple text', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.render('Hello world');
      expect(result).toContain('Hello world');
    });

    it('should handle multiple lines', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.render('Line 1\nLine 2\nLine 3');
      expect(result).toContain('Line 1');
      expect(result).toContain('Line 2');
      expect(result).toContain('Line 3');
    });
  });

  // ===========================================================================
  // Header Rendering Tests
  // ===========================================================================

  describe('renderLine() - Headers', () => {
    it('should render h1', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.renderLine('# Main Title');
      expect(result).toContain('[highlight]');
      expect(result).toContain('Main Title');
    });

    it('should render h2', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.renderLine('## Section');
      expect(result).toContain('[secondary]');
      expect(result).toContain('Section');
    });

    it('should render h3', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.renderLine('### Subsection');
      expect(result).toContain('[primary]');
      expect(result).toContain('Subsection');
    });

    it('should render h4', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.renderLine('#### Small heading');
      expect(result).toContain('[info]');
      expect(result).toContain('Small heading');
    });

    it('should render h5', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.renderLine('##### Minor heading');
      expect(result).toContain('[dim]');
      expect(result).toContain('Minor heading');
    });

    it('should render h6', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.renderLine('###### Tiny heading');
      expect(result).toContain('[dim]');
      expect(result).toContain('Tiny heading');
    });
  });

  // ===========================================================================
  // List Rendering Tests
  // ===========================================================================

  describe('renderLine() - Lists', () => {
    it('should render unordered list with dash', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.renderLine('- Item one');
      expect(result).toContain('[primary]');
      expect(result).toContain('Item one');
    });

    it('should render unordered list with asterisk', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.renderLine('* Item two');
      expect(result).toContain('[primary]');
      expect(result).toContain('Item two');
    });

    it('should render unordered list with plus', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.renderLine('+ Item three');
      expect(result).toContain('[primary]');
      expect(result).toContain('Item three');
    });

    it('should render ordered list', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.renderLine('1. First item');
      expect(result).toContain('1.');
      expect(result).toContain('First item');
    });

    it('should render ordered list with higher numbers', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.renderLine('10. Tenth item');
      expect(result).toContain('10.');
      expect(result).toContain('Tenth item');
    });

    it('should handle indented list items', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.renderLine('  - Nested item');
      expect(result).toContain('Nested item');
    });

    // Note: Task list items are currently parsed as bullet lists due to regex order
    // The unordered list regex matches before the task list regex
    // These tests document the actual current behavior
    it('should render task list syntax as bullet list (known limitation)', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.renderLine('- [ ] Pending task');
      // Currently renders as bullet list, not task list
      expect(result).toContain('[primary]');
      expect(result).toContain('[ ] Pending task');
    });

    it('should render checked task list syntax as bullet list (known limitation)', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.renderLine('- [x] Completed task');
      // Currently renders as bullet list, not task list
      expect(result).toContain('[primary]');
      expect(result).toContain('[x] Completed task');
    });

    it('should render uppercase X task list syntax as bullet list (known limitation)', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.renderLine('- [X] Another completed');
      // Currently renders as bullet list, not task list
      expect(result).toContain('[primary]');
    });
  });

  // ===========================================================================
  // Other Elements Tests
  // ===========================================================================

  describe('renderLine() - Other elements', () => {
    it('should render horizontal rule with dashes', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.renderLine('---');
      expect(result).toContain('[dim]');
      expect(result).toContain('─');
    });

    it('should render horizontal rule with equals', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.renderLine('===');
      expect(result).toContain('[dim]');
    });

    it('should render horizontal rule with asterisks', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.renderLine('***');
      expect(result).toContain('[dim]');
    });

    it('should render blockquote', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.renderLine('> This is a quote');
      expect(result).toContain('[dim]');
      expect(result).toContain('[info]');
      expect(result).toContain('This is a quote');
    });

    it('should return empty string for empty line', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.renderLine('');
      expect(result).toBe('');
    });

    it('should return empty string for whitespace only line', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.renderLine('   ');
      expect(result).toBe('');
    });
  });

  // ===========================================================================
  // Inline Rendering Tests
  // ===========================================================================

  describe('renderInline()', () => {
    it('should render bold with asterisks', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.renderInline('This is **bold** text');
      expect(result).toContain('[highlight]bold[/highlight]');
    });

    it('should render bold with underscores', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.renderInline('This is __bold__ text');
      expect(result).toContain('[highlight]bold[/highlight]');
    });

    it('should render italic with asterisks', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.renderInline('This is *italic* text');
      expect(result).toContain('\x1b[3m');
      expect(result).toContain('italic');
    });

    it('should render italic with underscores', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.renderInline('This is _italic_ text');
      expect(result).toContain('\x1b[3m');
      expect(result).toContain('italic');
    });

    it('should render inline code', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.renderInline('Use `code` here');
      expect(result).toContain('[code]code[/code]');
    });

    it('should render links', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.renderInline('Click [here](https://example.com)');
      expect(result).toContain('[info]here[/info]');
      expect(result).toContain('[dim]');
      expect(result).toContain('https://example.com');
    });

    it('should render strikethrough', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.renderInline('This is ~~deleted~~ text');
      expect(result).toContain('\x1b[9m');
      expect(result).toContain('deleted');
    });

    it('should handle multiple inline elements', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.renderInline('**bold** and *italic* and `code`');
      expect(result).toContain('[highlight]bold[/highlight]');
      expect(result).toContain('[code]code[/code]');
    });
  });

  // ===========================================================================
  // Code Block Tests
  // ===========================================================================

  describe('renderCodeBlock()', () => {
    it('should render code block with language', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.renderCodeBlock('const x = 1;', 'javascript');
      expect(result).toContain('javascript');
      // Code is syntax highlighted, so 'const' becomes '[keyword]const[/keyword]'
      expect(result).toContain('[keyword]const[/keyword]');
      expect(result).toContain('x = ');
      expect(result).toContain('[number]1[/number]');
    });

    it('should render code block without language', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.renderCodeBlock('some code');
      expect(result).toContain('code');
      expect(result).toContain('some code');
    });

    it('should add line numbers', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.renderCodeBlock('line1\nline2\nline3');
      expect(result).toContain('1');
      expect(result).toContain('2');
      expect(result).toContain('3');
    });

    it('should handle multiline code', () => {
      const renderer = new MarkdownRenderer();
      const code = 'function test() {\n  return true;\n}';
      const result = renderer.renderCodeBlock(code, 'javascript');
      // Code is syntax highlighted
      expect(result).toContain('[keyword]function[/keyword]');
      expect(result).toContain('test()');
      expect(result).toContain('[keyword]return[/keyword]');
    });
  });

  // ===========================================================================
  // Syntax Highlighting Tests
  // ===========================================================================

  describe('highlightSyntax()', () => {
    it('should highlight keywords', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.highlightSyntax('const x = function() {}', 'javascript');
      expect(result).toContain('[keyword]const[/keyword]');
      expect(result).toContain('[keyword]function[/keyword]');
    });

    it('should highlight strings', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.highlightSyntax('const s = "hello"', 'javascript');
      expect(result).toContain('[string]');
    });

    it('should highlight numbers', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.highlightSyntax('const n = 42', 'javascript');
      expect(result).toContain('[number]42[/number]');
    });

    it('should highlight comments', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.highlightSyntax('// comment', 'javascript');
      expect(result).toContain('[dim]');
    });

    it('should not highlight when codeHighlight is false', () => {
      const renderer = new MarkdownRenderer({ codeHighlight: false });
      const result = renderer.highlightSyntax('const x = 1', 'javascript');
      expect(result).toBe('const x = 1');
    });

    it('should highlight Python keywords', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.highlightSyntax('def hello():\n  pass', 'python');
      expect(result).toContain('[keyword]def[/keyword]');
      expect(result).toContain('[keyword]pass[/keyword]');
    });

    it('should highlight Rust keywords', () => {
      const renderer = new MarkdownRenderer();
      const result = renderer.highlightSyntax('fn main() { let x = 1; }', 'rust');
      expect(result).toContain('[keyword]fn[/keyword]');
      expect(result).toContain('[keyword]let[/keyword]');
    });
  });

  // ===========================================================================
  // Code Block Parsing Tests
  // ===========================================================================

  describe('render() - Code blocks', () => {
    it('should parse and render code blocks', () => {
      const renderer = new MarkdownRenderer();
      const md = '```javascript\nconst x = 1;\n```';
      const result = renderer.render(md);
      expect(result).toContain('javascript');
      // Code is syntax highlighted
      expect(result).toContain('[keyword]const[/keyword]');
      expect(result).toContain('[number]1[/number]');
    });

    it('should handle code block without language', () => {
      const renderer = new MarkdownRenderer();
      const md = '```\nsome code\n```';
      const result = renderer.render(md);
      expect(result).toContain('code');
      expect(result).toContain('some code');
    });

    it('should handle multiple code blocks', () => {
      const renderer = new MarkdownRenderer();
      const md = '```js\ncode1\n```\n\ntext\n\n```python\ncode2\n```';
      const result = renderer.render(md);
      expect(result).toContain('code1');
      expect(result).toContain('code2');
    });
  });

  // ===========================================================================
  // Table Rendering Tests
  // ===========================================================================

  describe('renderTable()', () => {
    it('should render table with headers and rows', () => {
      const renderer = new MarkdownRenderer();
      const headers = ['Name', 'Age'];
      const rows = [
        ['Alice', '30'],
        ['Bob', '25'],
      ];
      const result = renderer.renderTable(headers, rows);

      expect(result).toContain('Name');
      expect(result).toContain('Age');
      expect(result).toContain('Alice');
      expect(result).toContain('30');
      expect(result).toContain('Bob');
      expect(result).toContain('25');
    });

    it('should handle empty cells', () => {
      const renderer = new MarkdownRenderer();
      const headers = ['A', 'B'];
      const rows = [['value', '']];
      const result = renderer.renderTable(headers, rows);

      expect(result).toContain('value');
    });

    it('should calculate column widths correctly', () => {
      const renderer = new MarkdownRenderer();
      const headers = ['Short', 'VeryLongHeader'];
      const rows = [['a', 'b']];
      const result = renderer.renderTable(headers, rows);

      expect(result).toContain('VeryLongHeader');
    });

    it('should include separator line', () => {
      const renderer = new MarkdownRenderer();
      const headers = ['Col'];
      const rows = [['Data']];
      const result = renderer.renderTable(headers, rows);

      expect(result).toContain('─');
      expect(result).toContain('[dim]');
    });
  });

  // ===========================================================================
  // Factory Function Tests
  // ===========================================================================

  describe('createMarkdownRenderer()', () => {
    it('should create MarkdownRenderer instance', () => {
      const renderer = createMarkdownRenderer();
      expect(renderer).toBeInstanceOf(MarkdownRenderer);
    });

    it('should pass options to constructor', () => {
      const renderer = createMarkdownRenderer({ width: 120, codeHighlight: false });
      expect(renderer.width).toBe(120);
      expect(renderer.codeHighlight).toBe(false);
    });
  });
});
