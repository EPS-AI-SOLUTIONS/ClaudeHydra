/**
 * MCP Server Registry Tests
 * @module test/unit/mcp/server-registry.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ServerState,
  ServerEntry,
  ServerRegistry,
  getServerRegistry,
  resetServerRegistry
} from '../../../src/mcp/server-registry.js';

describe('MCP Server Registry', () => {
  beforeEach(() => {
    resetServerRegistry();
  });

  afterEach(() => {
    resetServerRegistry();
  });

  // ===========================================================================
  // ServerState Tests
  // ===========================================================================

  describe('ServerState', () => {
    it('should define all expected states', () => {
      expect(ServerState.DISCONNECTED).toBe('disconnected');
      expect(ServerState.CONNECTING).toBe('connecting');
      expect(ServerState.CONNECTED).toBe('connected');
      expect(ServerState.RECONNECTING).toBe('reconnecting');
      expect(ServerState.ERROR).toBe('error');
    });
  });

  // ===========================================================================
  // ServerEntry Tests
  // ===========================================================================

  describe('ServerEntry', () => {
    describe('constructor', () => {
      it('should initialize with id and config', () => {
        const config = { type: 'stdio', command: 'test', enabled: true };
        const entry = new ServerEntry('test-server', config);

        expect(entry.id).toBe('test-server');
        expect(entry.config).toEqual(config);
        expect(entry.state).toBe(ServerState.DISCONNECTED);
      });

      it('should initialize with null values', () => {
        const entry = new ServerEntry('test', {});

        expect(entry.client).toBeNull();
        expect(entry.transport).toBeNull();
        expect(entry.process).toBeNull();
        expect(entry.connectedAt).toBeNull();
        expect(entry.lastHealthCheck).toBeNull();
        expect(entry.healthResult).toBeNull();
        expect(entry.lastError).toBeNull();
      });

      it('should initialize with empty arrays', () => {
        const entry = new ServerEntry('test', {});

        expect(entry.tools).toEqual([]);
        expect(entry.resources).toEqual([]);
        expect(entry.prompts).toEqual([]);
      });

      it('should initialize stats', () => {
        const entry = new ServerEntry('test', {});

        expect(entry.stats.totalCalls).toBe(0);
        expect(entry.stats.successfulCalls).toBe(0);
        expect(entry.stats.failedCalls).toBe(0);
        expect(entry.stats.totalLatency).toBe(0);
        expect(entry.stats.errors).toEqual([]);
      });
    });

    describe('isAvailable', () => {
      it('should return true when connected and enabled', () => {
        const entry = new ServerEntry('test', { enabled: true });
        entry.state = ServerState.CONNECTED;

        expect(entry.isAvailable).toBe(true);
      });

      it('should return false when disconnected', () => {
        const entry = new ServerEntry('test', { enabled: true });
        entry.state = ServerState.DISCONNECTED;

        expect(entry.isAvailable).toBe(false);
      });

      it('should return false when disabled', () => {
        const entry = new ServerEntry('test', { enabled: false });
        entry.state = ServerState.CONNECTED;

        expect(entry.isAvailable).toBe(false);
      });
    });

    describe('averageLatency', () => {
      it('should return 0 when no successful calls', () => {
        const entry = new ServerEntry('test', {});

        expect(entry.averageLatency).toBe(0);
      });

      it('should calculate average latency', () => {
        const entry = new ServerEntry('test', {});
        entry.recordSuccess(100);
        entry.recordSuccess(200);
        entry.recordSuccess(300);

        expect(entry.averageLatency).toBe(200);
      });
    });

    describe('successRate', () => {
      it('should return 100 when no calls', () => {
        const entry = new ServerEntry('test', {});

        expect(entry.successRate).toBe(100);
      });

      it('should calculate success rate', () => {
        const entry = new ServerEntry('test', {});
        entry.recordSuccess(100);
        entry.recordSuccess(100);
        entry.recordFailure(new Error('test'));
        entry.recordFailure(new Error('test'));

        expect(entry.successRate).toBe(50);
      });
    });

    describe('recordSuccess()', () => {
      it('should record successful call', () => {
        const entry = new ServerEntry('test', {});
        entry.recordSuccess(150);

        expect(entry.stats.totalCalls).toBe(1);
        expect(entry.stats.successfulCalls).toBe(1);
        expect(entry.stats.totalLatency).toBe(150);
      });
    });

    describe('recordFailure()', () => {
      it('should record failed call', () => {
        const entry = new ServerEntry('test', {});
        entry.recordFailure(new Error('Test error'));

        expect(entry.stats.totalCalls).toBe(1);
        expect(entry.stats.failedCalls).toBe(1);
        expect(entry.stats.errors).toHaveLength(1);
        expect(entry.stats.errors[0].message).toBe('Test error');
      });

      it('should keep only last 10 errors', () => {
        const entry = new ServerEntry('test', {});

        for (let i = 0; i < 15; i++) {
          entry.recordFailure(new Error(`Error ${i}`));
        }

        expect(entry.stats.errors).toHaveLength(10);
        expect(entry.stats.errors[0].message).toBe('Error 5');
        expect(entry.stats.errors[9].message).toBe('Error 14');
      });
    });

    describe('resetStats()', () => {
      it('should reset all statistics', () => {
        const entry = new ServerEntry('test', {});
        entry.recordSuccess(100);
        entry.recordFailure(new Error('test'));

        entry.resetStats();

        expect(entry.stats.totalCalls).toBe(0);
        expect(entry.stats.successfulCalls).toBe(0);
        expect(entry.stats.failedCalls).toBe(0);
        expect(entry.stats.totalLatency).toBe(0);
        expect(entry.stats.errors).toEqual([]);
      });
    });

    describe('toJSON()', () => {
      it('should serialize entry', () => {
        const entry = new ServerEntry('test', {
          type: 'stdio',
          enabled: true,
          tags: ['ai']
        });
        entry.state = ServerState.CONNECTED;
        entry.connectedAt = new Date('2024-01-01T00:00:00Z');
        entry.tools = [{ name: 'tool1' }, { name: 'tool2' }];

        const json = entry.toJSON();

        expect(json.id).toBe('test');
        expect(json.state).toBe('connected');
        expect(json.isAvailable).toBe(true);
        expect(json.connectedAt).toBe('2024-01-01T00:00:00.000Z');
        expect(json.toolCount).toBe(2);
        expect(json.config.type).toBe('stdio');
      });
    });
  });

  // ===========================================================================
  // ServerRegistry Tests
  // ===========================================================================

  describe('ServerRegistry', () => {
    let registry;

    beforeEach(() => {
      registry = new ServerRegistry();
    });

    describe('constructor', () => {
      it('should initialize with empty maps', () => {
        expect(registry.servers.size).toBe(0);
        expect(registry.toolToServer.size).toBe(0);
        expect(registry.defaultServerId).toBeNull();
      });
    });

    describe('register()', () => {
      it('should register a new server', () => {
        const config = { type: 'stdio', command: 'test' };
        const entry = registry.register('test-server', config);

        expect(entry).toBeInstanceOf(ServerEntry);
        expect(registry.servers.has('test-server')).toBe(true);
      });

      it('should emit serverRegistered event', () => {
        const spy = vi.fn();
        registry.on('serverRegistered', spy);

        registry.register('test', {});

        expect(spy).toHaveBeenCalledWith(expect.any(ServerEntry));
      });

      it('should set first server as default', () => {
        registry.register('first', {});

        expect(registry.defaultServerId).toBe('first');
      });

      it('should respect isDefault option', () => {
        registry.register('first', {});
        registry.register('second', {}, { isDefault: true });

        expect(registry.defaultServerId).toBe('second');
      });

      it('should throw for duplicate registration', () => {
        registry.register('test', {});

        expect(() => registry.register('test', {}))
          .toThrow('Server already registered: test');
      });
    });

    describe('unregister()', () => {
      it('should unregister a server', () => {
        registry.register('test', {});

        const result = registry.unregister('test');

        expect(result).toBe(true);
        expect(registry.servers.has('test')).toBe(false);
      });

      it('should emit serverUnregistered event', () => {
        registry.register('test', {});
        const spy = vi.fn();
        registry.on('serverUnregistered', spy);

        registry.unregister('test');

        expect(spy).toHaveBeenCalled();
      });

      it('should remove tool mappings', () => {
        registry.register('test', {});
        registry.registerTools('test', [{ name: 'tool1' }]);

        registry.unregister('test');

        expect(registry.toolToServer.has('mcp__test__tool1')).toBe(false);
      });

      it('should update default if unregistered', () => {
        registry.register('first', {});
        registry.register('second', {});

        registry.unregister('first');

        expect(registry.defaultServerId).toBe('second');
      });

      it('should return false for unknown server', () => {
        const result = registry.unregister('unknown');

        expect(result).toBe(false);
      });
    });

    describe('get()', () => {
      it('should return server entry', () => {
        registry.register('test', { key: 'value' });

        const entry = registry.get('test');

        expect(entry).not.toBeNull();
        expect(entry.config.key).toBe('value');
      });

      it('should return null for unknown server', () => {
        expect(registry.get('unknown')).toBeNull();
      });
    });

    describe('has()', () => {
      it('should return true for registered server', () => {
        registry.register('test', {});

        expect(registry.has('test')).toBe(true);
      });

      it('should return false for unknown server', () => {
        expect(registry.has('unknown')).toBe(false);
      });
    });

    describe('getDefault()', () => {
      it('should return default server', () => {
        registry.register('test', {});

        expect(registry.getDefault()).not.toBeNull();
        expect(registry.getDefault().id).toBe('test');
      });

      it('should return null when no default', () => {
        expect(registry.getDefault()).toBeNull();
      });
    });

    describe('setDefault()', () => {
      it('should set default server', () => {
        registry.register('first', {});
        registry.register('second', {});

        registry.setDefault('second');

        expect(registry.defaultServerId).toBe('second');
      });

      it('should throw for unknown server', () => {
        expect(() => registry.setDefault('unknown'))
          .toThrow('Server not registered: unknown');
      });
    });

    describe('list()', () => {
      it('should list all servers', () => {
        registry.register('server1', {});
        registry.register('server2', {});

        const servers = registry.list();

        expect(servers).toHaveLength(2);
      });

      it('should return empty array when no servers', () => {
        expect(registry.list()).toEqual([]);
      });
    });

    describe('listAvailable()', () => {
      it('should list only available servers', () => {
        registry.register('enabled', { enabled: true });
        registry.register('disabled', { enabled: false });

        const enabled = registry.get('enabled');
        enabled.state = ServerState.CONNECTED;

        const available = registry.listAvailable();

        expect(available).toHaveLength(1);
        expect(available[0].id).toBe('enabled');
      });
    });

    describe('getByState()', () => {
      it('should filter by state', () => {
        registry.register('connected', {});
        registry.register('disconnected', {});

        registry.get('connected').state = ServerState.CONNECTED;

        const connected = registry.getByState(ServerState.CONNECTED);

        expect(connected).toHaveLength(1);
        expect(connected[0].id).toBe('connected');
      });
    });

    describe('getByTag()', () => {
      it('should filter by tag', () => {
        registry.register('ai-server', { tags: ['ai', 'local'] });
        registry.register('tool-server', { tags: ['tools'] });

        const aiServers = registry.getByTag('ai');

        expect(aiServers).toHaveLength(1);
        expect(aiServers[0].id).toBe('ai-server');
      });

      it('should return empty for no matches', () => {
        registry.register('test', { tags: ['other'] });

        expect(registry.getByTag('missing')).toEqual([]);
      });
    });

    describe('updateState()', () => {
      it('should update server state', () => {
        registry.register('test', {});

        registry.updateState('test', ServerState.CONNECTED);

        expect(registry.get('test').state).toBe(ServerState.CONNECTED);
      });

      it('should emit serverStateChanged event', () => {
        registry.register('test', {});
        const spy = vi.fn();
        registry.on('serverStateChanged', spy);

        registry.updateState('test', ServerState.CONNECTING);

        expect(spy).toHaveBeenCalledWith({
          entry: expect.any(ServerEntry),
          previousState: ServerState.DISCONNECTED,
          currentState: ServerState.CONNECTING
        });
      });

      it('should set connectedAt when connected', () => {
        registry.register('test', {});

        registry.updateState('test', ServerState.CONNECTED);

        expect(registry.get('test').connectedAt).toBeInstanceOf(Date);
      });

      it('should increment reconnectAttempts on reconnecting', () => {
        registry.register('test', {});

        registry.updateState('test', ServerState.RECONNECTING);
        registry.updateState('test', ServerState.RECONNECTING);

        expect(registry.get('test').reconnectAttempts).toBe(2);
      });

      it('should reset reconnectAttempts on connected', () => {
        registry.register('test', {});
        registry.updateState('test', ServerState.RECONNECTING);
        registry.updateState('test', ServerState.RECONNECTING);

        registry.updateState('test', ServerState.CONNECTED);

        expect(registry.get('test').reconnectAttempts).toBe(0);
      });

      it('should update extras', () => {
        registry.register('test', {});
        const client = { id: 'client' };
        const error = new Error('test');

        registry.updateState('test', ServerState.ERROR, { client, error });

        expect(registry.get('test').client).toBe(client);
        expect(registry.get('test').lastError).toBe(error);
      });

      it('should throw for unknown server', () => {
        expect(() => registry.updateState('unknown', ServerState.CONNECTED))
          .toThrow('Server not registered: unknown');
      });
    });

    describe('registerTools()', () => {
      it('should register tools', () => {
        registry.register('test', {});
        const tools = [{ name: 'tool1' }, { name: 'tool2' }];

        registry.registerTools('test', tools);

        expect(registry.get('test').tools).toEqual(tools);
      });

      it('should create tool-to-server mappings', () => {
        registry.register('test', {});
        registry.registerTools('test', [{ name: 'mytool' }]);

        expect(registry.toolToServer.get('mcp__test__mytool')).toBe('test');
      });

      it('should emit toolsDiscovered event', () => {
        registry.register('test', {});
        const spy = vi.fn();
        registry.on('toolsDiscovered', spy);

        registry.registerTools('test', [{ name: 'tool1' }]);

        expect(spy).toHaveBeenCalledWith({
          serverId: 'test',
          tools: expect.any(Array)
        });
      });

      it('should throw for unknown server', () => {
        expect(() => registry.registerTools('unknown', []))
          .toThrow('Server not registered: unknown');
      });
    });

    describe('registerResources()', () => {
      it('should register resources', () => {
        registry.register('test', {});
        const resources = [{ name: 'resource1' }];

        registry.registerResources('test', resources);

        expect(registry.get('test').resources).toEqual(resources);
      });

      it('should throw for unknown server', () => {
        expect(() => registry.registerResources('unknown', []))
          .toThrow('Server not registered: unknown');
      });
    });

    describe('registerPrompts()', () => {
      it('should register prompts', () => {
        registry.register('test', {});
        const prompts = [{ name: 'prompt1' }];

        registry.registerPrompts('test', prompts);

        expect(registry.get('test').prompts).toEqual(prompts);
      });

      it('should throw for unknown server', () => {
        expect(() => registry.registerPrompts('unknown', []))
          .toThrow('Server not registered: unknown');
      });
    });

    describe('findServerForTool()', () => {
      it('should find server providing tool', () => {
        registry.register('test', {});
        registry.registerTools('test', [{ name: 'mytool' }]);

        const server = registry.findServerForTool('mcp__test__mytool');

        expect(server).not.toBeNull();
        expect(server.id).toBe('test');
      });

      it('should return null for unknown tool', () => {
        expect(registry.findServerForTool('mcp__unknown__tool')).toBeNull();
      });
    });

    describe('getAllTools()', () => {
      it('should return all tools from available servers', () => {
        registry.register('server1', { enabled: true });
        registry.register('server2', { enabled: true });
        registry.get('server1').state = ServerState.CONNECTED;
        registry.get('server2').state = ServerState.CONNECTED;
        registry.registerTools('server1', [{ name: 'tool1' }]);
        registry.registerTools('server2', [{ name: 'tool2' }]);

        const tools = registry.getAllTools();

        expect(tools).toHaveLength(2);
        expect(tools[0].name).toBe('mcp__server1__tool1');
        expect(tools[0].serverId).toBe('server1');
      });

      it('should return all tools when onlyAvailable is false', () => {
        registry.register('server1', {});
        registry.registerTools('server1', [{ name: 'tool1' }]);

        const tools = registry.getAllTools({ onlyAvailable: false });

        expect(tools).toHaveLength(1);
      });
    });

    describe('updateHealth()', () => {
      it('should update health result', () => {
        registry.register('test', {});
        const result = { status: 'healthy', latency: 50 };

        registry.updateHealth('test', result);

        expect(registry.get('test').healthResult).toEqual(result);
        expect(registry.get('test').lastHealthCheck).toBeInstanceOf(Date);
      });

      it('should throw for unknown server', () => {
        expect(() => registry.updateHealth('unknown', {}))
          .toThrow('Server not registered: unknown');
      });
    });

    describe('getStats()', () => {
      it('should return registry statistics', () => {
        registry.register('server1', {});
        registry.register('server2', {});
        registry.get('server1').state = ServerState.CONNECTED;
        registry.registerTools('server1', [{ name: 'tool1' }]);

        const stats = registry.getStats();

        expect(stats.total).toBe(2);
        expect(stats.connected).toBe(1);
        expect(stats.totalTools).toBe(1);
        expect(stats.servers).toHaveLength(2);
      });
    });

    describe('clear()', () => {
      it('should clear all registrations', () => {
        registry.register('server1', {});
        registry.register('server2', {});
        registry.registerTools('server1', [{ name: 'tool' }]);

        registry.clear();

        expect(registry.servers.size).toBe(0);
        expect(registry.toolToServer.size).toBe(0);
        expect(registry.defaultServerId).toBeNull();
      });
    });
  });

  // ===========================================================================
  // Singleton Tests
  // ===========================================================================

  describe('Singleton functions', () => {
    describe('getServerRegistry()', () => {
      it('should return singleton instance', () => {
        const registry1 = getServerRegistry();
        const registry2 = getServerRegistry();

        expect(registry1).toBe(registry2);
      });
    });

    describe('resetServerRegistry()', () => {
      it('should reset singleton', () => {
        const registry1 = getServerRegistry();
        registry1.register('test', {});

        resetServerRegistry();

        const registry2 = getServerRegistry();
        expect(registry2.servers.size).toBe(0);
      });
    });
  });
});
