/**
 * @fileoverview GeminiProvider - Singleton provider for Gemini API
 *
 * IMPORTANT: Temperature is HARDCODED to 1.0 via gemini-client.
 * This cannot be overridden by any caller.
 *
 * @module hydra/providers/gemini-provider
 */

import * as geminiClient from './gemini-client.js';
import { GEMINI_MODELS, GEMINI_TEMPERATURE } from './gemini-models.js';

interface ModelSelection {
  model: string;
  thinkingModel: string;
  temperature: number;
}

/**
 * GeminiProvider wraps the Gemini client with model management
 * and provider-pattern interface for HydraProviderManager.
 */
export class GeminiProvider {
  private _modelsReady = false;
  private _availableModels: string[] = [];
  private _bestModel: string = GEMINI_MODELS.flash;
  private _thinkingModel: string = GEMINI_MODELS.thinking;
  private _healthy = false;

  /**
   * Generate text. Temperature is always 1.0.
   */
  async generate(prompt: string, options: Record<string, unknown> = {}) {
    this._stats.totalRequests++;
    try {
      const result = await geminiClient.generate(prompt, {
        ...options,
        temperature: GEMINI_TEMPERATURE,
      });
      this._stats.successfulRequests++;
      if (result.tokens) this._stats.totalTokens += result.tokens;
      return result;
    } catch (error) {
      this._stats.failedRequests++;
      throw error;
    }
  }

  /**
   * Generate with thinking model. Temperature is always 1.0.
   */
  async generateWithThinking(prompt: string, options: Record<string, unknown> = {}) {
    this._stats.totalRequests++;
    try {
      const result = await geminiClient.generateWithThinking(prompt, {
        ...options,
        temperature: GEMINI_TEMPERATURE,
      });
      this._stats.successfulRequests++;
      if (result.tokens) this._stats.totalTokens += result.tokens;
      return result;
    } catch (error) {
      this._stats.failedRequests++;
      throw error;
    }
  }

  /**
   * Wait for model discovery to complete.
   */
  async waitForModelsReady(timeout = 10_000): Promise<void> {
    // Try a quick API call to verify connectivity
    try {
      const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
      if (!apiKey) {
        console.warn('[GeminiProvider] No API key — skipping model discovery');
        return;
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, { signal: controller.signal });
        if (response.ok) {
          const data = await response.json();
          this._availableModels = (data.models || [])
            .filter((m: { name?: string }) => m.name?.includes('gemini'))
            .map((m: { name: string }) => m.name.replace('models/', ''));
          this._modelsReady = true;
          this._healthy = true;

          // Select best model
          if (this._availableModels.includes(GEMINI_MODELS.flash)) {
            this._bestModel = GEMINI_MODELS.flash;
          } else if (this._availableModels.length > 0) {
            this._bestModel = this._availableModels[0];
          }

          // Select thinking model
          if (this._availableModels.includes(GEMINI_MODELS.thinking)) {
            this._thinkingModel = GEMINI_MODELS.thinking;
          }
        }
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error: unknown) {
      console.warn(
        '[GeminiProvider] Model discovery failed:',
        error instanceof Error ? error.message : error,
      );
    }
  }

  isModelsReady(): boolean {
    return this._modelsReady;
  }

  getAvailableModels(): string[] {
    return this._availableModels;
  }

  getBestModel(): string {
    return this._bestModel;
  }

  getThinkingModel(): string {
    return this._thinkingModel;
  }

  getModelSelection(): ModelSelection {
    return {
      model: this._bestModel,
      thinkingModel: this._thinkingModel,
      // Always 1.0
      temperature: GEMINI_TEMPERATURE,
    };
  }

  async refreshModels() {
    await this.waitForModelsReady();
    return this.getModelSelection();
  }

  getStatus() {
    return {
      healthy: this._healthy,
      modelsReady: this._modelsReady,
      modelCount: this._availableModels.length,
      bestModel: this._bestModel,
      thinkingModel: this._thinkingModel,
      temperature: GEMINI_TEMPERATURE,
    };
  }

  /**
   * Health check used by ProviderManager's HealthCheckCache.
   */
  async _performHealthCheck() {
    try {
      const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
      if (!apiKey) {
        return {
          available: false,
          models: [],
          error: 'No API key set (GOOGLE_API_KEY or GEMINI_API_KEY)',
          provider: 'gemini',
        };
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(url, { signal: controller.signal });
        const ok = response.ok;
        this._healthy = ok;

        if (ok) {
          const data = await response.json();
          const models = (data.models || [])
            .filter((m: { name?: string }) => m.name?.includes('gemini'))
            .map((m: { name: string }) => m.name.replace('models/', ''));
          this._availableModels = models;
          this._modelsReady = true;

          return {
            available: true,
            models,
            modelCount: models.length,
            provider: 'gemini',
          };
        }

        return {
          available: false,
          models: [],
          error: `HTTP ${response.status}`,
          provider: 'gemini',
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error: unknown) {
      this._healthy = false;
      return {
        available: false,
        models: [],
        error: error instanceof Error ? error.message : String(error),
        provider: 'gemini',
      };
    }
  }

  /**
   * Pool status stub — Gemini is stateless HTTP, no connection pool.
   */
  getPoolStatus() {
    return {
      active: 0,
      queued: 0,
      available: 1,
      maxConcurrent: 1,
      maxQueueSize: 0,
    };
  }

  /**
   * Circuit breaker status stub — no circuit breaker for Gemini.
   */
  getCircuitStatus() {
    return {
      state: this._healthy ? 'closed' : 'open',
      failures: 0,
      lastFailure: null,
    };
  }

  /**
   * Provider statistics.
   */
  private _stats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalTokens: 0,
  };

  getStats() {
    return { ...this._stats };
  }

  resetStats() {
    this._stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTokens: 0,
    };
  }
}

// Singleton
let _instance: GeminiProvider | null = null;

export function getGeminiProvider(): GeminiProvider {
  if (!_instance) {
    _instance = new GeminiProvider();
  }
  return _instance;
}

export function resetGeminiProvider(): void {
  _instance = null;
}
