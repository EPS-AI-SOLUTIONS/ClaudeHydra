/**
 * QueryProcessor Tests
 * @module test/unit/cli-unified/processing/QueryProcessor.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create mock bridge that will be shared across all tests
const mockBridge = {
  generate: vi.fn(),
  generateFast: vi.fn(),
  info: vi.fn()
};

// Mock the bridge before importing QueryProcessor
vi.mock('../../../../src/hydra/providers/llamacpp-bridge.js', () => ({
  getLlamaCppBridge: vi.fn(() => mockBridge)
}));

// Mock llamacpp-models for agent maxTokens resolution
vi.mock('../../../../src/hydra/providers/llamacpp-models.js', () => ({
  getModelForAgent: vi.fn((name) => {
    const configs = {
      Geralt: { model: 'qwen3:4b', maxTokens: 2048 },
      Triss: { model: 'qwen3:4b', maxTokens: 4096 },
      Ciri: { model: 'qwen3:1.7b', maxTokens: 512 },
    };
    return configs[name] || null;
  })
}));

describe('QueryProcessor', () => {
  let QueryProcessor;
  let createQueryProcessor;

  beforeEach(async () => {
    // Clear mock calls but keep implementations
    vi.clearAllMocks();

    // Reset mock implementations to defaults
    mockBridge.generate.mockReset();
    mockBridge.generateFast.mockReset();
    mockBridge.info.mockReset();

    // Import QueryProcessor (mocks are already applied)
    const module = await import('../../../../src/cli-unified/processing/QueryProcessor.js');
    QueryProcessor = module.QueryProcessor;
    createQueryProcessor = module.createQueryProcessor;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should create instance with default options', () => {
      const processor = new QueryProcessor();

      expect(processor.llamacppEnabled).toBe(true);
      expect(processor.defaultModel).toBe('main');
      expect(processor.streaming).toBe(true);
      expect(processor.timeout).toBe(300000);
      expect(processor.concurrency).toBe(1);
    });

    it('should accept custom options', () => {
      const processor = new QueryProcessor({
        llamacppEnabled: false,
        defaultModel: 'draft',
        streaming: false,
        timeout: 30000,
        concurrency: 3
      });

      expect(processor.llamacppEnabled).toBe(false);
      expect(processor.defaultModel).toBe('draft');
      expect(processor.streaming).toBe(false);
      expect(processor.timeout).toBe(30000);
      expect(processor.concurrency).toBe(3);
    });

    it('should initialize with empty queue', () => {
      const processor = new QueryProcessor();

      expect(processor.queue).toEqual([]);
      expect(processor.processing).toBe(false);
      expect(processor.activeRequests).toBe(0);
    });

    it('should have error handler to prevent unhandled rejections', () => {
      const processor = new QueryProcessor();

      // Should not throw when emitting error
      expect(() => processor.emit('error', new Error('Test'))).not.toThrow();
    });
  });

  describe('process', () => {
    let processor;

    beforeEach(() => {
      processor = new QueryProcessor();
      // process() without onToken uses executeQuery which calls bridge.generate
      mockBridge.generate.mockResolvedValue({
        success: true,
        content: 'Response'
      });
    });

    it('should return cached response if available', async () => {
      const mockCache = {
        isEnabled: true,
        get: vi.fn().mockReturnValue('Cached response'),
        set: vi.fn()
      };
      processor.cacheManager = mockCache;

      const result = await processor.process('Test prompt');

      expect(result.response).toBe('Cached response');
      expect(result.cached).toBe(true);
      expect(mockBridge.generate).not.toHaveBeenCalled();
    });

    it('should skip cache when noCache option is true', async () => {
      const mockCache = {
        isEnabled: true,
        get: vi.fn().mockReturnValue('Cached response'),
        set: vi.fn()
      };
      processor.cacheManager = mockCache;
      mockBridge.generate.mockResolvedValue({
        success: true,
        content: 'Fresh response'
      });

      const result = await processor.process('Test prompt', { noCache: true });

      expect(mockCache.get).not.toHaveBeenCalled();
      expect(result.cached).toBe(false);
    });

    it('should add context to prompt when context manager has content', async () => {
      const mockContext = {
        isEmpty: false,
        getContextString: vi.fn().mockReturnValue('Some context')
      };
      processor.contextManager = mockContext;
      mockBridge.generate.mockResolvedValue({
        success: true,
        content: 'Response'
      });

      await processor.process('Test prompt');

      expect(mockContext.getContextString).toHaveBeenCalled();
    });

    it('should select agent when autoAgent is not disabled', async () => {
      const mockRouter = {
        select: vi.fn().mockReturnValue({
          name: 'Geralt',
          model: 'main',
          temperature: 0.5
        }),
        buildPrompt: vi.fn().mockReturnValue('Agent prompt'),
        recordExecution: vi.fn()
      };
      processor.agentRouter = mockRouter;
      mockBridge.generate.mockResolvedValue({
        success: true,
        content: 'Response'
      });

      await processor.process('Test prompt');

      expect(mockRouter.select).toHaveBeenCalled();
    });

    it('should emit complete event on success', async () => {
      mockBridge.generate.mockResolvedValue({
        success: true,
        content: 'Response'
      });

      const completeSpy = vi.fn();
      processor.on('complete', completeSpy);

      await processor.process('Test prompt');

      expect(completeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Test prompt',
          response: 'Response'
        })
      );
    });

    it('should emit error event on failure', async () => {
      const error = new Error('Generation failed');
      mockBridge.generate.mockRejectedValue(error);

      const errorSpy = vi.fn();
      processor.on('error', errorSpy);

      await expect(processor.process('Test prompt')).rejects.toThrow('Generation failed');
      expect(errorSpy).toHaveBeenCalled();
    });

    it('should propagate agent maxTokens from EXECUTOR_AGENT_MODELS', async () => {
      const mockRouter = {
        select: vi.fn().mockReturnValue({
          name: 'Triss',
          model: 'qwen3:4b',
          temperature: 0.5
        }),
        buildPrompt: vi.fn((agent, prompt) => `wrapped: ${prompt}`),
        recordExecution: vi.fn()
      };
      processor.agentRouter = mockRouter;
      mockBridge.generate.mockResolvedValue({ success: true, content: 'Response' });

      await processor.process('Test prompt');

      // Triss has maxTokens: 4096 in EXECUTOR_AGENT_MODELS
      expect(mockBridge.generate).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ maxTokens: 4096 })
      );
    });

    it('should use 1024 default maxTokens when agent has no config', async () => {
      const mockRouter = {
        select: vi.fn().mockReturnValue({
          name: 'UnknownAgent',
          model: 'qwen3:4b',
          temperature: 0.5
        }),
        buildPrompt: vi.fn((agent, prompt) => `wrapped: ${prompt}`),
        recordExecution: vi.fn()
      };
      processor.agentRouter = mockRouter;
      mockBridge.generate.mockResolvedValue({ success: true, content: 'Response' });

      await processor.process('Test prompt');

      expect(mockBridge.generate).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ maxTokens: 1024 })
      );
    });

    it('should cache response after successful generation', async () => {
      const mockCache = {
        isEnabled: true,
        get: vi.fn().mockReturnValue(null),
        set: vi.fn()
      };
      processor.cacheManager = mockCache;
      mockBridge.generate.mockResolvedValue({
        success: true,
        content: 'Response'
      });

      await processor.process('Test prompt');

      expect(mockCache.set).toHaveBeenCalledWith(
        'Test prompt',
        'Response',
        expect.any(Object)
      );
    });
  });

  describe('executeQuery', () => {
    let processor;

    beforeEach(() => {
      processor = new QueryProcessor();
    });

    it('should call bridge.generate with correct options', async () => {
      mockBridge.generate.mockResolvedValue({
        success: true,
        content: 'Generated content'
      });

      const result = await processor.executeQuery('Test prompt', {
        maxTokens: 1024,
        temperature: 0.5
      });

      expect(mockBridge.generate).toHaveBeenCalledWith('Test prompt', expect.objectContaining({
        maxTokens: 1024,
        temperature: 0.5,
        stop: expect.any(Array)
      }));
      expect(result).toBe('Generated content');
    });

    it('should use default options when not provided', async () => {
      mockBridge.generate.mockResolvedValue({
        success: true,
        content: 'Content'
      });

      await processor.executeQuery('Test prompt');

      expect(mockBridge.generate).toHaveBeenCalledWith('Test prompt', expect.objectContaining({
        maxTokens: 1024,
        temperature: 0.7,
        stop: expect.any(Array)
      }));
    });

    it('should throw error when generation fails', async () => {
      mockBridge.generate.mockResolvedValue({
        success: false,
        error: 'Generation error'
      });

      await expect(processor.executeQuery('Test')).rejects.toThrow('Generation error');
    });

    it('should provide user-friendly error for MCP invoker not set', async () => {
      mockBridge.generate.mockRejectedValue(
        new Error('MCP invoker not set. Call setMcpInvoker() first.')
      );

      await expect(processor.executeQuery('Test')).rejects.toThrow(
        'AI not available. Ensure llama-cpp MCP server is running and configured.'
      );
    });
  });

  describe('streamQuery', () => {
    let processor;

    beforeEach(() => {
      processor = new QueryProcessor();
    });

    it('should call bridge.generate with stop tokens', async () => {
      mockBridge.generate.mockResolvedValue({
        success: true,
        content: 'Streamed content'
      });

      const result = await processor.streamQuery('Test prompt');

      expect(mockBridge.generate).toHaveBeenCalledWith('Test prompt', expect.objectContaining({
        maxTokens: 1024,
        stop: expect.any(Array)
      }));
      expect(result).toBe('Streamed content');
    });

    it('should call onToken callback with line-based chunks', async () => {
      mockBridge.generate.mockResolvedValue({
        success: true,
        content: 'Hello World'
      });

      const onToken = vi.fn();
      await processor.streamQuery('Test', { onToken });

      // Line-based 80-char chunking: 'Hello World' (11 chars < 80) = single chunk
      expect(onToken).toHaveBeenCalledWith('Hello World');
      expect(onToken).toHaveBeenCalledTimes(1);
    });

    it('should handle onToken callback errors gracefully', async () => {
      mockBridge.generate.mockResolvedValue({
        success: true,
        content: 'Test content'
      });

      const onToken = vi.fn().mockImplementation(() => {
        throw new Error('Callback error');
      });

      // Should not throw
      await expect(processor.streamQuery('Test', { onToken })).resolves.toBe('Test content');
    });

    it('should provide user-friendly error for MCP invoker not set', async () => {
      mockBridge.generate.mockRejectedValue(
        new Error('MCP invoker not set. Call setMcpInvoker() first.')
      );

      await expect(processor.streamQuery('Test')).rejects.toThrow(
        'AI not available. Ensure llama-cpp MCP server is running and configured.'
      );
    });
  });

  describe('enqueue', () => {
    let processor;

    beforeEach(() => {
      processor = new QueryProcessor();
      // enqueue calls process which calls executeQuery -> bridge.generate
      mockBridge.generate.mockResolvedValue({
        success: true,
        content: 'Response'
      });
    });

    it('should add query to queue and process it', async () => {
      const result = await processor.enqueue('Test prompt');

      expect(result.response).toBe('Response');
    });

    it('should process multiple queries in order', async () => {
      const results = await Promise.all([
        processor.enqueue('Query 1'),
        processor.enqueue('Query 2')
      ]);

      expect(results).toHaveLength(2);
    });
  });

  describe('processParallel', () => {
    let processor;

    beforeEach(() => {
      processor = new QueryProcessor({ concurrency: 2 });
      // processParallel calls process which calls executeQuery -> bridge.generate
      mockBridge.generate.mockResolvedValue({
        success: true,
        content: 'Response'
      });
    });

    it('should process multiple queries in parallel', async () => {
      const queries = [
        { prompt: 'Query 1' },
        { prompt: 'Query 2' },
        { prompt: 'Query 3' }
      ];

      const { results, errors } = await processor.processParallel(queries);

      expect(results).toHaveLength(3);
      expect(errors).toHaveLength(0);
    });

    it('should collect errors without stopping', async () => {
      mockBridge.generate
        .mockResolvedValueOnce({ success: true, content: 'OK' })
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({ success: true, content: 'OK' });

      const queries = [
        { prompt: 'Query 1' },
        { prompt: 'Query 2' },
        { prompt: 'Query 3' }
      ];

      const { results, errors } = await processor.processParallel(queries);

      expect(errors).toHaveLength(1);
      expect(errors[0].error.message).toBe('Failed');
    });
  });

  describe('checkHealth', () => {
    let processor;

    beforeEach(() => {
      processor = new QueryProcessor();
    });

    it('should return healthy status when bridge info succeeds', async () => {
      mockBridge.info.mockResolvedValue({
        success: true,
        availableModels: ['main', 'draft']
      });

      const health = await processor.checkHealth();

      expect(health.healthy).toBe(true);
      expect(health.models).toContain('main');
    });

    it('should return unhealthy status when bridge fails', async () => {
      mockBridge.info.mockRejectedValue(new Error('Connection failed'));

      const health = await processor.checkHealth();

      expect(health.healthy).toBe(false);
      expect(health.error).toBe('Connection failed');
    });
  });

  describe('Component setters', () => {
    let processor;

    beforeEach(() => {
      processor = new QueryProcessor();
    });

    it('setAgentRouter should set agent router', () => {
      const mockRouter = { select: vi.fn() };
      processor.setAgentRouter(mockRouter);

      expect(processor.agentRouter).toBe(mockRouter);
    });

    it('setCacheManager should set cache manager', () => {
      const mockCache = { get: vi.fn() };
      processor.setCacheManager(mockCache);

      expect(processor.cacheManager).toBe(mockCache);
    });

    it('setContextManager should set context manager', () => {
      const mockContext = { isEmpty: true };
      processor.setContextManager(mockContext);

      expect(processor.contextManager).toBe(mockContext);
    });
  });

  describe('createQueryProcessor', () => {
    it('should create QueryProcessor instance', () => {
      const processor = createQueryProcessor({ timeout: 45000 });

      expect(processor).toBeInstanceOf(QueryProcessor);
      expect(processor.timeout).toBe(45000);
    });
  });
});
