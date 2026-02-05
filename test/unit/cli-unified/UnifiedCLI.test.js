/**
 * UnifiedCLI Tests
 * @module test/unit/cli-unified/UnifiedCLI.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoist mocks to ensure they're applied before imports
const mockConfigManager = {
  get: vi.fn((key) => {
    const defaults = {
      'general.mode': 'basic',
      'general.theme': 'hydra',
      'performance.cacheEnabled': true,
      'performance.cacheMaxSize': 100,
      'performance.cacheTTL': 300,
      'input.vimMode': false,
      'models.llamacpp.enabled': true,
      'models.llamacpp.models.main': 'main',
      'ui.streamingEnabled': true
    };
    return defaults[key];
  }),
  saveConfig: vi.fn()
};

const mockTheme = {
  colors: {
    primary: (s) => s,
    highlight: (s) => s,
    dim: (s) => s,
    info: (s) => s,
    success: (s) => s
  }
};

const mockOutput = {
  print: vi.fn(),
  newline: vi.fn(),
  dim: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  renderMarkdown: vi.fn(),
  stopSpinner: vi.fn()
};

const mockInput = {
  read: vi.fn().mockResolvedValue({ value: '', cancelled: true }),
  readMultiline: vi.fn(),
  close: vi.fn()
};

const mockHistory = { add: vi.fn() };
const mockCommandParser = {};
const mockAgentRouter = {};
const mockContext = {};
const mockCache = {};
const mockQueryProcessor = { checkHealth: vi.fn().mockResolvedValue({ healthy: false }) };
const mockSession = {};
const mockBridge = { setMcpInvoker: vi.fn() };

// Mock Mode classes need to return constructible objects
class MockBasicMode {
  constructor(cli) {
    this.cli = cli;
  }
  init = vi.fn();
  getInfo = vi.fn(() => ({ name: 'basic' }));
  processInput = vi.fn();
}

class MockEnhancedMode {
  constructor(cli) {
    this.cli = cli;
  }
  init = vi.fn();
  getInfo = vi.fn(() => ({ name: 'enhanced' }));
  processInput = vi.fn();
}

class MockSwarmMode {
  constructor(cli) {
    this.cli = cli;
  }
  init = vi.fn();
  getInfo = vi.fn(() => ({ name: 'swarm' }));
  processInput = vi.fn();
}

// Mock all dependencies
vi.mock('../../../src/mcp/client-manager.js', () => ({
  initializeMCPClientManager: vi.fn().mockRejectedValue(new Error('MCP not configured'))
}));

vi.mock('../../../src/hydra/providers/llamacpp-bridge.js', () => ({
  getLlamaCppBridge: vi.fn(() => mockBridge)
}));

vi.mock('../../../src/cli-unified/core/ConfigManager.js', () => ({
  getConfigManager: vi.fn(() => mockConfigManager),
  ConfigManager: vi.fn()
}));

vi.mock('../../../src/cli-unified/core/ThemeRegistry.js', () => ({
  themeRegistry: {
    set: vi.fn(),
    getCurrent: vi.fn(() => mockTheme)
  },
  getAutoTheme: vi.fn(() => 'hydra')
}));

vi.mock('../../../src/cli-unified/output/UnifiedOutputRenderer.js', () => ({
  createOutputRenderer: vi.fn(() => mockOutput),
  UnifiedOutputRenderer: vi.fn()
}));

vi.mock('../../../src/cli-unified/input/UnifiedInputHandler.js', () => ({
  createInputHandler: vi.fn(() => mockInput),
  UnifiedInputHandler: vi.fn()
}));

vi.mock('../../../src/cli-unified/history/UnifiedHistoryManager.js', () => ({
  createHistoryManager: vi.fn(() => mockHistory),
  UnifiedHistoryManager: vi.fn()
}));

vi.mock('../../../src/cli-unified/processing/UnifiedCommandParser.js', () => ({
  createCommandParser: vi.fn(() => mockCommandParser),
  UnifiedCommandParser: vi.fn()
}));

vi.mock('../../../src/cli-unified/processing/AgentRouter.js', () => ({
  createAgentRouter: vi.fn(() => mockAgentRouter),
  AgentRouter: vi.fn()
}));

vi.mock('../../../src/cli-unified/processing/ContextManager.js', () => ({
  createContextManager: vi.fn(() => mockContext),
  ContextManager: vi.fn()
}));

vi.mock('../../../src/cli-unified/processing/CacheManager.js', () => ({
  createCacheManager: vi.fn(() => mockCache),
  CacheManager: vi.fn()
}));

vi.mock('../../../src/cli-unified/processing/QueryProcessor.js', () => ({
  createQueryProcessor: vi.fn(() => mockQueryProcessor),
  QueryProcessor: vi.fn()
}));

vi.mock('../../../src/cli-unified/session/SessionManager.js', () => ({
  createSessionManager: vi.fn(() => mockSession),
  SessionManager: vi.fn()
}));

vi.mock('../../../src/cli-unified/modes/BasicMode.js', () => ({
  BasicMode: MockBasicMode
}));

vi.mock('../../../src/cli-unified/modes/EnhancedMode.js', () => ({
  EnhancedMode: MockEnhancedMode
}));

vi.mock('../../../src/cli-unified/modes/SwarmMode.js', () => ({
  SwarmMode: MockSwarmMode
}));

describe('UnifiedCLI', () => {
  let UnifiedCLI;
  let createCLI;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Dynamically import to apply mocks
    const module = await import('../../../src/cli-unified/UnifiedCLI.js');
    UnifiedCLI = module.UnifiedCLI;
    createCLI = module.createCLI;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should create instance with default options', () => {
      const cli = new UnifiedCLI();

      expect(cli.version).toBeDefined();
      expect(cli.codename).toBeDefined();
      expect(cli.yolo).toBe(true);
      expect(cli.autoApprove).toBe(true);
    });

    it('should accept custom mode option', () => {
      const cli = new UnifiedCLI({ mode: 'enhanced' });

      expect(cli.modeName).toBe('enhanced');
    });

    it('should accept yolo=false option', () => {
      const cli = new UnifiedCLI({ yolo: false });

      expect(cli.yolo).toBe(false);
    });

    it('should initialize all components', () => {
      const cli = new UnifiedCLI();

      expect(cli.config).toBeDefined();
      expect(cli.output).toBeDefined();
      expect(cli.history).toBeDefined();
      expect(cli.commandParser).toBeDefined();
      expect(cli.agentRouter).toBeDefined();
      expect(cli.context).toBeDefined();
      expect(cli.cache).toBeDefined();
      expect(cli.input).toBeDefined();
      expect(cli.queryProcessor).toBeDefined();
      expect(cli.session).toBeDefined();
    });

    it('should not have mode instance before init', () => {
      const cli = new UnifiedCLI();

      expect(cli.mode).toBeNull();
      expect(cli.running).toBe(false);
    });
  });

  describe('init', () => {
    it('should handle MCP initialization failure gracefully', async () => {
      const cli = new UnifiedCLI({ mode: 'basic' });
      await cli.init();

      // Should not throw even if MCP fails
      expect(cli.mcpManager).toBeNull();
      expect(cli.mode).toBeDefined();
    });

    it('should create BasicMode for basic mode', async () => {
      const cli = new UnifiedCLI({ mode: 'basic' });
      await cli.init();

      // Verify mode was created with correct type
      expect(cli.mode).toBeInstanceOf(MockBasicMode);
    });

    it('should create EnhancedMode for enhanced mode', async () => {
      const cli = new UnifiedCLI({ mode: 'enhanced' });
      await cli.init();

      // Verify mode was created with correct type
      expect(cli.mode).toBeInstanceOf(MockEnhancedMode);
    });

    it('should create SwarmMode for swarm mode', async () => {
      const cli = new UnifiedCLI({ mode: 'swarm' });
      await cli.init();

      // Verify mode was created with correct type
      expect(cli.mode).toBeInstanceOf(MockSwarmMode);
    });

    it('should default to BasicMode for unknown mode', async () => {
      const cli = new UnifiedCLI({ mode: 'unknown' });
      await cli.init();

      // Unknown mode defaults to BasicMode
      expect(cli.mode).toBeInstanceOf(MockBasicMode);
    });

    it('should emit init event', async () => {
      const cli = new UnifiedCLI({ mode: 'basic' });
      const initSpy = vi.fn();
      cli.on('init', initSpy);

      await cli.init();

      expect(initSpy).toHaveBeenCalledWith('basic');
    });
  });

  describe('detectMode', () => {
    it('should return BASIC when health check fails', async () => {
      const cli = new UnifiedCLI({ mode: 'auto' });

      const mode = await cli.detectMode();

      expect(mode).toBe('basic');
    });
  });

  describe('showBanner', () => {
    it('should print banner without errors', async () => {
      const cli = new UnifiedCLI({ mode: 'basic' });
      await cli.init();

      expect(() => cli.showBanner()).not.toThrow();
      expect(mockOutput.print).toHaveBeenCalled();
      expect(mockOutput.newline).toHaveBeenCalled();
    });
  });

  describe('shutdown', () => {
    it('should set running to false', async () => {
      const cli = new UnifiedCLI({ mode: 'basic' });
      await cli.init();
      cli.running = true;

      // Mock process.exit to prevent actual exit
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});

      await cli.shutdown();

      expect(cli.running).toBe(false);

      exitSpy.mockRestore();
    });

    it('should stop spinner and close input', async () => {
      const cli = new UnifiedCLI({ mode: 'basic' });
      await cli.init();

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});

      await cli.shutdown();

      expect(mockOutput.stopSpinner).toHaveBeenCalled();
      expect(mockInput.close).toHaveBeenCalled();

      exitSpy.mockRestore();
    });

    it('should save config', async () => {
      const cli = new UnifiedCLI({ mode: 'basic' });
      await cli.init();

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});

      await cli.shutdown();

      expect(mockConfigManager.saveConfig).toHaveBeenCalled();

      exitSpy.mockRestore();
    });

    it('should emit exit event', async () => {
      const cli = new UnifiedCLI({ mode: 'basic' });
      await cli.init();
      const exitEventSpy = vi.fn();
      cli.on('exit', exitEventSpy);

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});

      await cli.shutdown();

      expect(exitEventSpy).toHaveBeenCalled();

      exitSpy.mockRestore();
    });
  });

  describe('getModeInfo', () => {
    it('should return mode info after init', async () => {
      const cli = new UnifiedCLI({ mode: 'basic' });
      await cli.init();

      const info = cli.getModeInfo();

      expect(info).toEqual({ name: 'basic' });
    });

    it('should return unknown when mode not initialized', () => {
      const cli = new UnifiedCLI();

      const info = cli.getModeInfo();

      expect(info).toEqual({ name: 'unknown' });
    });
  });

  describe('switchMode', () => {
    it('should switch to valid mode', async () => {
      const cli = new UnifiedCLI({ mode: 'basic' });
      await cli.init();

      await cli.switchMode('enhanced');

      expect(cli.modeName).toBe('enhanced');
    });

    it('should throw for invalid mode', async () => {
      const cli = new UnifiedCLI({ mode: 'basic' });
      await cli.init();

      await expect(cli.switchMode('invalid')).rejects.toThrow('Unknown mode: invalid');
    });

    it('should emit modeSwitch event', async () => {
      const cli = new UnifiedCLI({ mode: 'basic' });
      await cli.init();
      const switchSpy = vi.fn();
      cli.on('modeSwitch', switchSpy);

      await cli.switchMode('swarm');

      expect(switchSpy).toHaveBeenCalledWith('swarm');
    });
  });

  describe('createCLI', () => {
    it('should create UnifiedCLI instance', async () => {
      const cli = await createCLI({ mode: 'basic' });

      expect(cli).toBeInstanceOf(UnifiedCLI);
    });

    it('should accept options', async () => {
      const cli = await createCLI({ mode: 'enhanced', yolo: false });

      expect(cli.modeName).toBe('enhanced');
      expect(cli.yolo).toBe(false);
    });
  });
});
