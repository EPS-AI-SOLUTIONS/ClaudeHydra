/**
 * Message Formatter Tests
 * @module test/unit/logger/message-formatter.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Message Formatter', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  // ===========================================================================
  // Icons Tests
  // ===========================================================================

  describe('Icons', () => {
    it('should export Icons object', async () => {
      const { Icons } = await import('../../../src/logger/message-formatter.js');

      expect(Icons.ERROR).toBeDefined();
      expect(Icons.WARNING).toBeDefined();
      expect(Icons.SUCCESS).toBeDefined();
      expect(Icons.INFO).toBeDefined();
      expect(Icons.DEBUG).toBeDefined();
      expect(Icons.HINT).toBeDefined();
      expect(Icons.ARROW_RIGHT).toBeDefined();
      expect(Icons.BULLET).toBeDefined();
    });

    it('should freeze Icons object', async () => {
      const { Icons } = await import('../../../src/logger/message-formatter.js');
      expect(Object.isFrozen(Icons)).toBe(true);
    });
  });

  // ===========================================================================
  // BoxChars Tests
  // ===========================================================================

  describe('BoxChars', () => {
    it('should export BoxChars with different styles', async () => {
      const { BoxChars } = await import('../../../src/logger/message-formatter.js');

      expect(BoxChars.single).toBeDefined();
      expect(BoxChars.double).toBeDefined();
      expect(BoxChars.rounded).toBeDefined();
    });

    it('should have all box drawing characters in each style', async () => {
      const { BoxChars } = await import('../../../src/logger/message-formatter.js');

      const requiredChars = [
        'topLeft', 'topRight', 'bottomLeft', 'bottomRight',
        'horizontal', 'vertical', 'leftTee', 'rightTee',
        'topTee', 'bottomTee', 'cross'
      ];

      for (const style of ['single', 'double', 'rounded']) {
        for (const char of requiredChars) {
          expect(BoxChars[style][char]).toBeDefined();
          expect(typeof BoxChars[style][char]).toBe('string');
        }
      }
    });

    it('should freeze BoxChars object', async () => {
      const { BoxChars } = await import('../../../src/logger/message-formatter.js');
      expect(Object.isFrozen(BoxChars)).toBe(true);
    });
  });

  // ===========================================================================
  // MessageThemes Tests
  // ===========================================================================

  describe('MessageThemes', () => {
    it('should export MessageThemes for all types', async () => {
      const { MessageThemes } = await import('../../../src/logger/message-formatter.js');

      expect(MessageThemes.error).toBeDefined();
      expect(MessageThemes.warning).toBeDefined();
      expect(MessageThemes.success).toBeDefined();
      expect(MessageThemes.info).toBeDefined();
      expect(MessageThemes.debug).toBeDefined();
      expect(MessageThemes.hint).toBeDefined();
    });

    it('should have required properties in each theme', async () => {
      const { MessageThemes } = await import('../../../src/logger/message-formatter.js');

      const requiredProps = [
        'icon', 'iconColor', 'iconBg', 'borderColor',
        'titleColor', 'textColor', 'boxStyle', 'label'
      ];

      for (const theme of Object.values(MessageThemes)) {
        for (const prop of requiredProps) {
          expect(theme[prop]).toBeDefined();
        }
      }
    });

    it('should freeze MessageThemes object', async () => {
      const { MessageThemes } = await import('../../../src/logger/message-formatter.js');
      expect(Object.isFrozen(MessageThemes)).toBe(true);
    });
  });

  // ===========================================================================
  // MessageFormatter Class Tests
  // ===========================================================================

  describe('MessageFormatter', () => {
    describe('constructor', () => {
      it('should create instance with default options', async () => {
        const { MessageFormatter } = await import('../../../src/logger/message-formatter.js');

        const formatter = new MessageFormatter();

        expect(formatter.maxWidth).toBe(80);
        expect(formatter.useIcons).toBe(true);
        expect(formatter.defaultBoxStyle).toBe('single');
      });

      it('should accept custom options', async () => {
        const { MessageFormatter } = await import('../../../src/logger/message-formatter.js');

        const formatter = new MessageFormatter({
          maxWidth: 100,
          useColors: false,
          useIcons: false,
          defaultBoxStyle: 'double'
        });

        expect(formatter.maxWidth).toBe(100);
        expect(formatter.useColors).toBe(false);
        expect(formatter.useIcons).toBe(false);
        expect(formatter.defaultBoxStyle).toBe('double');
      });
    });

    describe('wrapText()', () => {
      it('should wrap text to fit width', async () => {
        const { MessageFormatter } = await import('../../../src/logger/message-formatter.js');
        const formatter = new MessageFormatter();

        const lines = formatter.wrapText('This is a long text that should be wrapped', 20);

        expect(lines.length).toBeGreaterThan(1);
        for (const line of lines) {
          expect(line.length).toBeLessThanOrEqual(20);
        }
      });

      it('should handle single word', async () => {
        const { MessageFormatter } = await import('../../../src/logger/message-formatter.js');
        const formatter = new MessageFormatter();

        const lines = formatter.wrapText('Hello', 20);

        expect(lines).toEqual(['Hello']);
      });

      it('should handle empty string', async () => {
        const { MessageFormatter } = await import('../../../src/logger/message-formatter.js');
        const formatter = new MessageFormatter();

        const lines = formatter.wrapText('', 20);

        expect(lines).toEqual(['']);
      });

      it('should handle very long words', async () => {
        const { MessageFormatter } = await import('../../../src/logger/message-formatter.js');
        const formatter = new MessageFormatter();

        const longWord = 'a'.repeat(30);
        const lines = formatter.wrapText(longWord, 10);

        expect(lines.length).toBeGreaterThan(1);
      });
    });

    describe('padText()', () => {
      it('should left-pad text by default', async () => {
        const { MessageFormatter } = await import('../../../src/logger/message-formatter.js');
        const formatter = new MessageFormatter();

        const result = formatter.padText('Hi', 10);

        expect(result).toBe('Hi        ');
        expect(result.length).toBe(10);
      });

      it('should center-pad text', async () => {
        const { MessageFormatter } = await import('../../../src/logger/message-formatter.js');
        const formatter = new MessageFormatter();

        const result = formatter.padText('Hi', 10, 'center');

        expect(result.length).toBe(10);
        expect(result.trim()).toBe('Hi');
      });

      it('should right-pad text', async () => {
        const { MessageFormatter } = await import('../../../src/logger/message-formatter.js');
        const formatter = new MessageFormatter();

        const result = formatter.padText('Hi', 10, 'right');

        expect(result).toBe('        Hi');
        expect(result.length).toBe(10);
      });

      it('should handle text longer than width', async () => {
        const { MessageFormatter } = await import('../../../src/logger/message-formatter.js');
        const formatter = new MessageFormatter();

        const result = formatter.padText('Hello World', 5);

        expect(result).toBe('Hello World');
      });
    });

    describe('horizontalLine()', () => {
      it('should create horizontal line', async () => {
        const { MessageFormatter, BoxChars } = await import('../../../src/logger/message-formatter.js');
        const formatter = new MessageFormatter({ useColors: false });

        const line = formatter.horizontalLine(10, BoxChars.single, '');

        expect(line.length).toBe(10);
      });
    });

    describe('formatBox()', () => {
      it('should format error box', async () => {
        const { MessageFormatter } = await import('../../../src/logger/message-formatter.js');
        const formatter = new MessageFormatter({ useColors: false, useIcons: false });

        const result = formatter.formatBox('error', 'Test Error', 'This is an error message');

        expect(result).toContain('ERROR');
        expect(result).toContain('Test Error');
        expect(result).toContain('This is an error message');
      });

      it('should format box with array content', async () => {
        const { MessageFormatter } = await import('../../../src/logger/message-formatter.js');
        const formatter = new MessageFormatter({ useColors: false, useIcons: false });

        const result = formatter.formatBox('info', 'Multi-line', ['Line 1', 'Line 2', 'Line 3']);

        expect(result).toContain('Line 1');
        expect(result).toContain('Line 2');
        expect(result).toContain('Line 3');
      });

      it('should include details section', async () => {
        const { MessageFormatter } = await import('../../../src/logger/message-formatter.js');
        const formatter = new MessageFormatter({ useColors: false, useIcons: false });

        const result = formatter.formatBox('warning', 'Warning', 'Message', {
          details: {
            file: 'test.js',
            line: 42
          }
        });

        expect(result).toContain('file: test.js');
        expect(result).toContain('line: 42');
      });

      it('should include suggestions section', async () => {
        const { MessageFormatter } = await import('../../../src/logger/message-formatter.js');
        const formatter = new MessageFormatter({ useColors: false, useIcons: false });

        const result = formatter.formatBox('error', 'Error', 'Something went wrong', {
          suggestions: ['Try restarting', 'Check logs']
        });

        expect(result).toContain('Suggestions');
        expect(result).toContain('Try restarting');
        expect(result).toContain('Check logs');
      });

      it('should skip null/undefined details', async () => {
        const { MessageFormatter } = await import('../../../src/logger/message-formatter.js');
        const formatter = new MessageFormatter({ useColors: false, useIcons: false });

        const result = formatter.formatBox('info', 'Info', 'Message', {
          details: {
            valid: 'value',
            nullVal: null,
            undefinedVal: undefined
          }
        });

        expect(result).toContain('valid: value');
        expect(result).not.toContain('nullVal');
        expect(result).not.toContain('undefinedVal');
      });

      it('should use fallback theme for unknown type', async () => {
        const { MessageFormatter } = await import('../../../src/logger/message-formatter.js');
        const formatter = new MessageFormatter({ useColors: false, useIcons: false });

        const result = formatter.formatBox('unknown', 'Title', 'Content');

        expect(result).toContain('INFO'); // Falls back to info theme
      });
    });

    describe('error()', () => {
      it('should format error message', async () => {
        const { MessageFormatter } = await import('../../../src/logger/message-formatter.js');
        const formatter = new MessageFormatter({ useColors: false });

        const result = formatter.error('Error Title', 'Error content');

        expect(result).toContain('ERROR');
        expect(result).toContain('Error Title');
      });
    });

    describe('warning()', () => {
      it('should format warning message', async () => {
        const { MessageFormatter } = await import('../../../src/logger/message-formatter.js');
        const formatter = new MessageFormatter({ useColors: false });

        const result = formatter.warning('Warning Title', 'Warning content');

        expect(result).toContain('WARNING');
      });
    });

    describe('success()', () => {
      it('should format success message', async () => {
        const { MessageFormatter } = await import('../../../src/logger/message-formatter.js');
        const formatter = new MessageFormatter({ useColors: false });

        const result = formatter.success('Success Title', 'Success content');

        expect(result).toContain('SUCCESS');
      });
    });

    describe('info()', () => {
      it('should format info message', async () => {
        const { MessageFormatter } = await import('../../../src/logger/message-formatter.js');
        const formatter = new MessageFormatter({ useColors: false });

        const result = formatter.info('Info Title', 'Info content');

        expect(result).toContain('INFO');
      });
    });

    describe('debug()', () => {
      it('should format debug message', async () => {
        const { MessageFormatter } = await import('../../../src/logger/message-formatter.js');
        const formatter = new MessageFormatter({ useColors: false });

        const result = formatter.debug('Debug Title', 'Debug content');

        expect(result).toContain('DEBUG');
      });
    });

    describe('hint()', () => {
      it('should format hint message', async () => {
        const { MessageFormatter } = await import('../../../src/logger/message-formatter.js');
        const formatter = new MessageFormatter({ useColors: false });

        const result = formatter.hint('Hint Title', 'Hint content');

        expect(result).toContain('HINT');
      });
    });

    describe('inline()', () => {
      it('should format inline message without colors', async () => {
        const { MessageFormatter } = await import('../../../src/logger/message-formatter.js');
        const formatter = new MessageFormatter({ useColors: false, useIcons: true });

        const result = formatter.inline('error', 'Something failed');

        expect(result).toContain('[ERROR]');
        expect(result).toContain('Something failed');
      });

      it('should format inline message without icons', async () => {
        const { MessageFormatter } = await import('../../../src/logger/message-formatter.js');
        const formatter = new MessageFormatter({ useColors: false, useIcons: false });

        const result = formatter.inline('info', 'Some info');

        expect(result).toContain('[INFO]');
        expect(result).toContain('Some info');
      });
    });
  });

  // ===========================================================================
  // Singleton and Convenience Functions Tests
  // ===========================================================================

  describe('Singleton and Convenience Functions', () => {
    beforeEach(async () => {
      const { resetFormatter } = await import('../../../src/logger/message-formatter.js');
      resetFormatter();
    });

    describe('getFormatter()', () => {
      it('should return singleton instance', async () => {
        const { getFormatter } = await import('../../../src/logger/message-formatter.js');

        const formatter1 = getFormatter();
        const formatter2 = getFormatter();

        expect(formatter1).toBe(formatter2);
      });

      it('should create new instance with options', async () => {
        const { getFormatter, resetFormatter } = await import('../../../src/logger/message-formatter.js');

        resetFormatter();
        const formatter1 = getFormatter({ maxWidth: 100 });

        expect(formatter1.maxWidth).toBe(100);
      });
    });

    describe('resetFormatter()', () => {
      it('should reset singleton instance', async () => {
        const { getFormatter, resetFormatter } = await import('../../../src/logger/message-formatter.js');

        const formatter1 = getFormatter();
        resetFormatter();
        const formatter2 = getFormatter();

        expect(formatter1).not.toBe(formatter2);
      });
    });

    describe('Convenience functions', () => {
      it('should export formatError function', async () => {
        const { formatError, resetFormatter } = await import('../../../src/logger/message-formatter.js');
        resetFormatter();

        const result = formatError('Test', 'Content');

        expect(result).toContain('ERROR');
      });

      it('should export formatWarning function', async () => {
        const { formatWarning, resetFormatter } = await import('../../../src/logger/message-formatter.js');
        resetFormatter();

        const result = formatWarning('Test', 'Content');

        expect(result).toContain('WARNING');
      });

      it('should export formatSuccess function', async () => {
        const { formatSuccess, resetFormatter } = await import('../../../src/logger/message-formatter.js');
        resetFormatter();

        const result = formatSuccess('Test', 'Content');

        expect(result).toContain('SUCCESS');
      });

      it('should export formatInfo function', async () => {
        const { formatInfo, resetFormatter } = await import('../../../src/logger/message-formatter.js');
        resetFormatter();

        const result = formatInfo('Test', 'Content');

        expect(result).toContain('INFO');
      });

      it('should export formatDebug function', async () => {
        const { formatDebug, resetFormatter } = await import('../../../src/logger/message-formatter.js');
        resetFormatter();

        const result = formatDebug('Test', 'Content');

        expect(result).toContain('DEBUG');
      });

      it('should export formatHint function', async () => {
        const { formatHint, resetFormatter } = await import('../../../src/logger/message-formatter.js');
        resetFormatter();

        const result = formatHint('Test', 'Content');

        expect(result).toContain('HINT');
      });

      it('should export formatInline function', async () => {
        const { formatInline, resetFormatter } = await import('../../../src/logger/message-formatter.js');
        resetFormatter();

        const result = formatInline('error', 'Inline message');

        expect(typeof result).toBe('string');
      });
    });
  });

  // ===========================================================================
  // Default Export Tests
  // ===========================================================================

  describe('Default Export', () => {
    it('should export all components', async () => {
      const formatter = await import('../../../src/logger/message-formatter.js');
      const defaultExport = formatter.default;

      expect(defaultExport.MessageFormatter).toBeDefined();
      expect(defaultExport.Icons).toBeDefined();
      expect(defaultExport.BoxChars).toBeDefined();
      expect(defaultExport.MessageThemes).toBeDefined();
      expect(typeof defaultExport.getFormatter).toBe('function');
      expect(typeof defaultExport.resetFormatter).toBe('function');
      expect(typeof defaultExport.formatError).toBe('function');
      expect(typeof defaultExport.formatWarning).toBe('function');
      expect(typeof defaultExport.formatSuccess).toBe('function');
      expect(typeof defaultExport.formatInfo).toBe('function');
      expect(typeof defaultExport.formatDebug).toBe('function');
      expect(typeof defaultExport.formatHint).toBe('function');
      expect(typeof defaultExport.formatInline).toBe('function');
    });
  });
});
