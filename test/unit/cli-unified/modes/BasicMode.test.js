/**
 * BasicMode Tests
 * @module test/unit/cli-unified/modes/BasicMode.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

import {
  BasicMode,
  createBasicMode
} from '../../../../src/cli-unified/modes/BasicMode.js';

describe('BasicMode Module', () => {
  let mockCli;
  let mockCommandParser;
  let mockQueryProcessor;
  let mockOutput;
  let mockHistory;
  let mockThemeRegistry;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock command parser
    mockCommandParser = {
      register: vi.fn(),
      isCommand: vi.fn(() => false),
      run: vi.fn()
    };

    // Create mock query processor
    mockQueryProcessor = {
      defaultModel: 'test-model',
      getModels: vi.fn(() => Promise.resolve(['model1', 'model2'])),
      checkHealth: vi.fn(() => Promise.resolve({ healthy: true, models: ['model1'] })),
      process: vi.fn(() => Promise.resolve({ text: 'response' }))
    };

    // Create mock output
    mockOutput = {
      setTheme: vi.fn(),
      startSpinner: vi.fn(),
      stopSpinner: vi.fn(),
      stopSpinnerSuccess: vi.fn(),
      stopSpinnerFail: vi.fn(),
      newline: vi.fn(),
      streamWrite: vi.fn(),
      streamFlush: vi.fn(),
      success: vi.fn()
    };

    // Create mock history
    mockHistory = {
      getRecent: vi.fn(() => []),
      count: 5
    };

    // Create mock theme registry
    mockThemeRegistry = {
      list: vi.fn(() => ['default', 'dark', 'light']),
      getCurrent: vi.fn(() => ({ name: 'default' }))
    };

    // Create mock CLI
    mockCli = {
      commandParser: mockCommandParser,
      queryProcessor: mockQueryProcessor,
      output: mockOutput,
      history: mockHistory,
      themeRegistry: mockThemeRegistry,
      streaming: false
    };
  });

  // ===========================================================================
  // Constructor Tests
  // ===========================================================================

  describe('constructor', () => {
    it('should create with CLI reference', () => {
      const mode = new BasicMode(mockCli);
      expect(mode.cli).toBe(mockCli);
      expect(mode.name).toBe('basic');
    });

    it('should extend EventEmitter', () => {
      const mode = new BasicMode(mockCli);
      expect(mode).toBeInstanceOf(EventEmitter);
    });
  });

  // ===========================================================================
  // Initialization Tests
  // ===========================================================================

  describe('init()', () => {
    it('should register commands', async () => {
      const mode = new BasicMode(mockCli);
      await mode.init();

      expect(mockCommandParser.register).toHaveBeenCalled();
    });

    it('should emit ready event', async () => {
      const mode = new BasicMode(mockCli);
      const spy = vi.fn();
      mode.on('ready', spy);

      await mode.init();

      expect(spy).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Command Registration Tests
  // ===========================================================================

  describe('registerCommands()', () => {
    it('should register model command', async () => {
      const mode = new BasicMode(mockCli);
      await mode.init();

      const modelCmd = mockCommandParser.register.mock.calls.find(
        call => call[0].name === 'model'
      );
      expect(modelCmd).toBeDefined();
      expect(modelCmd[0].aliases).toContain('m');
    });

    it('should register multiline command', async () => {
      const mode = new BasicMode(mockCli);
      await mode.init();

      const mlCmd = mockCommandParser.register.mock.calls.find(
        call => call[0].name === 'multiline'
      );
      expect(mlCmd).toBeDefined();
      expect(mlCmd[0].aliases).toContain('ml');
    });

    it('should register theme command', async () => {
      const mode = new BasicMode(mockCli);
      await mode.init();

      const themeCmd = mockCommandParser.register.mock.calls.find(
        call => call[0].name === 'theme'
      );
      expect(themeCmd).toBeDefined();
      expect(themeCmd[0].aliases).toContain('t');
    });

    it('should register history command', async () => {
      const mode = new BasicMode(mockCli);
      await mode.init();

      const histCmd = mockCommandParser.register.mock.calls.find(
        call => call[0].name === 'history'
      );
      expect(histCmd).toBeDefined();
      expect(histCmd[0].aliases).toContain('hist');
    });

    it('should register status command', async () => {
      const mode = new BasicMode(mockCli);
      await mode.init();

      const statusCmd = mockCommandParser.register.mock.calls.find(
        call => call[0].name === 'status'
      );
      expect(statusCmd).toBeDefined();
    });
  });

  // ===========================================================================
  // Command Handler Tests
  // ===========================================================================

  describe('command handlers', () => {
    describe('model command', () => {
      it('should set model when argument provided', async () => {
        const mode = new BasicMode(mockCli);
        await mode.init();

        const modelCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'model'
        );
        const result = await modelCmd[0].handler(['new-model']);

        expect(mockQueryProcessor.defaultModel).toBe('new-model');
        expect(result).toContain('new-model');
      });

      it('should show current model when no argument', async () => {
        const mode = new BasicMode(mockCli);
        await mode.init();

        const modelCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'model'
        );
        const result = await modelCmd[0].handler([]);

        expect(mockQueryProcessor.getModels).toHaveBeenCalled();
        expect(result).toContain('Current');
        expect(result).toContain('Available');
      });
    });

    describe('multiline command', () => {
      it('should set multiline context flag', async () => {
        const mode = new BasicMode(mockCli);
        await mode.init();

        const mlCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'multiline'
        );
        const ctx = {};
        await mlCmd[0].handler([], ctx);

        expect(ctx.multiline).toBe(true);
      });
    });

    describe('theme command', () => {
      it('should set theme when argument provided', async () => {
        const mode = new BasicMode(mockCli);
        await mode.init();

        const themeCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'theme'
        );
        const result = await themeCmd[0].handler(['dark']);

        expect(mockOutput.setTheme).toHaveBeenCalledWith('dark');
        expect(result).toContain('dark');
      });

      it('should show themes when no argument', async () => {
        const mode = new BasicMode(mockCli);
        await mode.init();

        const themeCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'theme'
        );
        const result = await themeCmd[0].handler([]);

        expect(mockThemeRegistry.list).toHaveBeenCalled();
        expect(result).toContain('Current');
      });
    });

    describe('history command', () => {
      it('should show recent history', async () => {
        mockHistory.getRecent.mockReturnValue([
          { text: 'query 1' },
          { text: 'query 2' }
        ]);

        const mode = new BasicMode(mockCli);
        await mode.init();

        const histCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'history'
        );
        const result = await histCmd[0].handler([]);

        expect(mockHistory.getRecent).toHaveBeenCalledWith(10);
        expect(result).toContain('1.');
        expect(result).toContain('query 1');
      });

      it('should respect count argument', async () => {
        const mode = new BasicMode(mockCli);
        await mode.init();

        const histCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'history'
        );
        await histCmd[0].handler(['5']);

        expect(mockHistory.getRecent).toHaveBeenCalledWith(5);
      });

      it('should handle empty history', async () => {
        mockHistory.getRecent.mockReturnValue([]);

        const mode = new BasicMode(mockCli);
        await mode.init();

        const histCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'history'
        );
        const result = await histCmd[0].handler([]);

        expect(result).toBe('No history');
      });

      it('should truncate long entries', async () => {
        const longText = 'a'.repeat(100);
        mockHistory.getRecent.mockReturnValue([{ text: longText }]);

        const mode = new BasicMode(mockCli);
        await mode.init();

        const histCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'history'
        );
        const result = await histCmd[0].handler([]);

        expect(result).toContain('...');
      });
    });

    describe('status command', () => {
      it('should show system status', async () => {
        const mode = new BasicMode(mockCli);
        await mode.init();

        const statusCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'status'
        );
        const result = await statusCmd[0].handler();

        expect(mockQueryProcessor.checkHealth).toHaveBeenCalled();
        expect(result).toContain('Mode: basic');
        expect(result).toContain('Connected');
      });

      it('should show disconnected when unhealthy', async () => {
        mockQueryProcessor.checkHealth.mockResolvedValue({ healthy: false });

        const mode = new BasicMode(mockCli);
        await mode.init();

        const statusCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'status'
        );
        const result = await statusCmd[0].handler();

        expect(result).toContain('Disconnected');
      });

      it('should show model count if available', async () => {
        const mode = new BasicMode(mockCli);
        await mode.init();

        const statusCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'status'
        );
        const result = await statusCmd[0].handler();

        expect(result).toContain('Models: 1 available');
      });
    });
  });

  // ===========================================================================
  // Process Input Tests
  // ===========================================================================

  describe('processInput()', () => {
    describe('command processing', () => {
      it('should detect and run commands', async () => {
        mockCommandParser.isCommand.mockReturnValue(true);
        mockCommandParser.run.mockResolvedValue('command result');

        const mode = new BasicMode(mockCli);
        const result = await mode.processInput('/help');

        expect(mockCommandParser.isCommand).toHaveBeenCalledWith('/help');
        expect(mockCommandParser.run).toHaveBeenCalled();
        expect(result.type).toBe('command');
        expect(result.result).toBe('command result');
      });
    });

    describe('query processing (non-streaming)', () => {
      it('should process query', async () => {
        mockCli.streaming = false;
        mockQueryProcessor.process.mockResolvedValue({ text: 'AI response' });

        const mode = new BasicMode(mockCli);
        const result = await mode.processInput('hello');

        expect(mockOutput.startSpinner).toHaveBeenCalledWith('Thinking...');
        expect(mockQueryProcessor.process).toHaveBeenCalled();
        expect(mockOutput.stopSpinnerSuccess).toHaveBeenCalledWith('Done');
        expect(result.type).toBe('query');
      });

      it('should handle query error', async () => {
        mockCli.streaming = false;
        mockQueryProcessor.process.mockRejectedValue(new Error('API error'));

        const mode = new BasicMode(mockCli);

        await expect(mode.processInput('hello')).rejects.toThrow('API error');
        expect(mockOutput.stopSpinnerFail).toHaveBeenCalledWith('API error');
      });
    });

    describe('query processing (streaming)', () => {
      it('should stream tokens', async () => {
        mockCli.streaming = true;
        mockQueryProcessor.process.mockImplementation(async (input, options) => {
          // Simulate streaming
          if (options.onToken) {
            options.onToken('Hello');
            options.onToken(' world');
          }
          return { text: 'Hello world' };
        });

        const mode = new BasicMode(mockCli);
        await mode.processInput('hello');

        expect(mockOutput.stopSpinner).toHaveBeenCalled();
        expect(mockOutput.streamWrite).toHaveBeenCalledWith('Hello');
        expect(mockOutput.streamWrite).toHaveBeenCalledWith(' world');
        expect(mockOutput.streamFlush).toHaveBeenCalled();
        expect(mockOutput.success).toHaveBeenCalledWith('Done');
      });
    });
  });

  // ===========================================================================
  // Get Info Tests
  // ===========================================================================

  describe('getInfo()', () => {
    it('should return mode information', () => {
      const mode = new BasicMode(mockCli);
      const info = mode.getInfo();

      expect(info.name).toBe('basic');
      expect(info.description).toBeDefined();
      expect(info.features).toContain('Commands');
      expect(info.features).toContain('History');
      expect(info.features).toContain('Themes');
    });
  });

  // ===========================================================================
  // Factory Function Tests
  // ===========================================================================

  describe('createBasicMode()', () => {
    it('should create BasicMode instance', () => {
      const mode = createBasicMode(mockCli);
      expect(mode).toBeInstanceOf(BasicMode);
      expect(mode.cli).toBe(mockCli);
    });
  });
});
