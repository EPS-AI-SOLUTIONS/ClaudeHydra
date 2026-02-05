/**
 * UnifiedOutputRenderer Tests
 * @module test/unit/cli-unified/output/UnifiedOutputRenderer.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock ThemeRegistry first
vi.mock('../../../../src/cli-unified/core/ThemeRegistry.js', () => ({
  themeRegistry: {
    getCurrent: vi.fn(() => ({
      colors: {
        primary: vi.fn(s => `[primary]${s}[/primary]`),
        secondary: vi.fn(s => `[secondary]${s}[/secondary]`),
        highlight: vi.fn(s => `[highlight]${s}[/highlight]`),
        dim: vi.fn(s => `[dim]${s}[/dim]`),
        info: vi.fn(s => `[info]${s}[/info]`),
        success: vi.fn(s => `[success]${s}[/success]`),
        warning: vi.fn(s => `[warning]${s}[/warning]`),
        error: vi.fn(s => `[error]${s}[/error]`),
        code: vi.fn(s => `[code]${s}[/code]`),
        border: vi.fn(s => `[border]${s}[/border]`)
      },
      symbols: {
        check: '✔',
        cross: '✘',
        warning: '⚠',
        info: 'ℹ',
        bullet: '•'
      }
    })),
    set: vi.fn(() => ({
      colors: {
        primary: vi.fn(s => s),
        secondary: vi.fn(s => s),
        highlight: vi.fn(s => s),
        dim: vi.fn(s => s),
        info: vi.fn(s => s),
        success: vi.fn(s => s),
        warning: vi.fn(s => s),
        error: vi.fn(s => s)
      },
      symbols: {}
    }))
  }
}));

// Mock EventBus
vi.mock('../../../../src/cli-unified/core/EventBus.js', () => ({
  eventBus: {
    emit: vi.fn()
  },
  EVENT_TYPES: {
    THEME_CHANGE: 'theme:change',
    RENDER_OUTPUT: 'render:output',
    RENDER_ERROR: 'render:error',
    SPINNER_START: 'spinner:start',
    SPINNER_STOP: 'spinner:stop'
  }
}));

// Mock constants
vi.mock('../../../../src/cli-unified/core/constants.js', () => ({
  ANSI: {
    CLEAR_SCREEN: '\x1b[2J',
    CURSOR_HOME: '\x1b[H',
    CLEAR_LINE: '\x1b[2K'
  },
  BORDER_STYLES: {},
  BOX_SINGLE: {
    horizontal: '─',
    vertical: '│',
    topLeft: '┌',
    topRight: '┐',
    bottomLeft: '└',
    bottomRight: '┘'
  },
  BOX_DOUBLE: {},
  BOX_ROUNDED: {
    horizontal: '─',
    vertical: '│',
    topLeft: '╭',
    topRight: '╮',
    bottomLeft: '╰',
    bottomRight: '╯'
  },
  BOX_ASCII: {}
}));

// Create mock spinner
const mockSpinner = {
  start: vi.fn(),
  stop: vi.fn(),
  succeed: vi.fn(),
  fail: vi.fn(),
  text: vi.fn()
};

// Mock sub-renderers with proper class implementations
vi.mock('../../../../src/cli-unified/output/SpinnerSystem.js', () => ({
  Spinner: class MockSpinner {},
  createSpinner: vi.fn(() => mockSpinner),
  createTypedSpinner: vi.fn(),
  createProgressBar: vi.fn(),
  createMultiSpinner: vi.fn(),
  SpinnerTypes: {},
  getAvailableSpinnerTypes: vi.fn()
}));

vi.mock('../../../../src/cli-unified/output/BorderRenderer.js', () => ({
  BorderRenderer: class MockBorderRenderer {
    constructor() {
      this.box = vi.fn(() => '[box content]');
      this.panel = vi.fn(() => '[panel content]');
      this.sections = vi.fn(() => '[sections content]');
      this.divider = vi.fn(() => '[divider]');
    }
  },
  quickBox: vi.fn(),
  quickPanel: vi.fn(),
  createBorderRenderer: vi.fn()
}));

vi.mock('../../../../src/cli-unified/output/MarkdownRenderer.js', () => ({
  MarkdownRenderer: class MockMarkdownRenderer {
    constructor() {
      this.render = vi.fn(() => '[markdown rendered]');
    }
  },
  createMarkdownRenderer: vi.fn()
}));

vi.mock('../../../../src/cli-unified/output/TableRenderer.js', () => ({
  TableRenderer: class MockTableRenderer {
    constructor() {
      this.render = vi.fn(() => '[table rendered]');
      this.renderKeyValue = vi.fn(() => '[keyvalue rendered]');
    }
  },
  ListRenderer: class MockListRenderer {
    constructor() {
      this.render = vi.fn(() => '[list rendered]');
    }
  },
  createTableRenderer: vi.fn(),
  createListRenderer: vi.fn(),
  renderTable: vi.fn(),
  renderList: vi.fn(),
  TABLE_STYLES: {},
  LIST_STYLES: {}
}));

vi.mock('../../../../src/cli-unified/output/StreamingRenderer.js', () => ({
  StreamingRenderer: class MockStreamingRenderer {
    constructor() {
      this.write = vi.fn();
      this.flush = vi.fn();
      this.reset = vi.fn();
    }
  },
  ProgressIndicator: class MockProgressIndicator {
    constructor() {
      this.start = vi.fn();
      this.advance = vi.fn();
      this.complete = vi.fn();
    }
  },
  CollapsibleSection: class MockCollapsibleSection {
    constructor(title) {
      this.title = title;
      this.add = vi.fn();
      this.toggle = vi.fn();
      this.render = vi.fn();
    }
  },
  createStreamingRenderer: vi.fn(),
  createProgressIndicator: vi.fn(() => ({
    start: vi.fn(),
    advance: vi.fn(),
    complete: vi.fn()
  }))
}));

import {
  UnifiedOutputRenderer,
  createOutputRenderer
} from '../../../../src/cli-unified/output/UnifiedOutputRenderer.js';
import { eventBus, EVENT_TYPES } from '../../../../src/cli-unified/core/EventBus.js';
import { createSpinner } from '../../../../src/cli-unified/output/SpinnerSystem.js';
import { createProgressIndicator, CollapsibleSection } from '../../../../src/cli-unified/output/StreamingRenderer.js';

describe('UnifiedOutputRenderer Module', () => {
  let stdoutWriteSpy;
  let consoleLogSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // Reset mock spinner
    mockSpinner.start.mockClear();
    mockSpinner.stop.mockClear();
    mockSpinner.succeed.mockClear();
    mockSpinner.fail.mockClear();
    mockSpinner.text.mockClear();
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  // ===========================================================================
  // Constructor Tests
  // ===========================================================================

  describe('constructor', () => {
    it('should create with defaults', () => {
      const renderer = new UnifiedOutputRenderer();
      expect(renderer.activeSpinner).toBeNull();
    });

    it('should accept custom width', () => {
      const renderer = new UnifiedOutputRenderer({ width: 120 });
      expect(renderer.width).toBe(120);
    });

    it('should initialize sub-renderers', () => {
      const renderer = new UnifiedOutputRenderer();
      expect(renderer.markdown).toBeDefined();
      expect(renderer.border).toBeDefined();
      expect(renderer.table).toBeDefined();
      expect(renderer.list).toBeDefined();
      expect(renderer.streaming).toBeDefined();
    });
  });

  // ===========================================================================
  // Theme Methods Tests
  // ===========================================================================

  describe('setTheme()', () => {
    it('should update theme and emit event', () => {
      const renderer = new UnifiedOutputRenderer();
      renderer.setTheme('dark');
      expect(eventBus.emit).toHaveBeenCalledWith(EVENT_TYPES.THEME_CHANGE, { theme: 'dark' });
    });
  });

  // ===========================================================================
  // Message Methods Tests
  // ===========================================================================

  describe('Message Methods', () => {
    describe('success()', () => {
      it('should print success message with symbol', () => {
        const renderer = new UnifiedOutputRenderer();
        renderer.success('Operation completed');
        expect(consoleLogSpy).toHaveBeenCalled();
        expect(eventBus.emit).toHaveBeenCalledWith(
          EVENT_TYPES.RENDER_OUTPUT,
          expect.objectContaining({ type: 'success' })
        );
      });
    });

    describe('error()', () => {
      it('should print error message with symbol', () => {
        const renderer = new UnifiedOutputRenderer();
        renderer.error('Something went wrong');
        expect(consoleLogSpy).toHaveBeenCalled();
        expect(eventBus.emit).toHaveBeenCalledWith(
          EVENT_TYPES.RENDER_ERROR,
          expect.objectContaining({ message: 'Something went wrong' })
        );
      });
    });

    describe('warning()', () => {
      it('should print warning message with symbol', () => {
        const renderer = new UnifiedOutputRenderer();
        renderer.warning('Be careful');
        expect(consoleLogSpy).toHaveBeenCalled();
      });
    });

    describe('info()', () => {
      it('should print info message with symbol', () => {
        const renderer = new UnifiedOutputRenderer();
        renderer.info('Some information');
        expect(consoleLogSpy).toHaveBeenCalled();
      });
    });

    describe('dim()', () => {
      it('should print dimmed message', () => {
        const renderer = new UnifiedOutputRenderer();
        renderer.dim('Dimmed text');
        expect(consoleLogSpy).toHaveBeenCalled();
      });
    });

    describe('highlight()', () => {
      it('should print highlighted message', () => {
        const renderer = new UnifiedOutputRenderer();
        renderer.highlight('Important text');
        expect(consoleLogSpy).toHaveBeenCalled();
      });
    });

    describe('print()', () => {
      it('should print with newline by default', () => {
        const renderer = new UnifiedOutputRenderer();
        renderer.print('Message');
        expect(consoleLogSpy).toHaveBeenCalledWith('Message');
      });

      it('should print without newline when specified', () => {
        const renderer = new UnifiedOutputRenderer();
        renderer.print('Message', { newline: false });
        expect(stdoutWriteSpy).toHaveBeenCalledWith('Message');
      });
    });

    describe('newline()', () => {
      it('should print single newline by default', () => {
        const renderer = new UnifiedOutputRenderer();
        renderer.newline();
        expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      });

      it('should print multiple newlines', () => {
        const renderer = new UnifiedOutputRenderer();
        renderer.newline(3);
        expect(consoleLogSpy).toHaveBeenCalledTimes(3);
      });
    });
  });

  // ===========================================================================
  // Spinner Methods Tests
  // ===========================================================================

  describe('Spinner Methods', () => {
    describe('startSpinner()', () => {
      it('should create and start spinner', () => {
        const renderer = new UnifiedOutputRenderer();
        const spinner = renderer.startSpinner('Loading...');
        expect(createSpinner).toHaveBeenCalled();
        expect(mockSpinner.start).toHaveBeenCalled();
        expect(eventBus.emit).toHaveBeenCalledWith(
          EVENT_TYPES.SPINNER_START,
          { text: 'Loading...' }
        );
      });

      it('should stop previous spinner', () => {
        const renderer = new UnifiedOutputRenderer();
        renderer.startSpinner('First');
        renderer.startSpinner('Second');
        expect(mockSpinner.stop).toHaveBeenCalled();
      });
    });

    describe('stopSpinnerSuccess()', () => {
      it('should stop spinner with success', () => {
        const renderer = new UnifiedOutputRenderer();
        renderer.startSpinner('Loading');
        renderer.stopSpinnerSuccess('Done!');
        expect(renderer.activeSpinner).toBeNull();
        expect(eventBus.emit).toHaveBeenCalledWith(
          EVENT_TYPES.SPINNER_STOP,
          expect.objectContaining({ success: true })
        );
      });

      it('should do nothing if no active spinner', () => {
        const renderer = new UnifiedOutputRenderer();
        renderer.stopSpinnerSuccess('Done!');
        // No error should be thrown
      });
    });

    describe('stopSpinnerFail()', () => {
      it('should stop spinner with failure', () => {
        const renderer = new UnifiedOutputRenderer();
        renderer.startSpinner('Loading');
        renderer.stopSpinnerFail('Failed!');
        expect(renderer.activeSpinner).toBeNull();
        expect(eventBus.emit).toHaveBeenCalledWith(
          EVENT_TYPES.SPINNER_STOP,
          expect.objectContaining({ success: false })
        );
      });
    });

    describe('stopSpinner()', () => {
      it('should stop spinner silently', () => {
        const renderer = new UnifiedOutputRenderer();
        renderer.startSpinner('Loading');
        renderer.stopSpinner();
        expect(renderer.activeSpinner).toBeNull();
        expect(eventBus.emit).toHaveBeenCalledWith(
          EVENT_TYPES.SPINNER_STOP,
          {}
        );
      });
    });

    describe('updateSpinner()', () => {
      it('should update spinner text', () => {
        const renderer = new UnifiedOutputRenderer();
        renderer.startSpinner('Loading');
        renderer.updateSpinner('Still loading...');
        expect(mockSpinner.text).toHaveBeenCalledWith('Still loading...');
      });

      it('should do nothing if no active spinner', () => {
        const renderer = new UnifiedOutputRenderer();
        renderer.updateSpinner('Text');
        // No error should be thrown
      });
    });
  });

  // ===========================================================================
  // Box/Panel Methods Tests
  // ===========================================================================

  describe('Box/Panel Methods', () => {
    describe('box()', () => {
      it('should render and print box', () => {
        const renderer = new UnifiedOutputRenderer();
        const result = renderer.box('Content');
        expect(renderer.border.box).toHaveBeenCalledWith('Content', {});
        expect(consoleLogSpy).toHaveBeenCalled();
        expect(result).toBe('[box content]');
      });
    });

    describe('panel()', () => {
      it('should render and print panel', () => {
        const renderer = new UnifiedOutputRenderer();
        const result = renderer.panel('Header', 'Content');
        expect(renderer.border.panel).toHaveBeenCalledWith('Header', 'Content', {});
        expect(consoleLogSpy).toHaveBeenCalled();
        expect(result).toBe('[panel content]');
      });
    });

    describe('sections()', () => {
      it('should render and print sections', () => {
        const renderer = new UnifiedOutputRenderer();
        const sectionsData = [{ header: 'H1', content: 'C1' }];
        const result = renderer.sections(sectionsData);
        expect(renderer.border.sections).toHaveBeenCalledWith(sectionsData, {});
        expect(result).toBe('[sections content]');
      });
    });

    describe('divider()', () => {
      it('should render and print divider', () => {
        const renderer = new UnifiedOutputRenderer();
        const result = renderer.divider('Section');
        expect(renderer.border.divider).toHaveBeenCalledWith('Section', {});
        expect(result).toBe('[divider]');
      });
    });
  });

  // ===========================================================================
  // Markdown Methods Tests
  // ===========================================================================

  describe('Markdown Methods', () => {
    describe('renderMarkdown()', () => {
      it('should render and print markdown', () => {
        const renderer = new UnifiedOutputRenderer();
        const result = renderer.renderMarkdown('# Title');
        expect(renderer.markdown.render).toHaveBeenCalledWith('# Title');
        expect(consoleLogSpy).toHaveBeenCalled();
        expect(result).toBe('[markdown rendered]');
      });
    });
  });

  // ===========================================================================
  // Table/List Methods Tests
  // ===========================================================================

  describe('Table/List Methods', () => {
    describe('renderTable()', () => {
      it('should render and print table', () => {
        const renderer = new UnifiedOutputRenderer();
        const headers = ['A', 'B'];
        const rows = [['1', '2']];
        const result = renderer.renderTable(headers, rows);
        expect(renderer.table.render).toHaveBeenCalledWith(headers, rows, {});
        expect(result).toBe('[table rendered]');
      });
    });

    describe('renderKeyValue()', () => {
      it('should render and print key-value table', () => {
        const renderer = new UnifiedOutputRenderer();
        const data = { key: 'value' };
        const result = renderer.renderKeyValue(data);
        expect(renderer.table.renderKeyValue).toHaveBeenCalledWith(data, {});
        expect(result).toBe('[keyvalue rendered]');
      });
    });

    describe('renderList()', () => {
      it('should render and print list', () => {
        const renderer = new UnifiedOutputRenderer();
        const items = ['Item 1', 'Item 2'];
        const result = renderer.renderList(items);
        expect(renderer.list.render).toHaveBeenCalledWith(items, {});
        expect(result).toBe('[list rendered]');
      });
    });
  });

  // ===========================================================================
  // Streaming Methods Tests
  // ===========================================================================

  describe('Streaming Methods', () => {
    describe('streamWrite()', () => {
      it('should write to streaming renderer', () => {
        const renderer = new UnifiedOutputRenderer();
        renderer.streamWrite('token');
        expect(renderer.streaming.write).toHaveBeenCalledWith('token');
      });
    });

    describe('streamFlush()', () => {
      it('should flush streaming renderer', () => {
        const renderer = new UnifiedOutputRenderer();
        renderer.streamFlush();
        expect(renderer.streaming.flush).toHaveBeenCalled();
      });
    });

    describe('streamReset()', () => {
      it('should reset streaming renderer', () => {
        const renderer = new UnifiedOutputRenderer();
        renderer.streamReset();
        expect(renderer.streaming.reset).toHaveBeenCalled();
      });
    });
  });

  // ===========================================================================
  // Utility Methods Tests
  // ===========================================================================

  describe('Utility Methods', () => {
    describe('clear()', () => {
      it('should write clear screen sequence', () => {
        const renderer = new UnifiedOutputRenderer();
        renderer.clear();
        expect(stdoutWriteSpy).toHaveBeenCalledWith('\x1b[2J\x1b[H');
      });
    });

    describe('clearLine()', () => {
      it('should write clear line sequence', () => {
        const renderer = new UnifiedOutputRenderer();
        renderer.clearLine();
        expect(stdoutWriteSpy).toHaveBeenCalledWith('\r\x1b[2K');
      });
    });

    describe('getWidth()', () => {
      it('should return terminal width', () => {
        const renderer = new UnifiedOutputRenderer({ width: 80 });
        const width = renderer.getWidth();
        expect(typeof width).toBe('number');
      });
    });

    describe('createProgressIndicator()', () => {
      it('should create progress indicator', () => {
        const renderer = new UnifiedOutputRenderer();
        const stages = ['Step 1', 'Step 2'];
        const indicator = renderer.createProgressIndicator(stages);
        expect(createProgressIndicator).toHaveBeenCalled();
        expect(indicator).toBeDefined();
      });
    });

    describe('createCollapsibleSection()', () => {
      it('should create collapsible section', () => {
        const renderer = new UnifiedOutputRenderer();
        const section = renderer.createCollapsibleSection('Title');
        expect(section).toBeDefined();
        expect(section.title).toBe('Title');
      });
    });
  });

  // ===========================================================================
  // Factory Function Tests
  // ===========================================================================

  describe('createOutputRenderer()', () => {
    it('should create UnifiedOutputRenderer instance', () => {
      const renderer = createOutputRenderer();
      expect(renderer).toBeInstanceOf(UnifiedOutputRenderer);
    });

    it('should pass options to constructor', () => {
      const renderer = createOutputRenderer({ width: 100 });
      expect(renderer.width).toBe(100);
    });
  });
});
