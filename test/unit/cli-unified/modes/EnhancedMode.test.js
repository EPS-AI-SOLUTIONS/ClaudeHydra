/**
 * EnhancedMode Tests
 * @module test/unit/cli-unified/modes/EnhancedMode.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

import {
  EnhancedMode,
  createEnhancedMode
} from '../../../../src/cli-unified/modes/EnhancedMode.js';

describe('EnhancedMode Module', () => {
  let mockCli;
  let mockCommandParser;
  let mockQueryProcessor;
  let mockOutput;
  let mockHistory;
  let mockThemeRegistry;
  let mockContext;
  let mockCache;
  let mockSession;
  let mockInput;

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
      getRecent: vi.fn(() => [{ id: 'entry-1', text: 'recent query' }]),
      addBookmark: vi.fn(),
      getBookmark: vi.fn(),
      listBookmarks: vi.fn(() => []),
      count: 5
    };

    // Create mock theme registry
    mockThemeRegistry = {
      list: vi.fn(() => ['default', 'dark', 'light']),
      getCurrent: vi.fn(() => ({ name: 'default' }))
    };

    // Create mock context manager
    mockContext = {
      addFile: vi.fn((path) => ({ name: path, language: 'javascript', size: 1024 })),
      addUrl: vi.fn(() => Promise.resolve({ size: 2048 })),
      clear: vi.fn(),
      getSummary: vi.fn(() => ({ files: [], urls: [], totalSize: 0, maxSize: 100000 }))
    };

    // Create mock cache
    mockCache = {
      getStats: vi.fn(() => ({
        hits: 10,
        misses: 5,
        hitRate: '66.7%',
        size: 50,
        maxSize: 100,
        totalTokensSaved: 1000
      })),
      clear: vi.fn(),
      enable: vi.fn(),
      disable: vi.fn(),
      isEnabled: true,
      size: 50
    };

    // Create mock session manager
    mockSession = {
      getCurrent: vi.fn(() => ({
        id: 'session-1',
        name: 'Test Session',
        messages: [],
        metadata: { totalTokens: 5000 },
        created: Date.now()
      })),
      create: vi.fn(),
      save: vi.fn(() => true),
      load: vi.fn(),
      loadRecent: vi.fn(),
      list: vi.fn(() => []),
      delete: vi.fn(() => true),
      rename: vi.fn(),
      export: vi.fn(() => '# Export')
    };

    // Create mock input manager
    mockInput = {
      toggleVimMode: vi.fn(() => true),
      templates: {
        list: vi.fn(() => []),
        apply: vi.fn(),
        listVariables: vi.fn(() => ({})),
        getVariable: vi.fn(),
        setVariable: vi.fn()
      }
    };

    // Create mock CLI
    mockCli = {
      commandParser: mockCommandParser,
      queryProcessor: mockQueryProcessor,
      output: mockOutput,
      history: mockHistory,
      themeRegistry: mockThemeRegistry,
      context: mockContext,
      cache: mockCache,
      session: mockSession,
      input: mockInput,
      streaming: false
    };
  });

  // ===========================================================================
  // Constructor Tests
  // ===========================================================================

  describe('constructor', () => {
    it('should create with CLI reference', () => {
      const mode = new EnhancedMode(mockCli);
      expect(mode.cli).toBe(mockCli);
      expect(mode.name).toBe('enhanced');
    });

    it('should extend EventEmitter', () => {
      const mode = new EnhancedMode(mockCli);
      expect(mode).toBeInstanceOf(EventEmitter);
    });

    it('should create BasicMode instance', () => {
      const mode = new EnhancedMode(mockCli);
      expect(mode.basicMode).toBeDefined();
    });
  });

  // ===========================================================================
  // Initialization Tests
  // ===========================================================================

  describe('init()', () => {
    it('should register commands', async () => {
      const mode = new EnhancedMode(mockCli);
      await mode.init();

      // EnhancedMode registers many commands
      expect(mockCommandParser.register).toHaveBeenCalled();
    });

    it('should emit ready event', async () => {
      const mode = new EnhancedMode(mockCli);
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
    it('should register file command', async () => {
      const mode = new EnhancedMode(mockCli);
      await mode.init();

      const fileCmd = mockCommandParser.register.mock.calls.find(
        call => call[0].name === 'file'
      );
      expect(fileCmd).toBeDefined();
      expect(fileCmd[0].aliases).toContain('f');
      expect(fileCmd[0].category).toBe('context');
    });

    it('should register url command', async () => {
      const mode = new EnhancedMode(mockCli);
      await mode.init();

      const urlCmd = mockCommandParser.register.mock.calls.find(
        call => call[0].name === 'url'
      );
      expect(urlCmd).toBeDefined();
      expect(urlCmd[0].aliases).toContain('u');
    });

    it('should register context command', async () => {
      const mode = new EnhancedMode(mockCli);
      await mode.init();

      const ctxCmd = mockCommandParser.register.mock.calls.find(
        call => call[0].name === 'context'
      );
      expect(ctxCmd).toBeDefined();
      expect(ctxCmd[0].aliases).toContain('ctx');
    });

    it('should register cache command', async () => {
      const mode = new EnhancedMode(mockCli);
      await mode.init();

      const cacheCmd = mockCommandParser.register.mock.calls.find(
        call => call[0].name === 'cache'
      );
      expect(cacheCmd).toBeDefined();
      expect(cacheCmd[0].category).toBe('performance');
    });

    it('should register template command', async () => {
      const mode = new EnhancedMode(mockCli);
      await mode.init();

      const tplCmd = mockCommandParser.register.mock.calls.find(
        call => call[0].name === 'template'
      );
      expect(tplCmd).toBeDefined();
      expect(tplCmd[0].aliases).toContain('tpl');
    });

    it('should register vim command', async () => {
      const mode = new EnhancedMode(mockCli);
      await mode.init();

      const vimCmd = mockCommandParser.register.mock.calls.find(
        call => call[0].name === 'vim'
      );
      expect(vimCmd).toBeDefined();
    });

    it('should register var command', async () => {
      const mode = new EnhancedMode(mockCli);
      await mode.init();

      const varCmd = mockCommandParser.register.mock.calls.find(
        call => call[0].name === 'var'
      );
      expect(varCmd).toBeDefined();
    });

    it('should register bookmark command', async () => {
      const mode = new EnhancedMode(mockCli);
      await mode.init();

      const bmCmd = mockCommandParser.register.mock.calls.find(
        call => call[0].name === 'bookmark'
      );
      expect(bmCmd).toBeDefined();
      expect(bmCmd[0].aliases).toContain('bm');
    });

    it('should register session command', async () => {
      const mode = new EnhancedMode(mockCli);
      await mode.init();

      const sesCmd = mockCommandParser.register.mock.calls.find(
        call => call[0].name === 'session'
      );
      expect(sesCmd).toBeDefined();
      expect(sesCmd[0].aliases).toContain('ses');
    });

    it('should register shortcuts command', async () => {
      const mode = new EnhancedMode(mockCli);
      await mode.init();

      const keysCmd = mockCommandParser.register.mock.calls.find(
        call => call[0].name === 'shortcuts'
      );
      expect(keysCmd).toBeDefined();
    });

    it('should register tokens command', async () => {
      const mode = new EnhancedMode(mockCli);
      await mode.init();

      const tokensCmd = mockCommandParser.register.mock.calls.find(
        call => call[0].name === 'tokens'
      );
      expect(tokensCmd).toBeDefined();
    });
  });

  // ===========================================================================
  // Command Handler Tests
  // ===========================================================================

  describe('command handlers', () => {
    describe('file command', () => {
      it('should add file to context', async () => {
        const mode = new EnhancedMode(mockCli);
        await mode.init();

        const fileCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'file'
        );
        const result = await fileCmd[0].handler(['test.js'], { flags: {} });

        expect(mockContext.addFile).toHaveBeenCalledWith('test.js', { watch: undefined });
        expect(result).toContain('Added');
      });

      it('should return usage when no argument', async () => {
        const mode = new EnhancedMode(mockCli);
        await mode.init();

        const fileCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'file'
        );
        const result = await fileCmd[0].handler([], { flags: {} });

        expect(result).toContain('Usage');
      });
    });

    describe('url command', () => {
      it('should add URL to context', async () => {
        const mode = new EnhancedMode(mockCli);
        await mode.init();

        const urlCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'url'
        );
        const result = await urlCmd[0].handler(['https://example.com']);

        expect(mockContext.addUrl).toHaveBeenCalledWith('https://example.com');
        expect(result).toContain('Added');
      });

      it('should return usage when no argument', async () => {
        const mode = new EnhancedMode(mockCli);
        await mode.init();

        const urlCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'url'
        );
        const result = await urlCmd[0].handler([]);

        expect(result).toContain('Usage');
      });
    });

    describe('context command', () => {
      it('should clear context', async () => {
        const mode = new EnhancedMode(mockCli);
        await mode.init();

        const ctxCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'context'
        );
        const result = await ctxCmd[0].handler(['clear']);

        expect(mockContext.clear).toHaveBeenCalled();
        expect(result).toBe('Context cleared');
      });

      it('should show empty context', async () => {
        const mode = new EnhancedMode(mockCli);
        await mode.init();

        const ctxCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'context'
        );
        const result = await ctxCmd[0].handler([]);

        expect(result).toBe('Context is empty');
      });

      it('should show context summary with files', async () => {
        mockContext.getSummary.mockReturnValue({
          files: [{ name: 'test.js', language: 'javascript' }],
          urls: [{ url: 'https://example.com' }],
          totalSize: 3072,
          maxSize: 100000
        });

        const mode = new EnhancedMode(mockCli);
        await mode.init();

        const ctxCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'context'
        );
        const result = await ctxCmd[0].handler([]);

        expect(result).toContain('Files:');
        expect(result).toContain('test.js');
        expect(result).toContain('URLs:');
        expect(result).toContain('example.com');
      });
    });

    describe('cache command', () => {
      it('should show cache stats', async () => {
        const mode = new EnhancedMode(mockCli);
        await mode.init();

        const cacheCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'cache'
        );
        const result = await cacheCmd[0].handler(['stats']);

        expect(result).toContain('Hits: 10');
        expect(result).toContain('Misses: 5');
        expect(result).toContain('Hit Rate');
      });

      it('should clear cache', async () => {
        const mode = new EnhancedMode(mockCli);
        await mode.init();

        const cacheCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'cache'
        );
        const result = await cacheCmd[0].handler(['clear']);

        expect(mockCache.clear).toHaveBeenCalled();
        expect(result).toBe('Cache cleared');
      });

      it('should enable cache', async () => {
        const mode = new EnhancedMode(mockCli);
        await mode.init();

        const cacheCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'cache'
        );
        const result = await cacheCmd[0].handler(['on']);

        expect(mockCache.enable).toHaveBeenCalled();
        expect(result).toBe('Cache enabled');
      });

      it('should disable cache', async () => {
        const mode = new EnhancedMode(mockCli);
        await mode.init();

        const cacheCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'cache'
        );
        const result = await cacheCmd[0].handler(['off']);

        expect(mockCache.disable).toHaveBeenCalled();
        expect(result).toBe('Cache disabled');
      });

      it('should show cache status by default', async () => {
        const mode = new EnhancedMode(mockCli);
        await mode.init();

        const cacheCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'cache'
        );
        const result = await cacheCmd[0].handler([]);

        expect(result).toContain('Cache:');
        expect(result).toContain('ON');
      });
    });

    describe('vim command', () => {
      it('should toggle vim mode', async () => {
        const mode = new EnhancedMode(mockCli);
        await mode.init();

        const vimCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'vim'
        );
        const result = await vimCmd[0].handler();

        expect(mockInput.toggleVimMode).toHaveBeenCalled();
        expect(result).toContain('Vim mode');
        expect(result).toContain('ON');
      });
    });

    describe('bookmark command', () => {
      it('should list bookmarks', async () => {
        mockHistory.listBookmarks.mockReturnValue([
          { name: 'bm1', text: 'bookmark text 1' }
        ]);

        const mode = new EnhancedMode(mockCli);
        await mode.init();

        const bmCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'bookmark'
        );
        const result = await bmCmd[0].handler(['list']);

        expect(result).toContain('bm1');
      });

      it('should add bookmark', async () => {
        const mode = new EnhancedMode(mockCli);
        await mode.init();

        const bmCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'bookmark'
        );
        const result = await bmCmd[0].handler(['add', 'mybookmark']);

        expect(mockHistory.addBookmark).toHaveBeenCalledWith('entry-1', 'mybookmark');
        expect(result).toContain('Bookmarked');
      });

      it('should return usage when adding without name', async () => {
        const mode = new EnhancedMode(mockCli);
        await mode.init();

        const bmCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'bookmark'
        );
        const result = await bmCmd[0].handler(['add']);

        expect(result).toContain('Usage');
      });

      it('should get bookmark', async () => {
        mockHistory.getBookmark.mockReturnValue({ text: 'bookmark content' });

        const mode = new EnhancedMode(mockCli);
        await mode.init();

        const bmCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'bookmark'
        );
        const result = await bmCmd[0].handler(['get', 'mybookmark']);

        expect(result).toBe('bookmark content');
      });
    });

    describe('shortcuts command', () => {
      it('should show keyboard shortcuts', async () => {
        const mode = new EnhancedMode(mockCli);
        await mode.init();

        const keysCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'shortcuts'
        );
        const result = await keysCmd[0].handler();

        expect(result).toContain('Keyboard Shortcuts');
        expect(result).toContain('Ctrl+U');
        expect(result).toContain('Tab');
      });
    });

    describe('tokens command', () => {
      it('should show token usage', async () => {
        const mode = new EnhancedMode(mockCli);
        await mode.init();

        const tokensCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'tokens'
        );
        const result = await tokensCmd[0].handler();

        expect(result).toContain('Token Usage');
        expect(result).toContain('5000'); // Without comma separator
      });
    });

    describe('session command', () => {
      it('should show current session', async () => {
        const mode = new EnhancedMode(mockCli);
        await mode.init();

        const sesCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'session'
        );
        const result = await sesCmd[0].handler([]);

        expect(result).toContain('Test Session');
        expect(result).toContain('session-1');
      });

      it('should create new session', async () => {
        const mode = new EnhancedMode(mockCli);
        await mode.init();

        const sesCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'session'
        );
        const result = await sesCmd[0].handler(['new', 'My', 'New', 'Session']);

        expect(mockSession.create).toHaveBeenCalled();
        expect(result).toContain('New session');
      });

      it('should save session', async () => {
        const mode = new EnhancedMode(mockCli);
        await mode.init();

        const sesCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'session'
        );
        const result = await sesCmd[0].handler(['save']);

        expect(mockSession.save).toHaveBeenCalled();
        expect(result).toContain('Saved');
      });

      it('should list sessions', async () => {
        mockSession.list.mockReturnValue([
          { id: 'ses-123456789012', name: 'Session 1', messageCount: 10 }
        ]);

        const mode = new EnhancedMode(mockCli);
        await mode.init();

        const sesCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'session'
        );
        const result = await sesCmd[0].handler(['list']);

        expect(result).toContain('Session 1');
        expect(result).toContain('10 msgs');
      });

      it('should export session', async () => {
        const mode = new EnhancedMode(mockCli);
        await mode.init();

        const sesCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'session'
        );
        const result = await sesCmd[0].handler(['export', 'md']);

        expect(mockSession.export).toHaveBeenCalledWith('md');
        expect(result).toContain('Exported MD');
      });

      it('should delete session', async () => {
        const mode = new EnhancedMode(mockCli);
        await mode.init();

        const sesCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'session'
        );
        const result = await sesCmd[0].handler(['delete', 'ses-123']);

        expect(mockSession.delete).toHaveBeenCalledWith('ses-123');
        expect(result).toContain('Deleted');
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

        const mode = new EnhancedMode(mockCli);
        const result = await mode.processInput('/help');

        expect(mockCommandParser.isCommand).toHaveBeenCalledWith('/help');
        expect(mockCommandParser.run).toHaveBeenCalled();
        expect(result.type).toBe('command');
        expect(result.result).toBe('command result');
      });
    });

    describe('query processing', () => {
      it('should process query with enhanced features', async () => {
        mockCli.streaming = false;
        mockQueryProcessor.process.mockResolvedValue({ text: 'AI response' });

        const mode = new EnhancedMode(mockCli);
        const result = await mode.processInput('hello');

        expect(mockOutput.startSpinner).toHaveBeenCalledWith('Processing...');
        expect(mockQueryProcessor.process).toHaveBeenCalled();
        expect(mockOutput.stopSpinner).toHaveBeenCalled();
        expect(result.type).toBe('query');
      });

      it('should handle streaming mode', async () => {
        mockCli.streaming = true;
        mockQueryProcessor.process.mockImplementation(async (input, options) => {
          if (options.onToken) {
            options.onToken('Hello');
            options.onToken(' world');
          }
          return { text: 'Hello world' };
        });

        const mode = new EnhancedMode(mockCli);
        await mode.processInput('hello');

        expect(mockOutput.streamWrite).toHaveBeenCalledWith('Hello');
        expect(mockOutput.streamWrite).toHaveBeenCalledWith(' world');
        expect(mockOutput.streamFlush).toHaveBeenCalled();
      });

      it('should handle query error', async () => {
        mockCli.streaming = false;
        mockQueryProcessor.process.mockRejectedValue(new Error('API error'));

        const mode = new EnhancedMode(mockCli);

        await expect(mode.processInput('hello')).rejects.toThrow('API error');
        expect(mockOutput.stopSpinnerFail).toHaveBeenCalledWith('API error');
      });
    });
  });

  // ===========================================================================
  // Get Info Tests
  // ===========================================================================

  describe('getInfo()', () => {
    it('should return mode information', () => {
      const mode = new EnhancedMode(mockCli);
      const info = mode.getInfo();

      expect(info.name).toBe('enhanced');
      expect(info.description).toBeDefined();
      expect(info.features).toContain('Context Management');
      expect(info.features).toContain('Caching');
      expect(info.features).toContain('Templates');
      expect(info.features).toContain('Vim Mode');
      expect(info.features).toContain('Bookmarks');
    });
  });

  // ===========================================================================
  // Factory Function Tests
  // ===========================================================================

  describe('createEnhancedMode()', () => {
    it('should create EnhancedMode instance', () => {
      const mode = createEnhancedMode(mockCli);
      expect(mode).toBeInstanceOf(EnhancedMode);
      expect(mode.cli).toBe(mockCli);
    });
  });
});
