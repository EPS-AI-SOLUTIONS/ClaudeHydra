/**
 * MCPClientManager Tests
 * @module test/unit/mcp/client-manager.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock dependencies
vi.mock('../../../src/mcp/config-loader.js', () => ({
  MCPConfigLoader: vi.fn(),
  getConfigLoader: vi.fn(() => {
    const emitter = new EventEmitter();
    return {
      on: emitter.on.bind(emitter),
      emit: emitter.emit.bind(emitter),
      load: vi.fn().mockResolvedValue(undefined),
      getConfig: vi.fn().mockReturnValue({
        servers: {
          'test-server': {
            enabled: true,
            command: 'test-cmd',
            timeout: 30000
          }
        }
      }),
      reload: vi.fn().mockResolvedValue(undefined),
      stopWatching: vi.fn()
    };
  })
}));

vi.mock('../../../src/mcp/server-registry.js', () => {
  const ServerState = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    ERROR: 'error'
  };

  return {
    ServerState,
    ServerRegistry: vi.fn(),
    getServerRegistry: vi.fn(() => {
      const emitter = new EventEmitter();
      const servers = new Map();

      return {
        on: emitter.on.bind(emitter),
        emit: emitter.emit.bind(emitter),
        register: vi.fn((id, config) => {
          servers.set(id, {
            id,
            config,
            state: ServerState.DISCONNECTED,
            tools: [],
            isAvailable: false,
            recordSuccess: vi.fn(),
            recordFailure: vi.fn(),
            toJSON: () => ({ id, config, state: ServerState.DISCONNECTED })
          });
        }),
        unregister: vi.fn((id) => servers.delete(id)),
        get: vi.fn((id) => servers.get(id)),
        list: vi.fn(() => Array.from(servers.values())),
        updateState: vi.fn((id, state, extra) => {
          const entry = servers.get(id);
          if (entry) {
            entry.state = state;
            entry.isAvailable = state === ServerState.CONNECTED;
            if (extra) Object.assign(entry, extra);
          }
        }),
        registerTools: vi.fn((id, tools) => {
          const entry = servers.get(id);
          if (entry) entry.tools = tools;
        }),
        getAllTools: vi.fn(() => []),
        getByTag: vi.fn(() => []),
        getStats: vi.fn(() => ({ total: servers.size }))
      };
    })
  };
});

vi.mock('../../../src/mcp/health-checker.js', () => ({
  HealthStatus: {
    HEALTHY: 'healthy',
    UNHEALTHY: 'unhealthy',
    UNKNOWN: 'unknown'
  },
  HealthChecker: vi.fn(),
  getHealthChecker: vi.fn(() => {
    const emitter = new EventEmitter();
    return {
      on: emitter.on.bind(emitter),
      emit: emitter.emit.bind(emitter),
      startMonitoring: vi.fn(),
      stopMonitoring: vi.fn(),
      stopAllMonitoring: vi.fn(),
      check: vi.fn().mockResolvedValue({ status: 'healthy' }),
      refresh: vi.fn().mockResolvedValue({ status: 'healthy' }),
      getSummary: vi.fn().mockReturnValue({ healthy: 1, unhealthy: 0 })
    };
  })
}));

vi.mock('../../../src/mcp/transports/index.js', () => ({
  createTransport: vi.fn(() => {
    const emitter = new EventEmitter();
    return {
      on: emitter.on.bind(emitter),
      emit: emitter.emit.bind(emitter),
      start: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      request: vi.fn().mockResolvedValue({ tools: [] })
    };
  })
}));

describe('MCPClientManager', () => {
  let MCPClientManager;
  let getMCPClientManager;
  let initializeMCPClientManager;
  let resetMCPClientManager;
  let mockTransport;

  beforeEach(async () => {
    vi.resetModules();

    // Get fresh transport mock reference
    const transportModule = await import('../../../src/mcp/transports/index.js');
    mockTransport = {
      on: vi.fn(),
      emit: vi.fn(),
      start: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      request: vi.fn().mockResolvedValue({ tools: [{ name: 'test_tool' }] })
    };
    transportModule.createTransport.mockReturnValue(mockTransport);

    // Import MCPClientManager after mocks
    const module = await import('../../../src/mcp/client-manager.js');
    MCPClientManager = module.MCPClientManager;
    getMCPClientManager = module.getMCPClientManager;
    initializeMCPClientManager = module.initializeMCPClientManager;
    resetMCPClientManager = module.resetMCPClientManager;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    // Reset singleton
    try {
      await resetMCPClientManager();
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Constructor', () => {
    it('should create instance with default options', () => {
      const manager = new MCPClientManager();

      expect(manager.options.autoConnect).toBe(true);
      expect(manager.options.watchConfig).toBe(false);
      expect(manager.options.enableHealthChecks).toBe(true);
      expect(manager.initialized).toBe(false);
    });

    it('should accept custom options', () => {
      const manager = new MCPClientManager({
        autoConnect: false,
        watchConfig: true,
        enableHealthChecks: false
      });

      expect(manager.options.autoConnect).toBe(false);
      expect(manager.options.watchConfig).toBe(true);
      expect(manager.options.enableHealthChecks).toBe(false);
    });

    it('should initialize components', () => {
      const manager = new MCPClientManager();

      expect(manager.configLoader).toBeDefined();
      expect(manager.registry).toBeDefined();
      expect(manager.healthChecker).toBeDefined();
      expect(manager.transports).toBeInstanceOf(Map);
    });
  });

  describe('initialize', () => {
    it('should load config and register servers', async () => {
      const manager = new MCPClientManager({ autoConnect: false });

      await manager.initialize();

      expect(manager.configLoader.load).toHaveBeenCalled();
      expect(manager.registry.register).toHaveBeenCalledWith(
        'test-server',
        expect.objectContaining({ enabled: true })
      );
      expect(manager.initialized).toBe(true);
    });

    it('should not reinitialize if already initialized', async () => {
      const manager = new MCPClientManager({ autoConnect: false });

      await manager.initialize();
      await manager.initialize();

      expect(manager.configLoader.load).toHaveBeenCalledTimes(1);
    });

    it('should emit initialized event', async () => {
      const manager = new MCPClientManager({ autoConnect: false });
      const initSpy = vi.fn();
      manager.on('initialized', initSpy);

      await manager.initialize();

      expect(initSpy).toHaveBeenCalledWith(expect.objectContaining({
        serverCount: expect.any(Number)
      }));
    });

    it('should auto-connect when enabled', async () => {
      const manager = new MCPClientManager({ autoConnect: true });

      // Mock registry.list to return our test server
      manager.registry.list.mockReturnValue([{
        id: 'test-server',
        config: { enabled: true }
      }]);

      await manager.initialize();

      // Should attempt to connect
      expect(manager.registry.updateState).toHaveBeenCalled();
    });
  });

  describe('connect', () => {
    let manager;

    beforeEach(async () => {
      manager = new MCPClientManager({ autoConnect: false });
      await manager.initialize();
    });

    it('should throw for unregistered server', async () => {
      manager.registry.get.mockReturnValue(null);

      await expect(manager.connect('unknown')).rejects.toThrow('Server not registered');
    });

    it('should skip disabled servers', async () => {
      manager.registry.get.mockReturnValue({
        id: 'test-server',
        config: { enabled: false },
        state: 'disconnected'
      });

      await manager.connect('test-server');

      expect(mockTransport.start).not.toHaveBeenCalled();
    });

    it('should skip already connected servers', async () => {
      manager.registry.get.mockReturnValue({
        id: 'test-server',
        config: { enabled: true },
        state: 'connected'
      });

      await manager.connect('test-server');

      expect(mockTransport.start).not.toHaveBeenCalled();
    });

    it('should create transport and connect', async () => {
      manager.registry.get.mockReturnValue({
        id: 'test-server',
        config: { enabled: true, healthCheck: { enabled: false } },
        state: 'disconnected'
      });

      await manager.connect('test-server');

      expect(mockTransport.start).toHaveBeenCalled();
      expect(manager.registry.updateState).toHaveBeenCalledWith(
        'test-server',
        'connected',
        expect.any(Object)
      );
    });

    it('should discover tools after connecting', async () => {
      manager.registry.get.mockReturnValue({
        id: 'test-server',
        config: { enabled: true, healthCheck: { enabled: false } },
        state: 'disconnected'
      });

      await manager.connect('test-server');

      expect(mockTransport.request).toHaveBeenCalledWith('tools/list', {});
      expect(manager.registry.registerTools).toHaveBeenCalled();
    });

    it('should handle connection errors', async () => {
      manager.registry.get.mockReturnValue({
        id: 'test-server',
        config: { enabled: true },
        state: 'disconnected'
      });
      mockTransport.start.mockRejectedValue(new Error('Connection failed'));

      await expect(manager.connect('test-server')).rejects.toThrow('Connection failed');
      expect(manager.registry.updateState).toHaveBeenCalledWith(
        'test-server',
        'error',
        expect.objectContaining({ error: expect.any(Error) })
      );
    });
  });

  describe('connectAll', () => {
    let manager;

    beforeEach(async () => {
      manager = new MCPClientManager({ autoConnect: false });
      await manager.initialize();
    });

    it('should connect to all enabled servers', async () => {
      manager.registry.list.mockReturnValue([
        { id: 'server1', config: { enabled: true, healthCheck: { enabled: false } }, state: 'disconnected' },
        { id: 'server2', config: { enabled: true, healthCheck: { enabled: false } }, state: 'disconnected' },
        { id: 'server3', config: { enabled: false }, state: 'disconnected' }
      ]);

      manager.registry.get.mockImplementation((id) => {
        return manager.registry.list().find(s => s.id === id);
      });

      const results = await manager.connectAll();

      expect(results.connected.length + results.failed.length).toBe(2);
    });

    it('should collect errors without stopping', async () => {
      manager.registry.list.mockReturnValue([
        { id: 'server1', config: { enabled: true }, state: 'disconnected' },
        { id: 'server2', config: { enabled: true }, state: 'disconnected' }
      ]);

      manager.registry.get.mockImplementation((id) => {
        if (id === 'server1') return { id, config: { enabled: true }, state: 'disconnected' };
        return { id, config: { enabled: true }, state: 'disconnected' };
      });

      mockTransport.start
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Failed'));

      const results = await manager.connectAll();

      expect(results.failed.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('disconnect', () => {
    let manager;

    beforeEach(async () => {
      manager = new MCPClientManager({ autoConnect: false });
      await manager.initialize();
    });

    it('should handle disconnecting unregistered server', async () => {
      manager.registry.get.mockReturnValue(null);

      // Should not throw
      await expect(manager.disconnect('unknown')).resolves.not.toThrow();
    });

    it('should close transport and update state', async () => {
      manager.registry.get.mockReturnValue({
        id: 'test-server',
        config: { enabled: true }
      });
      manager.transports.set('test-server', mockTransport);

      await manager.disconnect('test-server');

      expect(mockTransport.close).toHaveBeenCalled();
      expect(manager.healthChecker.stopMonitoring).toHaveBeenCalledWith('test-server');
      expect(manager.registry.updateState).toHaveBeenCalledWith('test-server', 'disconnected');
    });
  });

  describe('executeTool', () => {
    let manager;

    beforeEach(async () => {
      manager = new MCPClientManager({ autoConnect: false });
      await manager.initialize();
    });

    it('should throw for unregistered server', async () => {
      manager.registry.get.mockReturnValue(null);

      await expect(manager.executeTool('unknown', 'tool', {}))
        .rejects.toThrow('Server not registered');
    });

    it('should throw for unavailable server', async () => {
      manager.registry.get.mockReturnValue({
        id: 'test-server',
        isAvailable: false,
        state: 'disconnected'
      });

      await expect(manager.executeTool('test-server', 'tool', {}))
        .rejects.toThrow('Server not available');
    });

    it('should throw when no transport exists', async () => {
      manager.registry.get.mockReturnValue({
        id: 'test-server',
        isAvailable: true,
        state: 'connected'
      });

      await expect(manager.executeTool('test-server', 'tool', {}))
        .rejects.toThrow('No transport for server');
    });

    it('should execute tool and return result', async () => {
      const mockEntry = {
        id: 'test-server',
        isAvailable: true,
        state: 'connected',
        config: { timeout: 30000 },
        recordSuccess: vi.fn(),
        recordFailure: vi.fn()
      };
      manager.registry.get.mockReturnValue(mockEntry);
      manager.transports.set('test-server', mockTransport);
      mockTransport.request.mockResolvedValue({ result: 'success' });

      const result = await manager.executeTool('test-server', 'test_tool', { arg: 'value' });

      expect(mockTransport.request).toHaveBeenCalledWith(
        'tools/call',
        { name: 'test_tool', arguments: { arg: 'value' } },
        30000
      );
      expect(result).toEqual({ result: 'success' });
      expect(mockEntry.recordSuccess).toHaveBeenCalled();
    });

    it('should record failure on error', async () => {
      const mockEntry = {
        id: 'test-server',
        isAvailable: true,
        state: 'connected',
        config: { timeout: 30000 },
        recordSuccess: vi.fn(),
        recordFailure: vi.fn()
      };
      manager.registry.get.mockReturnValue(mockEntry);
      manager.transports.set('test-server', mockTransport);
      mockTransport.request.mockRejectedValue(new Error('Tool failed'));

      await expect(manager.executeTool('test-server', 'test_tool', {}))
        .rejects.toThrow('Tool failed');
      expect(mockEntry.recordFailure).toHaveBeenCalled();
    });
  });

  describe('executeToolById', () => {
    let manager;

    beforeEach(async () => {
      manager = new MCPClientManager({ autoConnect: false });
      await manager.initialize();
    });

    it('should parse tool ID and execute', async () => {
      const mockEntry = {
        id: 'test-server',
        isAvailable: true,
        state: 'connected',
        config: { timeout: 30000 },
        recordSuccess: vi.fn(),
        recordFailure: vi.fn()
      };
      manager.registry.get.mockReturnValue(mockEntry);
      manager.transports.set('test-server', mockTransport);
      mockTransport.request.mockResolvedValue({ result: 'success' });

      const result = await manager.executeToolById('mcp__test-server__test_tool', { arg: 1 });

      expect(mockTransport.request).toHaveBeenCalledWith(
        'tools/call',
        { name: 'test_tool', arguments: { arg: 1 } },
        30000
      );
      expect(result).toEqual({ result: 'success' });
    });

    it('should throw for invalid tool ID format', async () => {
      await expect(manager.executeToolById('invalid_format', {}))
        .rejects.toThrow('Invalid tool ID format');
    });
  });

  describe('listTools', () => {
    it('should return all tools from registry', async () => {
      const manager = new MCPClientManager({ autoConnect: false });
      await manager.initialize();

      manager.registry.getAllTools.mockReturnValue([
        { name: 'tool1', serverId: 'server1' },
        { name: 'tool2', serverId: 'server2' }
      ]);

      const tools = manager.listTools();

      expect(tools).toHaveLength(2);
      expect(manager.registry.getAllTools).toHaveBeenCalledWith({ onlyAvailable: true });
    });
  });

  describe('getServerTools', () => {
    it('should return tools for specific server', async () => {
      const manager = new MCPClientManager({ autoConnect: false });
      await manager.initialize();

      manager.registry.get.mockReturnValue({
        id: 'test-server',
        tools: [{ name: 'tool1' }, { name: 'tool2' }]
      });

      const tools = manager.getServerTools('test-server');

      expect(tools).toHaveLength(2);
    });

    it('should return empty array for unknown server', async () => {
      const manager = new MCPClientManager({ autoConnect: false });
      await manager.initialize();

      manager.registry.get.mockReturnValue(null);

      const tools = manager.getServerTools('unknown');

      expect(tools).toEqual([]);
    });
  });

  describe('checkHealth', () => {
    let manager;

    beforeEach(async () => {
      manager = new MCPClientManager({ autoConnect: false });
      await manager.initialize();
    });

    it('should return unknown status when no transport', async () => {
      const health = await manager.checkHealth('test-server');

      expect(health.status).toBe('unknown');
      expect(health.available).toBe(false);
    });

    it('should check health via healthChecker', async () => {
      manager.transports.set('test-server', mockTransport);

      const health = await manager.checkHealth('test-server');

      expect(manager.healthChecker.check).toHaveBeenCalledWith('test-server', mockTransport);
      expect(health.status).toBe('healthy');
    });

    it('should force refresh when requested', async () => {
      manager.transports.set('test-server', mockTransport);

      await manager.checkHealth('test-server', true);

      expect(manager.healthChecker.refresh).toHaveBeenCalledWith('test-server', mockTransport);
    });
  });

  describe('getHealthSummary', () => {
    it('should return health summary from healthChecker', async () => {
      const manager = new MCPClientManager({ autoConnect: false });
      await manager.initialize();

      const summary = manager.getHealthSummary();

      expect(manager.healthChecker.getSummary).toHaveBeenCalled();
      expect(summary).toEqual({ healthy: 1, unhealthy: 0 });
    });
  });

  describe('getServerStatus', () => {
    it('should return server status', async () => {
      const manager = new MCPClientManager({ autoConnect: false });
      await manager.initialize();

      manager.registry.get.mockReturnValue({
        id: 'test-server',
        toJSON: () => ({ id: 'test-server', state: 'connected' })
      });

      const status = manager.getServerStatus('test-server');

      expect(status).toEqual({ id: 'test-server', state: 'connected' });
    });

    it('should return null for unknown server', async () => {
      const manager = new MCPClientManager({ autoConnect: false });
      await manager.initialize();

      manager.registry.get.mockReturnValue(null);

      const status = manager.getServerStatus('unknown');

      expect(status).toBeNull();
    });
  });

  describe('shutdown', () => {
    it('should stop config watching and disconnect all', async () => {
      const manager = new MCPClientManager({ autoConnect: false });
      await manager.initialize();
      manager.registry.list.mockReturnValue([]);

      const shutdownSpy = vi.fn();
      manager.on('shutdown', shutdownSpy);

      await manager.shutdown();

      expect(manager.configLoader.stopWatching).toHaveBeenCalled();
      expect(manager.healthChecker.stopAllMonitoring).toHaveBeenCalled();
      expect(manager.initialized).toBe(false);
      expect(shutdownSpy).toHaveBeenCalled();
    });
  });

  describe('Singleton functions', () => {
    it('getMCPClientManager should return singleton', async () => {
      const manager1 = getMCPClientManager();
      const manager2 = getMCPClientManager();

      expect(manager1).toBe(manager2);
    });

    it('initializeMCPClientManager should initialize singleton', async () => {
      const manager = await initializeMCPClientManager({ autoConnect: false });

      expect(manager.initialized).toBe(true);
    });

    it('initializeMCPClientManager should not reinitialize', async () => {
      const manager1 = await initializeMCPClientManager({ autoConnect: false });
      const manager2 = await initializeMCPClientManager({ autoConnect: false });

      expect(manager1).toBe(manager2);
      expect(manager1.configLoader.load).toHaveBeenCalledTimes(1);
    });

    it('resetMCPClientManager should reset singleton', async () => {
      const manager1 = await initializeMCPClientManager({ autoConnect: false });
      manager1.registry.list.mockReturnValue([]);

      await resetMCPClientManager();

      // After reset, new instance should be created
      const manager2 = getMCPClientManager();

      expect(manager2.initialized).toBe(false);
    });
  });
});
