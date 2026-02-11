/**
 * Swarm Protocol Tests
 * @module test/unit/swarm/protocol.test
 */

import { writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fs functions
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('[]'),
  };
});

// Mock crypto
vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => '12345678-1234-1234-1234-123456789abc'),
}));

// Mock ConnectionPool
vi.mock('../../../src/hydra/core/pool.js', () => {
  class MockConnectionPool {
    constructor() {
      this.maxConcurrent = 5;
    }
    async execute(fn) {
      return fn();
    }
  }
  return {
    ConnectionPool: MockConnectionPool,
  };
});

// Mock llamacpp-bridge
vi.mock('../../../src/hydra/providers/llamacpp-bridge.js', () => ({
  getLlamaCppBridge: vi.fn(() => ({
    generate: vi.fn().mockResolvedValue({ content: 'test response', model: 'main' }),
    getInfo: vi.fn().mockResolvedValue({ status: 'connected' }),
  })),
}));

// Mock claude-client
vi.mock('../../../src/hydra/providers/claude-client.js', () => ({
  healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
  generate: vi.fn().mockResolvedValue({ content: 'claude response' }),
  selectModel: vi.fn().mockReturnValue('claude-3-sonnet-20240229'),
}));

// Mock agents module
vi.mock('../../../src/swarm/agents.js', () => ({
  invokeAgent: vi.fn().mockResolvedValue({
    success: true,
    agent: 'TestAgent',
    tier: 'executor',
    response: 'Test response',
    duration: 1000,
  }),
  classifyPrompt: vi.fn().mockReturnValue({
    prompt: 'test',
    agent: 'Geralt',
    tier: 'executor',
    provider: 'llamacpp',
    model: 'main',
  }),
  analyzeComplexity: vi.fn().mockReturnValue({
    level: 'moderate',
    factors: [],
  }),
  checkProviders: vi.fn().mockResolvedValue({
    allReady: true,
    partialReady: true,
    tiers: {
      commander: true,
      coordinator: true,
      executor: true,
    },
  }),
  AGENT_SPECS: {
    Dijkstra: { persona: 'Spymaster', focus: 'Planning', tier: 'commander', skills: [] },
    Regis: { persona: 'Sage', focus: 'Research', tier: 'coordinator', skills: [] },
    Geralt: { persona: 'White Wolf', focus: 'Security', tier: 'executor', skills: [] },
  },
  AGENT_NAMES: [
    'Dijkstra',
    'Regis',
    'Geralt',
    'Yennefer',
    'Jaskier',
    'Triss',
    'Vesemir',
    'Ciri',
    'Eskel',
    'Lambert',
    'Zoltan',
    'Philippa',
  ],
  MODEL_TIERS: {
    commander: { provider: 'claude', model: 'opus', displayName: 'Claude Opus' },
    coordinator: { provider: 'claude', model: 'sonnet', displayName: 'Claude Sonnet' },
    executor: { provider: 'llamacpp', model: 'main', tool: 'llama_generate' },
  },
  AGENT_TIERS: {
    Dijkstra: 'commander',
    Regis: 'coordinator',
    Geralt: 'executor',
  },
  getAgentTier: vi.fn((agent) => {
    const tiers = {
      Dijkstra: 'commander',
      Regis: 'coordinator',
      Yennefer: 'coordinator',
      Jaskier: 'coordinator',
      Geralt: 'executor',
      Triss: 'executor',
    };
    return tiers[agent] || 'executor';
  }),
}));

describe('Swarm Protocol', () => {
  let protocol;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Suppress console output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});

    protocol = await import('../../../src/swarm/protocol.js');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Constants Tests
  // ===========================================================================

  describe('Constants', () => {
    describe('SWARM_VERSION', () => {
      it('should be a string', () => {
        expect(typeof protocol.SWARM_VERSION).toBe('string');
      });

      it('should match semantic versioning pattern', () => {
        expect(protocol.SWARM_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
      });
    });

    describe('STANDARD_MODE', () => {
      it('should have expected properties', () => {
        expect(protocol.STANDARD_MODE.maxConcurrency).toBeDefined();
        expect(protocol.STANDARD_MODE.safetyBlocking).toBeDefined();
        expect(protocol.STANDARD_MODE.retryAttempts).toBeDefined();
        expect(protocol.STANDARD_MODE.timeoutSeconds).toBeDefined();
      });

      it('should have safety blocking enabled', () => {
        expect(protocol.STANDARD_MODE.safetyBlocking).toBe(true);
      });

      it('should have reasonable concurrency limit', () => {
        expect(protocol.STANDARD_MODE.maxConcurrency).toBeGreaterThan(0);
        expect(protocol.STANDARD_MODE.maxConcurrency).toBeLessThanOrEqual(10);
      });
    });

    describe('YOLO_MODE', () => {
      it('should have expected properties', () => {
        expect(protocol.YOLO_MODE.maxConcurrency).toBeDefined();
        expect(protocol.YOLO_MODE.safetyBlocking).toBeDefined();
        expect(protocol.YOLO_MODE.retryAttempts).toBeDefined();
        expect(protocol.YOLO_MODE.timeoutSeconds).toBeDefined();
      });

      it('should have safety blocking disabled', () => {
        expect(protocol.YOLO_MODE.safetyBlocking).toBe(false);
      });

      it('should have higher concurrency than standard', () => {
        expect(protocol.YOLO_MODE.maxConcurrency).toBeGreaterThan(
          protocol.STANDARD_MODE.maxConcurrency,
        );
      });

      it('should have lower timeout than standard', () => {
        expect(protocol.YOLO_MODE.timeoutSeconds).toBeLessThan(
          protocol.STANDARD_MODE.timeoutSeconds,
        );
      });

      it('should have fewer retry attempts than standard', () => {
        expect(protocol.YOLO_MODE.retryAttempts).toBeLessThan(protocol.STANDARD_MODE.retryAttempts);
      });
    });
  });

  // ===========================================================================
  // invokeSwarm Tests
  // ===========================================================================

  describe('invokeSwarm()', () => {
    it('should be a function', () => {
      expect(typeof protocol.invokeSwarm).toBe('function');
    });

    it('should return a promise', () => {
      const result = protocol.invokeSwarm('test query', { verbose: false });
      expect(result).toBeInstanceOf(Promise);
    });

    it('should return success result', async () => {
      const result = await protocol.invokeSwarm('test query', { verbose: false });

      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.query).toBe('test query');
    });

    it('should generate unique session ID', async () => {
      const result = await protocol.invokeSwarm('test query', { verbose: false });

      expect(result.sessionId).toBeDefined();
      expect(typeof result.sessionId).toBe('string');
      expect(result.sessionId.length).toBeGreaterThan(0);
    });

    it('should include duration in result', async () => {
      const result = await protocol.invokeSwarm('test query', { verbose: false });

      expect(typeof result.duration).toBe('number');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should include transcript in result', async () => {
      const result = await protocol.invokeSwarm('test query', { verbose: false });

      expect(result.transcript).toBeDefined();
      expect(result.transcript.sessionId).toBeDefined();
      expect(result.transcript.query).toBe('test query');
      expect(result.transcript.steps).toBeDefined();
    });

    it('should respect skipResearch option', async () => {
      const { invokeAgent } = await import('../../../src/swarm/agents.js');

      await protocol.invokeSwarm('test query', {
        verbose: false,
        skipResearch: true,
      });

      // Regis should not be called when skipping research
      const regisCalls = invokeAgent.mock.calls.filter((call) => call[0] === 'Regis');
      expect(regisCalls.length).toBe(0);
    });

    it('should save archive file', async () => {
      await protocol.invokeSwarm('test query', { verbose: false });

      expect(writeFileSync).toHaveBeenCalled();
    });

    it('should include tier information in result', async () => {
      const result = await protocol.invokeSwarm('test query', { verbose: false });

      expect(result.tiers).toBeDefined();
      expect(typeof result.tiers.commander).toBe('boolean');
      expect(typeof result.tiers.coordinator).toBe('boolean');
      expect(typeof result.tiers.executor).toBe('boolean');
    });
  });

  // ===========================================================================
  // quickSwarm Tests
  // ===========================================================================

  describe('quickSwarm()', () => {
    it('should be a function', () => {
      expect(typeof protocol.quickSwarm).toBe('function');
    });

    it('should call invokeSwarm with skipResearch=true', async () => {
      const { invokeAgent } = await import('../../../src/swarm/agents.js');

      await protocol.quickSwarm('test query', { verbose: false });

      // Regis (research) should not be called
      const regisCalls = invokeAgent.mock.calls.filter((call) => call[0] === 'Regis');
      expect(regisCalls.length).toBe(0);
    });

    it('should return success result', async () => {
      const result = await protocol.quickSwarm('test query', { verbose: false });

      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
    });
  });

  // ===========================================================================
  // yoloSwarm Tests
  // ===========================================================================

  describe('yoloSwarm()', () => {
    it('should be a function', () => {
      expect(typeof protocol.yoloSwarm).toBe('function');
    });

    it('should return success result', async () => {
      const result = await protocol.yoloSwarm('test query', { verbose: false });

      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
    });

    it('should use YOLO mode settings', async () => {
      const result = await protocol.yoloSwarm('test query', { verbose: false });

      // YOLO mode is indicated in transcript
      expect(result.transcript.mode).toContain('YOLO');
    });
  });

  // ===========================================================================
  // Default Export Tests
  // ===========================================================================

  describe('Default Export', () => {
    it('should export SWARM_VERSION', () => {
      expect(protocol.default.SWARM_VERSION).toBe(protocol.SWARM_VERSION);
    });

    it('should export invokeSwarm', () => {
      expect(protocol.default.invokeSwarm).toBe(protocol.invokeSwarm);
    });

    it('should export quickSwarm', () => {
      expect(protocol.default.quickSwarm).toBe(protocol.quickSwarm);
    });

    it('should export yoloSwarm', () => {
      expect(protocol.default.yoloSwarm).toBe(protocol.yoloSwarm);
    });

    it('should export STANDARD_MODE', () => {
      expect(protocol.default.STANDARD_MODE).toBe(protocol.STANDARD_MODE);
    });

    it('should export YOLO_MODE', () => {
      expect(protocol.default.YOLO_MODE).toBe(protocol.YOLO_MODE);
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe('Error Handling', () => {
    it('should handle provider unavailability', async () => {
      const { checkProviders } = await import('../../../src/swarm/agents.js');
      checkProviders.mockResolvedValueOnce({
        allReady: false,
        partialReady: false,
        tiers: {
          commander: false,
          coordinator: false,
          executor: false,
        },
      });

      const result = await protocol.invokeSwarm('test query', { verbose: false });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No providers available');
    });

    it('should handle partial provider availability', async () => {
      const { checkProviders } = await import('../../../src/swarm/agents.js');
      checkProviders.mockResolvedValueOnce({
        allReady: false,
        partialReady: true,
        tiers: {
          commander: false,
          coordinator: false,
          executor: true,
        },
      });

      const result = await protocol.invokeSwarm('test query', { verbose: false });

      // Should still succeed with partial availability
      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // Mode Settings Tests
  // ===========================================================================

  describe('Mode Settings Comparison', () => {
    it('YOLO mode should be faster but less safe', () => {
      // YOLO has higher concurrency
      expect(protocol.YOLO_MODE.maxConcurrency).toBeGreaterThan(
        protocol.STANDARD_MODE.maxConcurrency,
      );

      // YOLO has no safety blocking
      expect(protocol.YOLO_MODE.safetyBlocking).toBe(false);
      expect(protocol.STANDARD_MODE.safetyBlocking).toBe(true);

      // YOLO has shorter timeouts
      expect(protocol.YOLO_MODE.timeoutSeconds).toBeLessThan(protocol.STANDARD_MODE.timeoutSeconds);

      // YOLO has fewer retries
      expect(protocol.YOLO_MODE.retryAttempts).toBeLessThan(protocol.STANDARD_MODE.retryAttempts);
    });
  });
});
