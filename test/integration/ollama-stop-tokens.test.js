/**
 * Integration Test: Ollama Stop Token Post-Processing
 * Tests the manual stop token enforcement in _normalizeResult()
 */

import { describe, it, expect } from 'vitest';
import { LlamaCppBridge } from '../../src/hydra/providers/llamacpp-bridge.js';

describe('Ollama Stop Token Post-Processing', () => {
  const bridge = new LlamaCppBridge();

  it('should manually cut response at <|end|> token', () => {
    const mockResult = {
      response: 'This is a valid response<|end|>This should be removed',
      model: 'qwen3:4b',
      eval_count: 50,
      total_duration: 1000000000
    };

    const normalized = bridge._normalizeResult(mockResult, 'generate');

    expect(normalized.content).toBe('This is a valid response');
    expect(normalized.content).not.toContain('<|end|>');
    expect(normalized.content).not.toContain('This should be removed');
  });

  it('should cut at <|user|> token', () => {
    const mockResult = {
      response: 'Agent response here<|user|>New user prompt',
      model: 'qwen3:4b',
      eval_count: 30,
      total_duration: 800000000
    };

    const normalized = bridge._normalizeResult(mockResult, 'generate');

    expect(normalized.content).toBe('Agent response here');
    expect(normalized.content).not.toContain('<|user|>');
  });

  it('should cut at <|system|> token', () => {
    const mockResult = {
      response: 'Valid output<|system|>Attempting to inject system prompt',
      model: 'qwen3:4b',
      eval_count: 40,
      total_duration: 900000000
    };

    const normalized = bridge._normalizeResult(mockResult, 'generate');

    expect(normalized.content).toBe('Valid output');
    expect(normalized.content).not.toContain('<|system|>');
  });

  it('should cut at old format ### System token', () => {
    const mockResult = {
      response: 'Response content### System\nRepeating system prompt',
      model: 'qwen3:4b',
      eval_count: 35,
      total_duration: 850000000
    };

    const normalized = bridge._normalizeResult(mockResult, 'generate');

    expect(normalized.content).toBe('Response content');
    expect(normalized.content).not.toContain('### System');
  });

  it('should handle response with NO stop tokens (pass through)', () => {
    const mockResult = {
      response: 'Clean response without any stop tokens',
      model: 'qwen3:4b',
      eval_count: 25,
      total_duration: 750000000
    };

    const normalized = bridge._normalizeResult(mockResult, 'generate');

    expect(normalized.content).toBe('Clean response without any stop tokens');
  });

  it('should use first stop token when multiple exist', () => {
    const mockResult = {
      response: 'Start<|end|>Middle<|user|>End',
      model: 'qwen3:4b',
      eval_count: 20,
      total_duration: 700000000
    };

    const normalized = bridge._normalizeResult(mockResult, 'generate');

    expect(normalized.content).toBe('Start');
    expect(normalized.content).not.toContain('Middle');
    expect(normalized.content).not.toContain('End');
  });

  it('should trim whitespace after cutting', () => {
    const mockResult = {
      response: 'Response with trailing spaces   <|end|>Extra content',
      model: 'qwen3:4b',
      eval_count: 30,
      total_duration: 800000000
    };

    const normalized = bridge._normalizeResult(mockResult, 'generate');

    expect(normalized.content).toBe('Response with trailing spaces');
    expect(normalized.content).not.toMatch(/\s+$/); // No trailing whitespace
  });

  it('should prevent hallucination loop repetition', () => {
    const mockResult = {
      response: `Jestem zrozumiały: Pipeline<|end|>
Jestem zrozumiały: Pipeline<|end|>
Jestem zrozumiały: Pipeline`,
      model: 'qwen3:4b',
      eval_count: 100,
      total_duration: 2000000000
    };

    const normalized = bridge._normalizeResult(mockResult, 'generate');

    expect(normalized.content).toBe('Jestem zrozumiały: Pipeline');
    // Should NOT contain the second repetition
    const repetitionCount = (normalized.content.match(/Jestem zrozumiały/g) || []).length;
    expect(repetitionCount).toBe(1);
  });
});
