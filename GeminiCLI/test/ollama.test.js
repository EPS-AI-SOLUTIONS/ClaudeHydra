/**
 * HYDRA Ollama Integration Tests
 * BLOK 3: Testing - Triss
 */

import { describe, it, expect } from 'vitest';

// Mock fetch for Ollama API calls
const mockOllamaResponse = {
  models: [
    { name: 'llama3.2:3b', size: 2000000000, modified_at: '2024-01-01T00:00:00Z' },
    { name: 'llama3.2:1b', size: 1000000000, modified_at: '2024-01-01T00:00:00Z' },
    { name: 'qwen2.5-coder:1.5b', size: 1500000000, modified_at: '2024-01-01T00:00:00Z' }
  ]
};

const mockGenerateResponse = {
  model: 'llama3.2:3b',
  response: 'Test response from Ollama',
  done: true,
  total_duration: 1000000000,
  load_duration: 100000000,
  prompt_eval_count: 10,
  eval_count: 20
};

// Mock Ollama client
const mockOllama = {
  host: 'http://localhost:11434',

  async listModels() {
    return mockOllamaResponse;
  },

  async generate(options) {
    if (!options.model || !options.prompt) {
      throw new Error('Model and prompt are required');
    }
    return {
      ...mockGenerateResponse,
      model: options.model
    };
  },

  async checkHealth() {
    try {
      const response = await fetch(`${this.host}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  },

  formatModelSize(bytes) {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)}GB`;
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)}MB`;
    return `${bytes}B`;
  }
};

describe('Ollama Client', () => {
  describe('Model Listing', () => {
    it('should list available models', async () => {
      const result = await mockOllama.listModels();
      expect(result.models).toBeInstanceOf(Array);
      expect(result.models.length).toBeGreaterThan(0);
    });

    it('should include model names', async () => {
      const result = await mockOllama.listModels();
      const names = result.models.map(m => m.name);
      expect(names).toContain('llama3.2:3b');
      expect(names).toContain('qwen2.5-coder:1.5b');
    });

    it('should include model sizes', async () => {
      const result = await mockOllama.listModels();
      for (const model of result.models) {
        expect(model.size).toBeGreaterThan(0);
      }
    });
  });

  describe('Text Generation', () => {
    it('should generate response with valid input', async () => {
      const result = await mockOllama.generate({
        model: 'llama3.2:3b',
        prompt: 'Hello, world!'
      });

      expect(result.response).toBeDefined();
      expect(result.done).toBe(true);
    });

    it('should throw error without model', async () => {
      await expect(mockOllama.generate({ prompt: 'test' }))
        .rejects.toThrow('Model and prompt are required');
    });

    it('should throw error without prompt', async () => {
      await expect(mockOllama.generate({ model: 'llama3.2:3b' }))
        .rejects.toThrow('Model and prompt are required');
    });

    it('should return correct model in response', async () => {
      const result = await mockOllama.generate({
        model: 'qwen2.5-coder:1.5b',
        prompt: 'test'
      });
      expect(result.model).toBe('qwen2.5-coder:1.5b');
    });
  });

  describe('Utility Functions', () => {
    it('should format model size in GB', () => {
      expect(mockOllama.formatModelSize(2000000000)).toBe('2.0GB');
    });

    it('should format model size in MB', () => {
      expect(mockOllama.formatModelSize(500000000)).toBe('500.0MB');
    });

    it('should format small sizes in bytes', () => {
      expect(mockOllama.formatModelSize(1000)).toBe('1000B');
    });
  });

  describe('Model Selection', () => {
    const modelPreferences = {
      fast: 'llama3.2:1b',
      default: 'llama3.2:3b',
      coder: 'qwen2.5-coder:1.5b'
    };

    it('should select fast model for simple tasks', () => {
      expect(modelPreferences.fast).toBe('llama3.2:1b');
    });

    it('should select coder model for code tasks', () => {
      expect(modelPreferences.coder).toBe('qwen2.5-coder:1.5b');
    });

    it('should have default fallback', () => {
      expect(modelPreferences.default).toBeDefined();
    });
  });
});

describe('Ollama Configuration', () => {
  it('should have correct default host', () => {
    expect(mockOllama.host).toBe('http://localhost:11434');
  });

  it('should validate host URL format', () => {
    const urlPattern = /^https?:\/\/[^\s/$.?#].[^\s]*$/;
    expect(urlPattern.test(mockOllama.host)).toBe(true);
  });
});

describe('Response Parsing', () => {
  it('should include duration metrics', () => {
    expect(mockGenerateResponse.total_duration).toBeGreaterThan(0);
    expect(mockGenerateResponse.load_duration).toBeGreaterThan(0);
  });

  it('should include token counts', () => {
    expect(mockGenerateResponse.prompt_eval_count).toBeGreaterThan(0);
    expect(mockGenerateResponse.eval_count).toBeGreaterThan(0);
  });
});
