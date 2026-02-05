/**
 * MCP Configuration Loader Tests
 * @module test/unit/mcp/config-loader.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    watch: vi.fn()
  },
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  watch: vi.fn()
}));

import fs from 'fs/promises';
import {
  HealthCheckConfigSchema,
  RetryConfigSchema,
  MCPServerConfigSchema,
  MCPConfigSchema,
  MCPConfigLoader,
  ConfigNotFoundError,
  ConfigValidationError,
  ConfigParseError,
  getConfigLoader,
  resetConfigLoader
} from '../../../src/mcp/config-loader.js';

describe('MCP Configuration Loader', () => {
  const validConfig = {
    version: '1.0.0',
    servers: {
      'test-server': {
        type: 'stdio',
        command: 'test-cmd',
        args: ['-v'],
        timeout: 30000,
        enabled: true
      }
    },
    groups: {
      ai: ['test-server']
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetConfigLoader();
  });

  afterEach(() => {
    resetConfigLoader();
  });

  // ===========================================================================
  // Schema Tests
  // ===========================================================================

  describe('HealthCheckConfigSchema', () => {
    it('should validate valid health check config', () => {
      const config = {
        enabled: true,
        interval: 60000,
        timeout: 5000,
        cacheTTL: 30000
      };

      const result = HealthCheckConfigSchema.parse(config);

      expect(result.enabled).toBe(true);
      expect(result.interval).toBe(60000);
    });

    it('should use defaults when not provided', () => {
      const result = HealthCheckConfigSchema.parse({});

      expect(result.enabled).toBe(true);
      expect(result.interval).toBe(60000);
      expect(result.timeout).toBe(5000);
      expect(result.cacheTTL).toBe(30000);
    });

    it('should reject invalid interval', () => {
      expect(() => HealthCheckConfigSchema.parse({ interval: -100 })).toThrow();
    });

    it('should reject extra properties', () => {
      expect(() => HealthCheckConfigSchema.parse({
        enabled: true,
        extraField: 'not allowed'
      })).toThrow();
    });
  });

  describe('RetryConfigSchema', () => {
    it('should validate valid retry config', () => {
      const config = {
        maxRetries: 5,
        baseDelay: 2000,
        maxDelay: 60000,
        backoffMultiplier: 3
      };

      const result = RetryConfigSchema.parse(config);

      expect(result.maxRetries).toBe(5);
      expect(result.backoffMultiplier).toBe(3);
    });

    it('should use defaults when not provided', () => {
      const result = RetryConfigSchema.parse({});

      expect(result.maxRetries).toBe(3);
      expect(result.baseDelay).toBe(1000);
      expect(result.maxDelay).toBe(30000);
      expect(result.backoffMultiplier).toBe(2);
    });

    it('should reject maxRetries above 10', () => {
      expect(() => RetryConfigSchema.parse({ maxRetries: 15 })).toThrow();
    });

    it('should reject negative baseDelay', () => {
      expect(() => RetryConfigSchema.parse({ baseDelay: -1000 })).toThrow();
    });
  });

  describe('MCPServerConfigSchema', () => {
    it('should validate stdio server config', () => {
      const config = {
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'test-mcp'],
        timeout: 30000,
        enabled: true
      };

      const result = MCPServerConfigSchema.parse(config);

      expect(result.type).toBe('stdio');
      expect(result.command).toBe('npx');
      expect(result.args).toEqual(['-y', 'test-mcp']);
    });

    it('should validate http server config', () => {
      const config = {
        type: 'http',
        url: 'http://localhost:8080/mcp',
        headers: { 'Authorization': 'Bearer token' },
        timeout: 30000,
        enabled: true
      };

      const result = MCPServerConfigSchema.parse(config);

      expect(result.type).toBe('http');
      expect(result.url).toBe('http://localhost:8080/mcp');
    });

    it('should validate sse server config', () => {
      const config = {
        type: 'sse',
        url: 'http://localhost:8080/events',
        timeout: 60000,
        enabled: true
      };

      const result = MCPServerConfigSchema.parse(config);

      expect(result.type).toBe('sse');
    });

    it('should require command for stdio type', () => {
      expect(() => MCPServerConfigSchema.parse({
        type: 'stdio',
        timeout: 30000
      })).toThrow('stdio type requires command');
    });

    it('should require url for http type', () => {
      expect(() => MCPServerConfigSchema.parse({
        type: 'http',
        timeout: 30000
      })).toThrow('http/sse types require url');
    });

    it('should require url for sse type', () => {
      expect(() => MCPServerConfigSchema.parse({
        type: 'sse',
        timeout: 30000
      })).toThrow('http/sse types require url');
    });

    it('should reject invalid type', () => {
      expect(() => MCPServerConfigSchema.parse({
        type: 'websocket',
        url: 'ws://localhost:8080'
      })).toThrow();
    });

    it('should support optional tags', () => {
      const config = {
        type: 'stdio',
        command: 'test',
        tags: ['ai', 'local']
      };

      const result = MCPServerConfigSchema.parse(config);

      expect(result.tags).toEqual(['ai', 'local']);
    });

    it('should support optional env variables', () => {
      const config = {
        type: 'stdio',
        command: 'test',
        env: { API_KEY: 'secret' }
      };

      const result = MCPServerConfigSchema.parse(config);

      expect(result.env).toEqual({ API_KEY: 'secret' });
    });

    it('should support nested healthCheck config', () => {
      const config = {
        type: 'stdio',
        command: 'test',
        healthCheck: {
          enabled: false,
          interval: 120000
        }
      };

      const result = MCPServerConfigSchema.parse(config);

      expect(result.healthCheck.enabled).toBe(false);
      expect(result.healthCheck.interval).toBe(120000);
    });
  });

  describe('MCPConfigSchema', () => {
    it('should validate full config', () => {
      const result = MCPConfigSchema.parse(validConfig);

      expect(result.version).toBe('1.0.0');
      expect(result.servers['test-server']).toBeDefined();
      expect(result.groups.ai).toContain('test-server');
    });

    it('should use default version', () => {
      const config = {
        servers: {
          'test': {
            type: 'stdio',
            command: 'test'
          }
        }
      };

      const result = MCPConfigSchema.parse(config);

      expect(result.version).toBe('1.0.0');
    });

    it('should support $schema field', () => {
      const config = {
        $schema: './schemas/mcp.schema.json',
        servers: {
          'test': { type: 'stdio', command: 'test' }
        }
      };

      const result = MCPConfigSchema.parse(config);

      expect(result.$schema).toBe('./schemas/mcp.schema.json');
    });

    it('should support optional defaults section', () => {
      const config = {
        servers: {
          'test': { type: 'stdio', command: 'test' }
        },
        defaults: {
          timeout: 60000,
          healthCheck: { enabled: true },
          retry: { maxRetries: 5 }
        }
      };

      const result = MCPConfigSchema.parse(config);

      expect(result.defaults.timeout).toBe(60000);
    });
  });

  // ===========================================================================
  // MCPConfigLoader Class Tests
  // ===========================================================================

  describe('MCPConfigLoader', () => {
    describe('constructor', () => {
      it('should use default config path', () => {
        const loader = new MCPConfigLoader();

        expect(loader.configPath).toContain('.hydra');
        expect(loader.configPath).toContain('mcp-servers.json');
      });

      it('should accept custom config path', () => {
        const loader = new MCPConfigLoader({
          configPath: '/custom/path/config.json'
        });

        expect(loader.configPath).toBe('/custom/path/config.json');
      });

      it('should accept watchChanges option', () => {
        const loader = new MCPConfigLoader({ watchChanges: true });

        expect(loader.watchChanges).toBe(true);
      });

      it('should accept envOverrides option', () => {
        const loader = new MCPConfigLoader({
          envOverrides: { API_KEY: 'test' }
        });

        expect(loader.envOverrides).toEqual({ API_KEY: 'test' });
      });

      it('should initialize with null config', () => {
        const loader = new MCPConfigLoader();

        expect(loader.config).toBeNull();
        expect(loader.lastLoadTime).toBeNull();
      });
    });

    describe('load()', () => {
      it('should load and parse valid config', async () => {
        fs.readFile.mockResolvedValue(JSON.stringify(validConfig));

        const loader = new MCPConfigLoader();
        const config = await loader.load();

        expect(config.servers['test-server']).toBeDefined();
        expect(loader.lastLoadTime).toBeInstanceOf(Date);
      });

      it('should emit configLoaded event', async () => {
        fs.readFile.mockResolvedValue(JSON.stringify(validConfig));

        const loader = new MCPConfigLoader();
        const loadedSpy = vi.fn();
        loader.on('configLoaded', loadedSpy);

        await loader.load();

        expect(loadedSpy).toHaveBeenCalledWith(expect.objectContaining({
          servers: expect.any(Object)
        }));
      });

      it('should throw ConfigNotFoundError for missing file', async () => {
        const error = new Error('File not found');
        error.code = 'ENOENT';
        fs.readFile.mockRejectedValue(error);

        const loader = new MCPConfigLoader({
          configPath: '/missing/config.json'
        });

        await expect(loader.load()).rejects.toThrow(ConfigNotFoundError);
      });

      it('should throw ConfigParseError for invalid JSON', async () => {
        fs.readFile.mockResolvedValue('{ invalid json }');

        const loader = new MCPConfigLoader();

        await expect(loader.load()).rejects.toThrow(ConfigParseError);
      });

      it('should throw ConfigValidationError for invalid schema', async () => {
        fs.readFile.mockResolvedValue(JSON.stringify({
          servers: {
            'test': { type: 'invalid-type' }
          }
        }));

        const loader = new MCPConfigLoader();

        await expect(loader.load()).rejects.toThrow(ConfigValidationError);
      });
    });

    describe('reload()', () => {
      it('should reload config and emit event', async () => {
        fs.readFile.mockResolvedValue(JSON.stringify(validConfig));

        const loader = new MCPConfigLoader();
        await loader.load();

        const reloadedSpy = vi.fn();
        loader.on('configReloaded', reloadedSpy);

        const updatedConfig = { ...validConfig, version: '2.0.0' };
        fs.readFile.mockResolvedValue(JSON.stringify(updatedConfig));

        await loader.reload();

        expect(reloadedSpy).toHaveBeenCalledWith({
          previous: expect.any(Object),
          current: expect.any(Object)
        });
      });

      it('should emit configError on reload failure', async () => {
        fs.readFile.mockResolvedValue(JSON.stringify(validConfig));

        const loader = new MCPConfigLoader();
        await loader.load();

        const errorSpy = vi.fn();
        loader.on('configError', errorSpy);

        fs.readFile.mockResolvedValue('invalid json');

        await expect(loader.reload()).rejects.toThrow();
        expect(errorSpy).toHaveBeenCalled();
      });
    });

    describe('getConfig()', () => {
      it('should return null before load', () => {
        const loader = new MCPConfigLoader();

        expect(loader.getConfig()).toBeNull();
      });

      it('should return config after load', async () => {
        fs.readFile.mockResolvedValue(JSON.stringify(validConfig));

        const loader = new MCPConfigLoader();
        await loader.load();

        expect(loader.getConfig()).not.toBeNull();
        expect(loader.getConfig().servers).toBeDefined();
      });
    });

    describe('getServer()', () => {
      it('should return null when no config loaded', () => {
        const loader = new MCPConfigLoader();

        expect(loader.getServer('test-server')).toBeNull();
      });

      it('should return server config by id', async () => {
        fs.readFile.mockResolvedValue(JSON.stringify(validConfig));

        const loader = new MCPConfigLoader();
        await loader.load();

        const server = loader.getServer('test-server');

        expect(server).toBeDefined();
        expect(server.type).toBe('stdio');
      });

      it('should return null for unknown server', async () => {
        fs.readFile.mockResolvedValue(JSON.stringify(validConfig));

        const loader = new MCPConfigLoader();
        await loader.load();

        expect(loader.getServer('unknown')).toBeNull();
      });
    });

    describe('getEnabledServers()', () => {
      it('should return empty Map when no config', () => {
        const loader = new MCPConfigLoader();

        expect(loader.getEnabledServers().size).toBe(0);
      });

      it('should return only enabled servers', async () => {
        const config = {
          servers: {
            'enabled-server': { type: 'stdio', command: 'test', enabled: true },
            'disabled-server': { type: 'stdio', command: 'test', enabled: false }
          }
        };
        fs.readFile.mockResolvedValue(JSON.stringify(config));

        const loader = new MCPConfigLoader();
        await loader.load();

        const enabled = loader.getEnabledServers();

        expect(enabled.size).toBe(1);
        expect(enabled.has('enabled-server')).toBe(true);
        expect(enabled.has('disabled-server')).toBe(false);
      });
    });

    describe('getServersByTag()', () => {
      it('should return empty Map when no config', () => {
        const loader = new MCPConfigLoader();

        expect(loader.getServersByTag('ai').size).toBe(0);
      });

      it('should return servers matching tag', async () => {
        const config = {
          servers: {
            'ai-server': { type: 'stdio', command: 'test', tags: ['ai', 'local'] },
            'other-server': { type: 'stdio', command: 'test', tags: ['tools'] }
          }
        };
        fs.readFile.mockResolvedValue(JSON.stringify(config));

        const loader = new MCPConfigLoader();
        await loader.load();

        const aiServers = loader.getServersByTag('ai');

        expect(aiServers.size).toBe(1);
        expect(aiServers.has('ai-server')).toBe(true);
      });
    });

    describe('getServersByGroup()', () => {
      it('should return empty Map when no config', () => {
        const loader = new MCPConfigLoader();

        expect(loader.getServersByGroup('ai').size).toBe(0);
      });

      it('should return servers in group', async () => {
        const config = {
          servers: {
            'server1': { type: 'stdio', command: 'test' },
            'server2': { type: 'stdio', command: 'test' },
            'server3': { type: 'stdio', command: 'test' }
          },
          groups: {
            'production': ['server1', 'server2'],
            'development': ['server3']
          }
        };
        fs.readFile.mockResolvedValue(JSON.stringify(config));

        const loader = new MCPConfigLoader();
        await loader.load();

        const prodServers = loader.getServersByGroup('production');

        expect(prodServers.size).toBe(2);
        expect(prodServers.has('server1')).toBe(true);
        expect(prodServers.has('server2')).toBe(true);
      });

      it('should handle non-existent server in group', async () => {
        const config = {
          servers: {
            'server1': { type: 'stdio', command: 'test' }
          },
          groups: {
            'test': ['server1', 'non-existent']
          }
        };
        fs.readFile.mockResolvedValue(JSON.stringify(config));

        const loader = new MCPConfigLoader();
        await loader.load();

        const servers = loader.getServersByGroup('test');

        expect(servers.size).toBe(1);
        expect(servers.has('server1')).toBe(true);
      });
    });

    describe('interpolateEnvVars()', () => {
      it('should interpolate string values', () => {
        const loader = new MCPConfigLoader({
          envOverrides: { API_KEY: 'secret123' }
        });

        const result = loader.interpolateEnvVars({
          key: '${API_KEY}'
        });

        expect(result.key).toBe('secret123');
      });

      it('should interpolate nested objects', () => {
        const loader = new MCPConfigLoader({
          envOverrides: { HOST: 'localhost', PORT: '8080' }
        });

        const result = loader.interpolateEnvVars({
          server: {
            url: 'http://${HOST}:${PORT}'
          }
        });

        expect(result.server.url).toBe('http://localhost:8080');
      });

      it('should interpolate arrays', () => {
        const loader = new MCPConfigLoader({
          envOverrides: { ARG: 'value' }
        });

        const result = loader.interpolateEnvVars({
          args: ['--option', '${ARG}']
        });

        expect(result.args).toEqual(['--option', 'value']);
      });

      it('should replace missing vars with empty string', () => {
        const loader = new MCPConfigLoader();

        const result = loader.interpolateEnvVars({
          key: '${MISSING_VAR}'
        });

        expect(result.key).toBe('');
      });

      it('should handle non-string values', () => {
        const loader = new MCPConfigLoader();

        const result = loader.interpolateEnvVars({
          number: 42,
          bool: true,
          nullValue: null
        });

        expect(result.number).toBe(42);
        expect(result.bool).toBe(true);
        expect(result.nullValue).toBeNull();
      });
    });

    describe('applyDefaults()', () => {
      it('should apply default timeout', () => {
        const loader = new MCPConfigLoader();
        const config = {
          servers: {
            'test': { type: 'stdio', command: 'test' }
          },
          defaults: {
            timeout: 60000
          }
        };

        const result = loader.applyDefaults(config);

        expect(result.servers.test.timeout).toBe(60000);
      });

      it('should apply default healthCheck settings', () => {
        const loader = new MCPConfigLoader();
        const config = {
          servers: {
            'test': { type: 'stdio', command: 'test' }
          },
          defaults: {
            healthCheck: { interval: 120000 }
          }
        };

        const result = loader.applyDefaults(config);

        expect(result.servers.test.healthCheck.interval).toBe(120000);
        expect(result.servers.test.healthCheck.enabled).toBe(true);
      });

      it('should not override server-specific values', () => {
        const loader = new MCPConfigLoader();
        const config = {
          servers: {
            'test': {
              type: 'stdio',
              command: 'test',
              timeout: 90000,
              healthCheck: { interval: 30000 }
            }
          },
          defaults: {
            timeout: 60000,
            healthCheck: { interval: 120000 }
          }
        };

        const result = loader.applyDefaults(config);

        expect(result.servers.test.timeout).toBe(90000);
        expect(result.servers.test.healthCheck.interval).toBe(30000);
      });
    });

    describe('stopWatching()', () => {
      it('should close watcher if exists', () => {
        const loader = new MCPConfigLoader();
        const mockWatcher = { close: vi.fn() };
        loader.watcher = mockWatcher;

        loader.stopWatching();

        expect(mockWatcher.close).toHaveBeenCalled();
        expect(loader.watcher).toBeNull();
      });

      it('should handle no watcher gracefully', () => {
        const loader = new MCPConfigLoader();

        expect(() => loader.stopWatching()).not.toThrow();
      });
    });

    describe('validateServer()', () => {
      it('should return valid true for valid config', () => {
        const result = MCPConfigLoader.validateServer({
          type: 'stdio',
          command: 'test'
        });

        expect(result.valid).toBe(true);
        expect(result.errors).toBeUndefined();
      });

      it('should return valid false with errors for invalid config', () => {
        const result = MCPConfigLoader.validateServer({
          type: 'stdio'
          // missing command
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    describe('createDefaultConfig()', () => {
      it('should create default config file', async () => {
        fs.mkdir.mockResolvedValue(undefined);
        fs.writeFile.mockResolvedValue(undefined);

        await MCPConfigLoader.createDefaultConfig('/path/to/config.json');

        expect(fs.mkdir).toHaveBeenCalledWith('/path/to', { recursive: true });
        expect(fs.writeFile).toHaveBeenCalledWith(
          '/path/to/config.json',
          expect.stringContaining('"version"')
        );
      });
    });
  });

  // ===========================================================================
  // Error Classes Tests
  // ===========================================================================

  describe('ConfigNotFoundError', () => {
    it('should have correct name and message', () => {
      const error = new ConfigNotFoundError('/path/to/config.json');

      expect(error.name).toBe('ConfigNotFoundError');
      expect(error.message).toContain('/path/to/config.json');
      expect(error.configPath).toBe('/path/to/config.json');
    });

    it('should be instanceof Error', () => {
      const error = new ConfigNotFoundError('/path');

      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('ConfigValidationError', () => {
    it('should have correct name and format errors', () => {
      const errors = [
        { path: ['servers', 'test', 'type'], message: 'Invalid enum value' }
      ];
      const error = new ConfigValidationError(errors);

      expect(error.name).toBe('ConfigValidationError');
      expect(error.message).toContain('servers.test.type');
      expect(error.errors).toBe(errors);
    });
  });

  describe('ConfigParseError', () => {
    it('should have correct name and message', () => {
      const error = new ConfigParseError('Unexpected token at position 10');

      expect(error.name).toBe('ConfigParseError');
      expect(error.message).toContain('Unexpected token');
    });
  });

  // ===========================================================================
  // Singleton Tests
  // ===========================================================================

  describe('Singleton functions', () => {
    describe('getConfigLoader()', () => {
      it('should return singleton instance', () => {
        const loader1 = getConfigLoader();
        const loader2 = getConfigLoader();

        expect(loader1).toBe(loader2);
      });

      it('should accept options on first call', () => {
        const loader = getConfigLoader({
          configPath: '/custom/path.json'
        });

        expect(loader.configPath).toBe('/custom/path.json');
      });
    });

    describe('resetConfigLoader()', () => {
      it('should reset singleton', () => {
        const loader1 = getConfigLoader();
        resetConfigLoader();
        const loader2 = getConfigLoader();

        expect(loader1).not.toBe(loader2);
      });

      it('should stop watching on reset', () => {
        const loader = getConfigLoader();
        const mockWatcher = { close: vi.fn() };
        loader.watcher = mockWatcher;

        resetConfigLoader();

        expect(mockWatcher.close).toHaveBeenCalled();
      });
    });
  });
});
