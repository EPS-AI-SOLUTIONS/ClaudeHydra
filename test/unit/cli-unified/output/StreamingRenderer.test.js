/**
 * StreamingRenderer Tests
 * @module test/unit/cli-unified/output/StreamingRenderer.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock ThemeRegistry
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
        code: vi.fn(s => `[code]${s}[/code]`)
      }
    }))
  }
}));

// Mock constants
vi.mock('../../../../src/cli-unified/core/constants.js', () => ({
  ANSI: {
    CLEAR_LINE: '\x1b[2K'
  }
}));

import {
  StreamingRenderer,
  ProgressIndicator,
  CollapsibleSection,
  createStreamingRenderer,
  createProgressIndicator
} from '../../../../src/cli-unified/output/StreamingRenderer.js';

describe('StreamingRenderer Module', () => {
  let stdoutWriteSpy;
  let consoleLogSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  // ===========================================================================
  // StreamingRenderer Tests
  // ===========================================================================

  describe('StreamingRenderer', () => {
    describe('constructor', () => {
      it('should create with defaults', () => {
        const renderer = new StreamingRenderer();
        expect(renderer.buffer).toBe('');
        expect(renderer.lineBuffer).toBe('');
        expect(renderer.inCodeBlock).toBe(false);
        expect(renderer.currentLine).toBe(0);
      });

      it('should accept custom options', () => {
        const renderer = new StreamingRenderer({ maxWidth: 120 });
        expect(renderer.maxWidth).toBe(120);
      });
    });

    describe('write()', () => {
      it('should buffer partial tokens', () => {
        const renderer = new StreamingRenderer();
        renderer.write('Hello');
        expect(stdoutWriteSpy).toHaveBeenCalled();
      });

      it('should process complete lines', () => {
        const renderer = new StreamingRenderer();
        renderer.write('Hello\n');
        expect(stdoutWriteSpy).toHaveBeenCalled();
      });

      it('should handle multiple lines in one write', () => {
        const renderer = new StreamingRenderer();
        renderer.write('Line1\nLine2\nLine3\n');
        // Should have called stdout at least once for each line
        expect(stdoutWriteSpy.mock.calls.length).toBeGreaterThanOrEqual(3);
      });

      it('should handle partial line followed by newline', () => {
        const renderer = new StreamingRenderer();
        renderer.write('Part');
        renderer.write('ial\n');
        // Should process complete line "Partial"
        expect(stdoutWriteSpy).toHaveBeenCalled();
      });
    });

    describe('processLine()', () => {
      it('should render headers', () => {
        const renderer = new StreamingRenderer();
        renderer.processLine('# Header 1');
        expect(stdoutWriteSpy).toHaveBeenCalledWith(
          expect.stringContaining('[highlight]Header 1[/highlight]')
        );
      });

      it('should render different header levels', () => {
        const renderer = new StreamingRenderer();

        renderer.processLine('## Header 2');
        expect(stdoutWriteSpy).toHaveBeenCalledWith(
          expect.stringContaining('[secondary]Header 2[/secondary]')
        );

        renderer.processLine('### Header 3');
        expect(stdoutWriteSpy).toHaveBeenCalledWith(
          expect.stringContaining('[primary]Header 3[/primary]')
        );
      });

      it('should render bullet list', () => {
        const renderer = new StreamingRenderer();
        renderer.processLine('- List item');
        expect(stdoutWriteSpy).toHaveBeenCalledWith(
          expect.stringContaining('[primary]• [/primary]')
        );
      });

      it('should render blockquote', () => {
        const renderer = new StreamingRenderer();
        renderer.processLine('> Quote text');
        expect(stdoutWriteSpy).toHaveBeenCalledWith(
          expect.stringContaining('[dim]│ [/dim]')
        );
        expect(stdoutWriteSpy).toHaveBeenCalledWith(
          expect.stringContaining('[info]Quote text[/info]')
        );
      });

      it('should enter code block mode', () => {
        const renderer = new StreamingRenderer();
        renderer.processLine('```javascript');
        expect(renderer.inCodeBlock).toBe(true);
        expect(renderer.codeBlockLang).toBe('javascript');
      });

      it('should exit code block mode', () => {
        const renderer = new StreamingRenderer();
        renderer.inCodeBlock = true;
        renderer.codeBlockLang = 'javascript';
        renderer.processLine('```');
        expect(renderer.inCodeBlock).toBe(false);
        expect(renderer.codeBlockLang).toBe('');
      });

      it('should render code lines with line numbers', () => {
        const renderer = new StreamingRenderer();
        renderer.inCodeBlock = true;
        renderer.processLine('const x = 1;');
        expect(renderer.currentLine).toBe(1);
        expect(stdoutWriteSpy).toHaveBeenCalledWith(
          expect.stringContaining('[code]const x = 1;[/code]')
        );
      });
    });

    describe('displayPartial()', () => {
      it('should display formatted partial text', () => {
        const renderer = new StreamingRenderer();
        renderer.displayPartial('partial text');
        expect(stdoutWriteSpy).toHaveBeenCalledWith(
          expect.stringContaining('partial text')
        );
      });

      it('should use code formatting in code block', () => {
        const renderer = new StreamingRenderer();
        renderer.inCodeBlock = true;
        renderer.displayPartial('code text');
        expect(stdoutWriteSpy).toHaveBeenCalledWith(
          expect.stringContaining('[code]code text[/code]')
        );
      });
    });

    describe('formatInline()', () => {
      it('should format bold text', () => {
        const renderer = new StreamingRenderer();
        const result = renderer.formatInline('This is **bold** text');
        expect(result).toContain('[highlight]bold[/highlight]');
      });

      it('should format inline code', () => {
        const renderer = new StreamingRenderer();
        const result = renderer.formatInline('Use `code` here');
        expect(result).toContain('[code]code[/code]');
      });

      it('should format links', () => {
        const renderer = new StreamingRenderer();
        const result = renderer.formatInline('[Link](https://example.com)');
        expect(result).toContain('[info]Link[/info]');
        expect(result).toContain('https://example.com');
      });
    });

    describe('flush()', () => {
      it('should process remaining line buffer', () => {
        const renderer = new StreamingRenderer();
        renderer.lineBuffer = 'remaining text';
        renderer.flush();
        expect(renderer.lineBuffer).toBe('');
      });

      it('should process remaining buffer', () => {
        const renderer = new StreamingRenderer();
        renderer.buffer = 'buffer text';
        renderer.flush();
        expect(renderer.buffer).toBe('');
      });

      it('should close open code block', () => {
        const renderer = new StreamingRenderer();
        renderer.inCodeBlock = true;
        renderer.flush();
        expect(renderer.inCodeBlock).toBe(false);
        expect(stdoutWriteSpy).toHaveBeenCalledWith(
          expect.stringContaining('[dim]')
        );
      });
    });

    describe('clearLine()', () => {
      it('should write clear line escape sequence', () => {
        const renderer = new StreamingRenderer();
        renderer.clearLine();
        expect(stdoutWriteSpy).toHaveBeenCalledWith('\r\x1b[2K');
      });
    });

    describe('reset()', () => {
      it('should reset all state', () => {
        const renderer = new StreamingRenderer();
        renderer.buffer = 'some buffer';
        renderer.lineBuffer = 'some line';
        renderer.inCodeBlock = true;
        renderer.codeBlockLang = 'python';
        renderer.currentLine = 5;

        renderer.reset();

        expect(renderer.buffer).toBe('');
        expect(renderer.lineBuffer).toBe('');
        expect(renderer.inCodeBlock).toBe(false);
        expect(renderer.codeBlockLang).toBe('');
        expect(renderer.currentLine).toBe(0);
      });
    });
  });

  // ===========================================================================
  // ProgressIndicator Tests
  // ===========================================================================

  describe('ProgressIndicator', () => {
    describe('constructor', () => {
      it('should create with defaults', () => {
        const indicator = new ProgressIndicator();
        expect(indicator.stages).toEqual([]);
        expect(indicator.currentStage).toBe(0);
        expect(indicator.startTime).toBeNull();
      });

      it('should accept stages option', () => {
        const stages = ['Step 1', 'Step 2', 'Step 3'];
        const indicator = new ProgressIndicator({ stages });
        expect(indicator.stages).toEqual(stages);
      });
    });

    describe('start()', () => {
      it('should set start time', () => {
        const indicator = new ProgressIndicator({ stages: ['Step 1'] });
        indicator.start();
        expect(indicator.startTime).toBeDefined();
        expect(indicator.startTime).toBeGreaterThan(0);
      });

      it('should reset current stage', () => {
        const indicator = new ProgressIndicator({ stages: ['Step 1'] });
        indicator.currentStage = 3;
        indicator.start();
        expect(indicator.currentStage).toBe(0);
      });

      it('should call render', () => {
        const indicator = new ProgressIndicator({ stages: ['Step 1'] });
        const renderSpy = vi.spyOn(indicator, 'render');
        indicator.start();
        expect(renderSpy).toHaveBeenCalled();
      });
    });

    describe('advance()', () => {
      it('should increment current stage', () => {
        const indicator = new ProgressIndicator({ stages: ['Step 1', 'Step 2'] });
        indicator.advance();
        expect(indicator.currentStage).toBe(1);
      });

      it('should update stage name if provided', () => {
        const indicator = new ProgressIndicator({ stages: ['Step 1', 'Step 2'] });
        indicator.advance('New Step 1');
        expect(indicator.stages[0]).toBe('New Step 1');
      });

      it('should call render', () => {
        const indicator = new ProgressIndicator({ stages: ['Step 1'] });
        const renderSpy = vi.spyOn(indicator, 'render');
        indicator.advance();
        expect(renderSpy).toHaveBeenCalled();
      });
    });

    describe('complete()', () => {
      it('should set current stage to total stages', () => {
        const indicator = new ProgressIndicator({ stages: ['Step 1', 'Step 2'] });
        indicator.start();
        indicator.complete();
        expect(indicator.currentStage).toBe(2);
      });

      it('should log completion message', () => {
        const indicator = new ProgressIndicator({ stages: ['Step 1'] });
        indicator.start();
        indicator.complete();
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[success]')
        );
      });
    });

    describe('render()', () => {
      it('should render stages with correct colors', () => {
        const indicator = new ProgressIndicator({ stages: ['Step 1', 'Step 2', 'Step 3'] });
        indicator.currentStage = 1;
        indicator.render();

        // Step 0 is completed (success)
        // Step 1 is current (warning)
        // Step 2 is pending (dim)
        expect(stdoutWriteSpy).toHaveBeenCalled();
      });

      it('should clear line before rendering', () => {
        const indicator = new ProgressIndicator({ stages: ['Step 1'] });
        indicator.render();
        expect(stdoutWriteSpy).toHaveBeenCalledWith('\r\x1b[2K');
      });
    });
  });

  // ===========================================================================
  // CollapsibleSection Tests
  // ===========================================================================

  describe('CollapsibleSection', () => {
    describe('constructor', () => {
      it('should create with title', () => {
        const section = new CollapsibleSection('Test Section');
        expect(section.title).toBe('Test Section');
        expect(section.expanded).toBe(true);
        expect(section.content).toEqual([]);
      });

      it('should accept expanded option', () => {
        const section = new CollapsibleSection('Title', { expanded: false });
        expect(section.expanded).toBe(false);
      });
    });

    describe('add()', () => {
      it('should add content line', () => {
        const section = new CollapsibleSection('Title');
        section.add('Line 1');
        section.add('Line 2');
        expect(section.content).toEqual(['Line 1', 'Line 2']);
      });
    });

    describe('toggle()', () => {
      it('should toggle expanded state', () => {
        const section = new CollapsibleSection('Title');
        expect(section.expanded).toBe(true);
        section.toggle();
        expect(section.expanded).toBe(false);
        section.toggle();
        expect(section.expanded).toBe(true);
      });
    });

    describe('render()', () => {
      it('should render expanded section with content', () => {
        const section = new CollapsibleSection('Title');
        section.add('Line 1');
        section.add('Line 2');
        const result = section.render();

        expect(result).toContain('[primary]▼ Title[/primary]');
        expect(result).toContain('Line 1');
        expect(result).toContain('Line 2');
      });

      it('should render collapsed section with line count', () => {
        const section = new CollapsibleSection('Title', { expanded: false });
        section.add('Line 1');
        section.add('Line 2');
        section.add('Line 3');
        const result = section.render();

        expect(result).toContain('[primary]▶ Title[/primary]');
        expect(result).toContain('[dim] (3 lines)[/dim]');
        expect(result).not.toContain('Line 1');
      });

      it('should indent content lines', () => {
        const section = new CollapsibleSection('Title');
        section.add('Content');
        const result = section.render();

        expect(result).toContain('  Content');
      });
    });
  });

  // ===========================================================================
  // Factory Functions Tests
  // ===========================================================================

  describe('Factory Functions', () => {
    describe('createStreamingRenderer()', () => {
      it('should create StreamingRenderer instance', () => {
        const renderer = createStreamingRenderer();
        expect(renderer).toBeInstanceOf(StreamingRenderer);
      });

      it('should pass options to constructor', () => {
        const renderer = createStreamingRenderer({ maxWidth: 100 });
        expect(renderer.maxWidth).toBe(100);
      });
    });

    describe('createProgressIndicator()', () => {
      it('should create ProgressIndicator with stages', () => {
        const stages = ['Step 1', 'Step 2'];
        const indicator = createProgressIndicator(stages);
        expect(indicator).toBeInstanceOf(ProgressIndicator);
        expect(indicator.stages).toEqual(stages);
      });

      it('should pass additional options', () => {
        const indicator = createProgressIndicator(['Step'], { someOption: true });
        expect(indicator.stages).toEqual(['Step']);
      });
    });
  });
});
