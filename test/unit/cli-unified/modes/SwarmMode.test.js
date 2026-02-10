/**
 * SwarmMode Tests
 * @module test/unit/cli-unified/modes/SwarmMode.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock constants
vi.mock('../../../../src/cli-unified/core/constants.js', () => ({
  AGENT_NAMES: ['Geralt', 'Yennefer', 'Triss', 'Ciri', 'Vesemir']
}));

import {
  SwarmMode,
  createSwarmMode
} from '../../../../src/cli-unified/modes/SwarmMode.js';

describe('SwarmMode Module', () => {
  let mockCli;
  let mockCommandParser;
  let mockQueryProcessor;
  let mockOutput;
  let mockHistory;
  let mockAgentRouter;
  let mockInput;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock command parser
    mockCommandParser = {
      register: vi.fn(),
      isCommand: vi.fn(() => false),
      run: vi.fn()
    };

    // Create mock query processor (with EventEmitter methods for agentic iteration listeners)
    mockQueryProcessor = {
      defaultModel: 'test-model',
      process: vi.fn(() => Promise.resolve({ text: 'response', response: 'AI response' })),
      processParallel: vi.fn(() => Promise.resolve({
        results: [
          { response: 'Response 1' },
          { response: 'Response 2' }
        ],
        errors: []
      })),
      on: vi.fn(),
      off: vi.fn()
    };

    // Create mock output
    mockOutput = {
      startSpinner: vi.fn(),
      stopSpinner: vi.fn(),
      stopSpinnerSuccess: vi.fn(),
      stopSpinnerFail: vi.fn(),
      streamWrite: vi.fn(),
      streamFlush: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      dim: vi.fn(),
      createProgressIndicator: vi.fn(() => ({
        start: vi.fn(),
        advance: vi.fn(),
        complete: vi.fn()
      }))
    };

    // Create mock history
    mockHistory = {
      getRecent: vi.fn(() => []),
      count: 5
    };

    // Create mock agent router
    mockAgentRouter = {
      getCurrent: vi.fn(() => ({ name: 'Geralt', avatar: '🐺', role: 'Leader' })),
      list: vi.fn(() => [
        { name: 'Geralt', avatar: '🐺', role: 'Leader' },
        { name: 'Yennefer', avatar: '🔮', role: 'Architect' },
        { name: 'Triss', avatar: '🔥', role: 'Implementer' }
      ]),
      select: vi.fn((name) => ({ name, avatar: '🐺', role: 'Selected Agent' })),
      getStats: vi.fn(() => ({
        Geralt: { calls: 5, avgTime: 100, successRate: 100 }
      }))
    };

    // Create mock input manager
    mockInput = {
      startMacroRecording: vi.fn(),
      stopMacroRecording: vi.fn(() => ({ name: 'test-macro', actions: [1, 2, 3] })),
      executeMacro: vi.fn(),
      macros: {
        list: vi.fn(() => [
          { key: 'macro1', actionCount: 5 },
          { key: 'macro2', actionCount: 3 }
        ])
      },
      templates: {
        list: vi.fn(() => []),
        apply: vi.fn(),
        listVariables: vi.fn(() => ({})),
        getVariable: vi.fn(),
        setVariable: vi.fn()
      },
      toggleVimMode: vi.fn(() => true)
    };

    // Create mock CLI
    mockCli = {
      commandParser: mockCommandParser,
      queryProcessor: mockQueryProcessor,
      output: mockOutput,
      history: mockHistory,
      agentRouter: mockAgentRouter,
      input: mockInput,
      streaming: false,
      context: {
        addFile: vi.fn(() => ({ name: 'test.js', language: 'javascript', size: 1024 })),
        addUrl: vi.fn(() => Promise.resolve({ size: 2048 })),
        clear: vi.fn(),
        getSummary: vi.fn(() => ({ files: [], urls: [], totalSize: 0, maxSize: 100000 }))
      },
      cache: {
        getStats: vi.fn(() => ({ hits: 10, misses: 5, hitRate: '66.7%', size: 50, maxSize: 100, totalTokensSaved: 1000 })),
        clear: vi.fn(),
        enable: vi.fn(),
        disable: vi.fn(),
        isEnabled: true,
        size: 50
      },
      session: {
        getCurrent: vi.fn(() => ({ id: 'session-1', name: 'Test', messages: [], metadata: { totalTokens: 5000 }, created: Date.now() })),
        create: vi.fn(),
        save: vi.fn(() => true),
        load: vi.fn(),
        loadRecent: vi.fn(),
        list: vi.fn(() => []),
        delete: vi.fn(() => true),
        rename: vi.fn(),
        export: vi.fn(() => '# Export')
      },
      themeRegistry: {
        list: vi.fn(() => ['default', 'dark', 'light']),
        getCurrent: vi.fn(() => ({ name: 'default' }))
      }
    };
  });

  // ===========================================================================
  // Constructor Tests
  // ===========================================================================

  describe('constructor', () => {
    it('should create with CLI reference', () => {
      const mode = new SwarmMode(mockCli);
      expect(mode.cli).toBe(mockCli);
      expect(mode.name).toBe('swarm');
    });

    it('should extend EventEmitter', () => {
      const mode = new SwarmMode(mockCli);
      expect(mode).toBeInstanceOf(EventEmitter);
    });

    it('should create EnhancedMode instance', () => {
      const mode = new SwarmMode(mockCli);
      expect(mode.enhancedMode).toBeDefined();
    });
  });

  // ===========================================================================
  // Initialization Tests
  // ===========================================================================

  describe('init()', () => {
    it('should register commands', async () => {
      const mode = new SwarmMode(mockCli);
      await mode.init();

      expect(mockCommandParser.register).toHaveBeenCalled();
    });

    it('should emit ready event', async () => {
      const mode = new SwarmMode(mockCli);
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
    it('should register agent command', async () => {
      const mode = new SwarmMode(mockCli);
      await mode.init();

      const agentCmd = mockCommandParser.register.mock.calls.find(
        call => call[0].name === 'agent'
      );
      expect(agentCmd).toBeDefined();
      expect(agentCmd[0].aliases).toContain('a');
      expect(agentCmd[0].category).toBe('agents');
    });

    it('should register agents command', async () => {
      const mode = new SwarmMode(mockCli);
      await mode.init();

      const agentsCmd = mockCommandParser.register.mock.calls.find(
        call => call[0].name === 'agents'
      );
      expect(agentsCmd).toBeDefined();
    });

    it('should register stats command', async () => {
      const mode = new SwarmMode(mockCli);
      await mode.init();

      const statsCmd = mockCommandParser.register.mock.calls.find(
        call => call[0].name === 'stats'
      );
      expect(statsCmd).toBeDefined();
    });

    it('should register chain command', async () => {
      const mode = new SwarmMode(mockCli);
      await mode.init();

      const chainCmd = mockCommandParser.register.mock.calls.find(
        call => call[0].name === 'chain'
      );
      expect(chainCmd).toBeDefined();
    });

    it('should register parallel command', async () => {
      const mode = new SwarmMode(mockCli);
      await mode.init();

      const parCmd = mockCommandParser.register.mock.calls.find(
        call => call[0].name === 'parallel'
      );
      expect(parCmd).toBeDefined();
      expect(parCmd[0].aliases).toContain('par');
    });

    it('should register macro command', async () => {
      const mode = new SwarmMode(mockCli);
      await mode.init();

      const macroCmd = mockCommandParser.register.mock.calls.find(
        call => call[0].name === 'macro'
      );
      expect(macroCmd).toBeDefined();
      expect(macroCmd[0].category).toBe('automation');
    });

    it('should register swarm command', async () => {
      const mode = new SwarmMode(mockCli);
      await mode.init();

      const swarmCmd = mockCommandParser.register.mock.calls.find(
        call => call[0].name === 'swarm'
      );
      expect(swarmCmd).toBeDefined();
    });

    it('should register yolo command', async () => {
      const mode = new SwarmMode(mockCli);
      await mode.init();

      const yoloCmd = mockCommandParser.register.mock.calls.find(
        call => call[0].name === 'yolo'
      );
      expect(yoloCmd).toBeDefined();
    });

    it('should register shortcuts for each agent', async () => {
      const mode = new SwarmMode(mockCli);
      await mode.init();

      const geraltCmd = mockCommandParser.register.mock.calls.find(
        call => call[0].name === 'geralt'
      );
      expect(geraltCmd).toBeDefined();
      expect(geraltCmd[0].hidden).toBe(true);
    });
  });

  // ===========================================================================
  // Command Handler Tests
  // ===========================================================================

  describe('command handlers', () => {
    describe('agent command', () => {
      it('should show current and available agents', async () => {
        const mode = new SwarmMode(mockCli);
        await mode.init();

        const agentCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'agent'
        );
        const result = await agentCmd[0].handler([]);

        expect(result).toContain('Current: Geralt');
        expect(result).toContain('Available agents');
      });

      it('should select agent when argument provided', async () => {
        const mode = new SwarmMode(mockCli);
        await mode.init();

        const agentCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'agent'
        );
        const result = await agentCmd[0].handler(['Yennefer']);

        expect(mockAgentRouter.select).toHaveBeenCalledWith('Yennefer', '');
        expect(result).toContain('Agent set to');
      });
    });

    describe('agents command', () => {
      it('should list all agents', async () => {
        const mode = new SwarmMode(mockCli);
        await mode.init();

        const agentsCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'agents'
        );
        const result = await agentsCmd[0].handler();

        expect(result).toContain('Geralt');
        expect(result).toContain('Yennefer');
        expect(result).toContain('Triss');
      });
    });

    describe('stats command', () => {
      it('should show agent statistics', async () => {
        const mode = new SwarmMode(mockCli);
        await mode.init();

        const statsCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'stats'
        );
        const result = await statsCmd[0].handler();

        expect(result).toContain('Agent Statistics');
        expect(result).toContain('Geralt');
        expect(result).toContain('5 calls');
      });

      it('should handle empty stats', async () => {
        mockAgentRouter.getStats.mockReturnValue({});

        const mode = new SwarmMode(mockCli);
        await mode.init();

        const statsCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'stats'
        );
        const result = await statsCmd[0].handler();

        expect(result).toContain('No agent executions');
      });
    });

    describe('chain command', () => {
      it('should return usage when no delimiter', async () => {
        const mode = new SwarmMode(mockCli);
        await mode.init();

        const chainCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'chain'
        );
        const result = await chainCmd[0].handler(['Geralt', 'Yennefer']);

        expect(result).toContain('Usage');
      });

      it('should return usage when no prompt', async () => {
        const mode = new SwarmMode(mockCli);
        await mode.init();

        const chainCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'chain'
        );
        const result = await chainCmd[0].handler(['Geralt', 'Yennefer', '--']);

        expect(result).toContain('Usage');
      });

      it('should execute chain with proper agents', async () => {
        const mode = new SwarmMode(mockCli);
        await mode.init();

        vi.spyOn(mode, 'executeChain').mockResolvedValue('Chain result');

        const chainCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'chain'
        );
        const result = await chainCmd[0].handler(['Geralt', 'Yennefer', '--', 'test', 'prompt']);

        expect(mode.executeChain).toHaveBeenCalledWith(['Geralt', 'Yennefer'], 'test prompt');
      });
    });

    describe('parallel command', () => {
      it('should return usage when not enough arguments', async () => {
        const mode = new SwarmMode(mockCli);
        await mode.init();

        const parCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'parallel'
        );
        const result = await parCmd[0].handler(['Geralt,Yennefer']);

        expect(result).toContain('Usage');
      });

      it('should execute parallel with proper agents', async () => {
        const mode = new SwarmMode(mockCli);
        await mode.init();

        vi.spyOn(mode, 'executeParallel').mockResolvedValue('Parallel result');

        const parCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'parallel'
        );
        await parCmd[0].handler(['Geralt,Yennefer', 'test', 'prompt']);

        expect(mode.executeParallel).toHaveBeenCalledWith(['Geralt', 'Yennefer'], 'test prompt');
      });
    });

    describe('macro command', () => {
      it('should list macros by default', async () => {
        const mode = new SwarmMode(mockCli);
        await mode.init();

        const macroCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'macro'
        );
        const result = await macroCmd[0].handler([]);

        expect(result).toContain('macro1');
        expect(result).toContain('5 actions');
      });

      it('should start recording', async () => {
        const mode = new SwarmMode(mockCli);
        await mode.init();

        const macroCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'macro'
        );
        const result = await macroCmd[0].handler(['record', 'my-macro']);

        expect(mockInput.startMacroRecording).toHaveBeenCalledWith('my-macro');
        expect(result).toContain('Recording macro');
      });

      it('should stop recording', async () => {
        const mode = new SwarmMode(mockCli);
        await mode.init();

        const macroCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'macro'
        );
        const result = await macroCmd[0].handler(['stop']);

        expect(mockInput.stopMacroRecording).toHaveBeenCalled();
        expect(result).toContain('Saved macro');
      });

      it('should run macro', async () => {
        const mode = new SwarmMode(mockCli);
        await mode.init();

        const macroCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'macro'
        );
        const result = await macroCmd[0].handler(['run', 'my-macro']);

        expect(mockInput.executeMacro).toHaveBeenCalledWith('my-macro');
        expect(result).toContain('Executed macro');
      });
    });

    describe('swarm command', () => {
      it('should return usage when no prompt', async () => {
        const mode = new SwarmMode(mockCli);
        await mode.init();

        const swarmCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'swarm'
        );
        const result = await swarmCmd[0].handler([]);

        expect(result).toContain('Usage');
      });

      it('should execute swarm protocol', async () => {
        const mode = new SwarmMode(mockCli);
        await mode.init();

        vi.spyOn(mode, 'executeSwarmProtocol').mockResolvedValue('Swarm result');

        const swarmCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'swarm'
        );
        await swarmCmd[0].handler(['test', 'prompt']);

        expect(mode.executeSwarmProtocol).toHaveBeenCalledWith('test prompt');
      });
    });

    describe('yolo command', () => {
      it('should return usage when no prompt', async () => {
        const mode = new SwarmMode(mockCli);
        await mode.init();

        const yoloCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'yolo'
        );
        const result = await yoloCmd[0].handler([], {});

        expect(result).toContain('Usage');
      });

      it('should query Ciri in YOLO mode', async () => {
        const mode = new SwarmMode(mockCli);
        await mode.init();

        vi.spyOn(mode, 'queryAgent').mockResolvedValue('YOLO result');

        const yoloCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'yolo'
        );
        const ctx = {};
        await yoloCmd[0].handler(['test', 'prompt'], ctx);

        expect(ctx.yolo).toBe(true);
        expect(mode.queryAgent).toHaveBeenCalledWith('Ciri', 'test prompt', { temperature: 0.9 });
      });
    });

    describe('agent shortcuts', () => {
      it('should query specific agent', async () => {
        const mode = new SwarmMode(mockCli);
        await mode.init();

        vi.spyOn(mode, 'queryAgent').mockResolvedValue('Agent response');

        const geraltCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'geralt'
        );
        await geraltCmd[0].handler(['test', 'query']);

        expect(mode.queryAgent).toHaveBeenCalledWith('Geralt', 'test query');
      });

      it('should return usage when no prompt', async () => {
        const mode = new SwarmMode(mockCli);
        await mode.init();

        const geraltCmd = mockCommandParser.register.mock.calls.find(
          call => call[0].name === 'geralt'
        );
        const result = await geraltCmd[0].handler([]);

        expect(result).toContain('Usage');
      });
    });
  });

  // ===========================================================================
  // Query Agent Tests
  // ===========================================================================

  describe('queryAgent()', () => {
    it('should query with correct agent', async () => {
      const mode = new SwarmMode(mockCli);
      await mode.queryAgent('Geralt', 'test prompt');

      expect(mockAgentRouter.select).toHaveBeenCalledWith('Geralt', 'test prompt');
      expect(mockQueryProcessor.process).toHaveBeenCalled();
    });

    it('should show spinner with agent name', async () => {
      const mode = new SwarmMode(mockCli);
      await mode.queryAgent('Geralt', 'test prompt');

      expect(mockOutput.startSpinner).toHaveBeenCalledWith(expect.stringContaining('thinking'));
    });

    it('should handle streaming mode', async () => {
      mockCli.streaming = true;
      mockQueryProcessor.process.mockImplementation(async (input, options) => {
        if (options.onToken) {
          options.onToken('Hello');
          options.onToken(' world');
        }
        return { text: 'Hello world', response: 'Hello world' };
      });

      const mode = new SwarmMode(mockCli);
      await mode.queryAgent('Geralt', 'test prompt');

      expect(mockOutput.streamWrite).toHaveBeenCalled();
      expect(mockOutput.streamFlush).toHaveBeenCalled();
    });

    it('should handle errors', async () => {
      mockQueryProcessor.process.mockRejectedValue(new Error('Query failed'));

      const mode = new SwarmMode(mockCli);

      await expect(mode.queryAgent('Geralt', 'test')).rejects.toThrow('Query failed');
      expect(mockOutput.stopSpinnerFail).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Execute Chain Tests
  // ===========================================================================

  describe('executeChain()', () => {
    it('should execute agents in sequence', async () => {
      const mode = new SwarmMode(mockCli);
      vi.spyOn(mode, 'queryAgent').mockResolvedValue('Response');

      await mode.executeChain(['Geralt', 'Yennefer'], 'test prompt');

      expect(mode.queryAgent).toHaveBeenCalledTimes(2);
      expect(mockOutput.info).toHaveBeenCalledWith('Chain: Geralt...');
      expect(mockOutput.info).toHaveBeenCalledWith('Chain: Yennefer...');
    });

    it('should pass previous response as context', async () => {
      const mode = new SwarmMode(mockCli);
      vi.spyOn(mode, 'queryAgent')
        .mockResolvedValueOnce('First response')
        .mockResolvedValueOnce('Second response');

      await mode.executeChain(['Geralt', 'Yennefer'], 'test prompt');

      // Second call should include previous response
      expect(mode.queryAgent).toHaveBeenNthCalledWith(
        2,
        'Yennefer',
        expect.stringContaining('First response')
      );
    });
  });

  // ===========================================================================
  // Execute Parallel Tests
  // ===========================================================================

  describe('executeParallel()', () => {
    it('should execute agents in parallel', async () => {
      const mode = new SwarmMode(mockCli);
      await mode.executeParallel(['Geralt', 'Yennefer'], 'test prompt');

      expect(mockQueryProcessor.processParallel).toHaveBeenCalled();
      expect(mockOutput.startSpinner).toHaveBeenCalledWith('Executing in parallel...');
    });

    it('should format results correctly', async () => {
      const mode = new SwarmMode(mockCli);
      const result = await mode.executeParallel(['Geralt', 'Yennefer'], 'test prompt');

      expect(result).toContain('--- Geralt ---');
      expect(result).toContain('--- Yennefer ---');
    });

    it('should handle errors in results', async () => {
      mockQueryProcessor.processParallel.mockResolvedValue({
        results: [
          { error: 'Agent failed' },
          { response: 'Success' }
        ],
        errors: []
      });

      const mode = new SwarmMode(mockCli);
      const result = await mode.executeParallel(['Geralt', 'Yennefer'], 'test prompt');

      expect(result).toContain('[ERROR]');
      expect(result).toContain('Agent failed');
    });
  });

  // ===========================================================================
  // Process Input Tests
  // ===========================================================================

  describe('processInput()', () => {
    it('should handle @agent syntax', async () => {
      const mode = new SwarmMode(mockCli);
      vi.spyOn(mode, 'queryAgent').mockResolvedValue('Agent response');

      const result = await mode.processInput('@Geralt test query');

      expect(mode.queryAgent).toHaveBeenCalledWith('Geralt', 'test query');
      expect(result.type).toBe('query');
    });

    it('should delegate to enhanced mode for normal input', async () => {
      const mode = new SwarmMode(mockCli);
      vi.spyOn(mode.enhancedMode, 'processInput').mockResolvedValue({ type: 'command', result: 'ok' });

      const result = await mode.processInput('/help');

      expect(mode.enhancedMode.processInput).toHaveBeenCalledWith('/help', {});
    });
  });

  // ===========================================================================
  // Get Info Tests
  // ===========================================================================

  describe('getInfo()', () => {
    it('should return mode information', () => {
      const mode = new SwarmMode(mockCli);
      const info = mode.getInfo();

      expect(info.name).toBe('swarm');
      expect(info.description).toContain('Witcher Swarm');
      expect(info.features).toContain('12 Specialized Agents');
      expect(info.features).toContain('Agent Chains');
      expect(info.features).toContain('Parallel Execution');
      expect(info.features).toContain('Swarm Protocol');
      expect(info.features).toContain('YOLO Mode');
      expect(info.features).toContain('Macros');
    });
  });

  // ===========================================================================
  // Factory Function Tests
  // ===========================================================================

  describe('createSwarmMode()', () => {
    it('should create SwarmMode instance', () => {
      const mode = createSwarmMode(mockCli);
      expect(mode).toBeInstanceOf(SwarmMode);
      expect(mode.cli).toBe(mockCli);
    });
  });
});
