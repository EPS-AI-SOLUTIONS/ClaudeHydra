/**
 * TableRenderer Tests
 * @module test/unit/cli-unified/output/TableRenderer.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock ThemeRegistry
vi.mock('../../../../src/cli-unified/core/ThemeRegistry.js', () => ({
  themeRegistry: {
    getCurrent: vi.fn(() => ({
      colors: {
        primary: vi.fn(s => `[primary]${s}[/primary]`),
        highlight: vi.fn(s => `[highlight]${s}[/highlight]`),
        dim: vi.fn(s => `[dim]${s}[/dim]`),
        border: vi.fn(s => `[border]${s}[/border]`)
      }
    }))
  }
}));

// Mock constants
vi.mock('../../../../src/cli-unified/core/constants.js', () => ({
  BORDER_STYLES: {},
  BOX_SINGLE: {
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
    cross: '┼'
  },
  BOX_DOUBLE: {
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
    cross: '╬'
  },
  BOX_ROUNDED: {
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
    cross: '┼'
  },
  BOX_ASCII: {
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
    cross: '+'
  }
}));

import {
  TABLE_STYLES,
  LIST_STYLES,
  ALIGNMENT,
  TableRenderer,
  ListRenderer,
  createTableRenderer,
  createListRenderer,
  renderTable,
  renderList
} from '../../../../src/cli-unified/output/TableRenderer.js';

describe('TableRenderer Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Constants Tests
  // ===========================================================================

  describe('TABLE_STYLES', () => {
    it('should define simple style', () => {
      expect(TABLE_STYLES.simple).toBeDefined();
      expect(TABLE_STYLES.simple.showBorders).toBe(false);
    });

    it('should define grid style', () => {
      expect(TABLE_STYLES.grid).toBeDefined();
      expect(TABLE_STYLES.grid.showBorders).toBe(true);
    });

    it('should define outline style', () => {
      expect(TABLE_STYLES.outline).toBeDefined();
      expect(TABLE_STYLES.outline.innerBorders).toBe(false);
    });

    it('should define double style', () => {
      expect(TABLE_STYLES.double).toBeDefined();
      expect(TABLE_STYLES.double.showBorders).toBe(true);
    });

    it('should define rounded style', () => {
      expect(TABLE_STYLES.rounded).toBeDefined();
    });

    it('should define compact style', () => {
      expect(TABLE_STYLES.compact).toBeDefined();
      expect(TABLE_STYLES.compact.showBorders).toBe(false);
    });

    it('should define minimal style', () => {
      expect(TABLE_STYLES.minimal).toBeDefined();
      expect(TABLE_STYLES.minimal.padding).toBe(0);
    });
  });

  describe('LIST_STYLES', () => {
    it('should define bullet style', () => {
      expect(LIST_STYLES.bullet).toBeDefined();
      expect(LIST_STYLES.bullet.marker).toBe('•');
    });

    it('should define dash style', () => {
      expect(LIST_STYLES.dash).toBeDefined();
      expect(LIST_STYLES.dash.marker).toBe('-');
    });

    it('should define arrow style', () => {
      expect(LIST_STYLES.arrow).toBeDefined();
      expect(LIST_STYLES.arrow.marker).toBe('→');
    });

    it('should define number style with null marker', () => {
      expect(LIST_STYLES.number).toBeDefined();
      expect(LIST_STYLES.number.marker).toBeNull();
    });

    it('should define letter style with null marker', () => {
      expect(LIST_STYLES.letter).toBeDefined();
      expect(LIST_STYLES.letter.marker).toBeNull();
    });
  });

  describe('ALIGNMENT', () => {
    it('should define alignment constants', () => {
      expect(ALIGNMENT.LEFT).toBe('left');
      expect(ALIGNMENT.CENTER).toBe('center');
      expect(ALIGNMENT.RIGHT).toBe('right');
    });
  });

  // ===========================================================================
  // TableRenderer Class Tests
  // ===========================================================================

  describe('TableRenderer', () => {
    describe('constructor', () => {
      it('should create with defaults', () => {
        const renderer = new TableRenderer();
        expect(renderer.style).toBe('rounded');
        expect(renderer.padding).toBe(1);
        expect(renderer.zebra).toBe(false);
      });

      it('should accept custom options', () => {
        const renderer = new TableRenderer({
          style: 'grid',
          padding: 2,
          zebra: true,
          maxWidth: 80
        });
        expect(renderer.style).toBe('grid');
        expect(renderer.padding).toBe(2);
        expect(renderer.zebra).toBe(true);
        expect(renderer.maxWidth).toBe(80);
      });
    });

    describe('getStyleConfig()', () => {
      it('should return style config', () => {
        const renderer = new TableRenderer({ style: 'grid' });
        const config = renderer.getStyleConfig();
        expect(config).toBe(TABLE_STYLES.grid);
      });

      it('should return rounded as fallback', () => {
        const renderer = new TableRenderer({ style: 'nonexistent' });
        const config = renderer.getStyleConfig();
        expect(config).toBe(TABLE_STYLES.rounded);
      });
    });

    describe('render()', () => {
      it('should render a basic table', () => {
        const renderer = new TableRenderer({ style: 'simple' });
        const headers = ['Name', 'Age'];
        const rows = [['Alice', '30'], ['Bob', '25']];
        const result = renderer.render(headers, rows);

        expect(result).toContain('Name');
        expect(result).toContain('Age');
        expect(result).toContain('Alice');
        expect(result).toContain('Bob');
      });

      it('should render table with borders', () => {
        const renderer = new TableRenderer({ style: 'grid' });
        const headers = ['Col1', 'Col2'];
        const rows = [['A', 'B']];
        const result = renderer.render(headers, rows);

        expect(result).toContain('[border]');
      });

      it('should handle zebra striping', () => {
        const renderer = new TableRenderer({ style: 'simple', zebra: true });
        const headers = ['Name'];
        const rows = [['Row1'], ['Row2'], ['Row3']];
        const result = renderer.render(headers, rows);

        // Zebra should dim alternate rows
        expect(result).toContain('[dim]');
      });

      it('should handle empty rows', () => {
        const renderer = new TableRenderer();
        const headers = ['Header'];
        const rows = [];
        const result = renderer.render(headers, rows);

        expect(result).toContain('Header');
      });

      it('should handle undefined values in rows', () => {
        const renderer = new TableRenderer({ style: 'simple' });
        const headers = ['A', 'B'];
        const rows = [['value', undefined]];
        const result = renderer.render(headers, rows);

        expect(result).toContain('value');
      });
    });

    describe('calculateWidths()', () => {
      it('should calculate column widths based on content', () => {
        const renderer = new TableRenderer();
        const headers = ['Name', 'Description'];
        const rows = [['A', 'Short'], ['BB', 'Much longer text']];
        const widths = renderer.calculateWidths(headers, rows);

        expect(widths[0]).toBe(4); // 'Name' is longest in col 0
        expect(widths[1]).toBe(16); // 'Much longer text' is longest
      });

      it('should use header width if larger', () => {
        const renderer = new TableRenderer();
        const headers = ['VeryLongHeader'];
        const rows = [['A']];
        const widths = renderer.calculateWidths(headers, rows);

        expect(widths[0]).toBe(14); // header length
      });
    });

    describe('renderKeyValue()', () => {
      it('should render object as key-value table', () => {
        const renderer = new TableRenderer({ style: 'simple' });
        const data = { name: 'Alice', age: '30' };
        const result = renderer.renderKeyValue(data);

        expect(result).toContain('name');
        expect(result).toContain('Alice');
        expect(result).toContain('age');
        expect(result).toContain('30');
      });

      it('should render array as key-value table', () => {
        const renderer = new TableRenderer({ style: 'simple' });
        const data = [['key1', 'value1'], ['key2', 'value2']];
        const result = renderer.renderKeyValue(data);

        expect(result).toContain('key1');
        expect(result).toContain('value1');
      });

      it('should use custom headers', () => {
        const renderer = new TableRenderer({ style: 'simple' });
        const data = { foo: 'bar' };
        const result = renderer.renderKeyValue(data, { headers: ['Property', 'Setting'] });

        expect(result).toContain('Property');
        expect(result).toContain('Setting');
      });
    });
  });

  // ===========================================================================
  // ListRenderer Class Tests
  // ===========================================================================

  describe('ListRenderer', () => {
    describe('constructor', () => {
      it('should create with defaults', () => {
        const renderer = new ListRenderer();
        expect(renderer.style).toBe('bullet');
        expect(renderer.indent).toBe(2);
      });

      it('should accept custom options', () => {
        const renderer = new ListRenderer({
          style: 'number',
          indent: 4
        });
        expect(renderer.style).toBe('number');
        expect(renderer.indent).toBe(4);
      });
    });

    describe('getStyleConfig()', () => {
      it('should return style config', () => {
        const renderer = new ListRenderer({ style: 'dash' });
        const config = renderer.getStyleConfig();
        expect(config).toBe(LIST_STYLES.dash);
      });

      it('should return bullet as fallback', () => {
        const renderer = new ListRenderer({ style: 'nonexistent' });
        const config = renderer.getStyleConfig();
        expect(config).toBe(LIST_STYLES.bullet);
      });
    });

    describe('render()', () => {
      it('should render bullet list', () => {
        const renderer = new ListRenderer({ style: 'bullet' });
        const items = ['Item 1', 'Item 2', 'Item 3'];
        const result = renderer.render(items);

        expect(result).toContain('Item 1');
        expect(result).toContain('Item 2');
        expect(result).toContain('Item 3');
        expect(result).toContain('[primary]•[/primary]');
      });

      it('should render numbered list', () => {
        const renderer = new ListRenderer({ style: 'number' });
        const items = ['First', 'Second', 'Third'];
        const result = renderer.render(items);

        expect(result).toContain('1.');
        expect(result).toContain('2.');
        expect(result).toContain('3.');
      });

      it('should render lettered list', () => {
        const renderer = new ListRenderer({ style: 'letter' });
        const items = ['First', 'Second', 'Third'];
        const result = renderer.render(items);

        expect(result).toContain('a.');
        expect(result).toContain('b.');
        expect(result).toContain('c.');
      });

      it('should render nested items', () => {
        const renderer = new ListRenderer({ style: 'bullet' });
        const items = [
          {
            text: 'Parent',
            children: ['Child 1', 'Child 2']
          }
        ];
        const result = renderer.render(items);

        expect(result).toContain('Parent');
        expect(result).toContain('Child 1');
        expect(result).toContain('Child 2');
      });

      it('should handle items with level property', () => {
        const renderer = new ListRenderer({ style: 'bullet' });
        const items = [
          { text: 'Level 0', level: 0 },
          { text: 'Level 1', level: 1 }
        ];
        const result = renderer.render(items);

        expect(result).toContain('Level 0');
        expect(result).toContain('Level 1');
      });
    });

    describe('renderDefinitions()', () => {
      it('should render definition list', () => {
        const renderer = new ListRenderer();
        const definitions = {
          'Term 1': 'Definition 1',
          'Term 2': 'Definition 2'
        };
        const result = renderer.renderDefinitions(definitions);

        expect(result).toContain('[highlight]Term 1[/highlight]');
        expect(result).toContain('[dim]Definition 1[/dim]');
        expect(result).toContain('[highlight]Term 2[/highlight]');
        expect(result).toContain('[dim]Definition 2[/dim]');
      });
    });
  });

  // ===========================================================================
  // Factory Functions Tests
  // ===========================================================================

  describe('Factory Functions', () => {
    describe('createTableRenderer()', () => {
      it('should create TableRenderer instance', () => {
        const renderer = createTableRenderer({ style: 'grid' });
        expect(renderer).toBeInstanceOf(TableRenderer);
        expect(renderer.style).toBe('grid');
      });
    });

    describe('createListRenderer()', () => {
      it('should create ListRenderer instance', () => {
        const renderer = createListRenderer({ style: 'dash' });
        expect(renderer).toBeInstanceOf(ListRenderer);
        expect(renderer.style).toBe('dash');
      });
    });

    describe('renderTable()', () => {
      it('should render table directly', () => {
        const result = renderTable(['A', 'B'], [['1', '2']], { style: 'simple' });
        expect(result).toContain('A');
        expect(result).toContain('B');
        expect(result).toContain('1');
        expect(result).toContain('2');
      });
    });

    describe('renderList()', () => {
      it('should render list directly', () => {
        const result = renderList(['Item 1', 'Item 2']);
        expect(result).toContain('Item 1');
        expect(result).toContain('Item 2');
      });
    });
  });
});
