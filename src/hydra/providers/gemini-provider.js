/**
 * Gemini Provider - Refactored implementation using BaseProvider
 * CLI-based provider with connection pooling, retry logic, and health caching
 */

import { spawn } from 'child_process';
import { platform } from 'os';
import { existsSync } from 'fs';

import { BaseProvider } from '../core/interfaces.js';
import { withRetry, CircuitBreaker } from '../core/retry.js';
import { ManagedPool } from '../core/pool.js';
import { HealthCheckCache } from '../core/cache.js';
import { GeminiError, TimeoutError, normalizeError } from '../core/errors.js';
import { getConfigManager } from '../core/config.js';
import { getStatsCollector } from '../core/stats.js';

const IS_WINDOWS = platform() === 'win32';

/**
 * Find Gemini CLI path
 * @returns {string}
 */
function findGeminiPath() {
  if (IS_WINDOWS) {
    const userProfile = process.env.USERPROFILE || '';
    const appData = process.env.APPDATA || '';

    const candidates = [
      `${userProfile}\\AppData\\Roaming\\npm\\gemini.cmd`,
      `${appData}\\npm\\gemini.cmd`,
      'gemini.cmd',
      'gemini'
    ];

    for (const path of candidates) {
      try {
        if (existsSync(path)) {
          return path;
        }
      } catch { /* continue */ }
    }
  }

  return 'gemini';
}

/**
 * Gemini Provider class
 */
export class GeminiProvider extends BaseProvider {
  /**
   * @param {Object} config - Provider configuration
   */
  constructor(config = {}) {
    // Get config from manager or use provided
    const configManager = getConfigManager();
    const geminiConfig = configManager.getValue('providers.gemini', {});
    const mergedConfig = { ...geminiConfig, ...config };

    super('gemini', mergedConfig);

    this.cliPath = mergedConfig.cliPath || findGeminiPath();
    this.defaultModel = mergedConfig.defaultModel || 'gemini-2.0-flash-exp';
    this.costPerToken = mergedConfig.costPerToken || 0.000001;
    this.fixedCost = mergedConfig.fixedCost || 0.001;

    // Initialize connection pool (limit concurrent CLI processes)
    this.pool = new ManagedPool(
      mergedConfig.pool || { maxConcurrent: 3, maxQueueSize: 50 },
      mergedConfig.rateLimit || { enabled: true, tokensPerInterval: 5, interval: 1000 }
    );

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: mergedConfig.circuitBreaker?.failureThreshold || 3,
      successThreshold: mergedConfig.circuitBreaker?.successThreshold || 2,
      timeout: mergedConfig.circuitBreaker?.timeout || 60000
    });

    // Initialize health check cache
    this.healthCache = new HealthCheckCache({
      ttl: 60000,  // Longer TTL for CLI-based provider
      staleTTL: 120000,
      autoRefresh: true
    });
    this.healthCache.register('gemini', () => this._performHealthCheck());

    // Retry configuration
    this.retryConfig = {
      maxRetries: mergedConfig.maxRetries || 3,
      baseDelay: 2000,  // Longer base delay for cloud API
      maxDelay: 30000,
      backoffMultiplier: 2
    };

    // Stats collector
    this.stats = getStatsCollector();
  }

  /**
   * Generate completion with all enhancements
   * @param {string} prompt
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async generate(prompt, options = {}) {
    const {
      model = this.defaultModel,
      timeout = this.config.timeout || 120000
    } = options;

    const startTime = Date.now();

    try {
      // Execute through circuit breaker, pool, and retry
      const result = await this.circuitBreaker.execute(async () => {
        return this.pool.execute(async () => {
          return withRetry(
            () => this._doGenerate(prompt, { model, timeout }),
            {
              ...this.retryConfig,
              onRetry: ({ attempt, error, delay }) => {
                console.warn(`[Gemini] Retry ${attempt}/${this.retryConfig.maxRetries}: ${error.message}. Waiting ${delay}ms`);
              }
            }
          );
        });
      });

      // Estimate tokens and cost
      const estimatedTokens = Math.ceil(prompt.length / 4) + Math.ceil((result.content?.length || 0) / 4);
      const cost = this.fixedCost + (estimatedTokens * this.costPerToken);

      // Update stats
      this._updateStats({ ...result, tokens: estimatedTokens }, true);
      this.stats.recordRequest({
        provider: 'gemini',
        category: 'generate',
        latency: result.duration_ms,
        tokens: estimatedTokens,
        cost,
        success: true
      });

      return {
        ...result,
        tokens: estimatedTokens,
        cost
      };

    } catch (error) {
      const hydraError = this._handleError(error);
      this._updateStats({ error: hydraError.message }, false);
      this.stats.recordRequest({
        provider: 'gemini',
        category: 'generate',
        latency: Date.now() - startTime,
        success: false,
        error: { type: hydraError.code }
      });
      throw hydraError;
    }
  }

  /**
   * Perform actual generation via CLI
   * @private
   */
  async _doGenerate(prompt, options) {
    const { model, timeout } = options;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const args = [];
      if (model) {
        args.push('-m', model);
      }
      args.push('-o', 'json');
      args.push(prompt);

      // On Windows with shell=true, args must be escaped to avoid deprecation warning
      // Use shell with command string instead of args array
      const spawnOptions = {
        windowsHide: true,
        env: { ...process.env }
      };

      let proc;
      if (IS_WINDOWS) {
        // Build command string for shell execution on Windows
        const escapedArgs = args.map(arg =>
          arg.includes(' ') || arg.includes('"') ? `"${arg.replace(/"/g, '\\"')}"` : arg
        );
        const command = `"${this.cliPath}" ${escapedArgs.join(' ')}`;
        proc = spawn(command, [], { ...spawnOptions, shell: true });
      } else {
        proc = spawn(this.cliPath, args, spawnOptions);
      }

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        const duration_ms = Date.now() - startTime;

        if (code === 0) {
          const content = this._parseOutput(stdout);
          resolve({ content, duration_ms, success: true, model });
        } else {
          reject(new GeminiError(`CLI exit code ${code}: ${stderr || stdout}`, {
            code: `GEMINI_EXIT_${code}`,
            context: { exitCode: code, stderr, stdout }
          }));
        }
      });

      proc.on('error', (err) => {
        reject(new GeminiError(`Failed to start Gemini CLI: ${err.message}`, {
          code: 'GEMINI_SPAWN_ERROR',
          cause: err
        }));
      });

      // Timeout handling
      const timeoutId = setTimeout(() => {
        proc.kill();
        reject(new TimeoutError('gemini_generate', timeout));
      }, timeout);

      proc.on('close', () => clearTimeout(timeoutId));
    });
  }

  /**
   * Parse CLI output
   * @private
   */
  _parseOutput(stdout) {
    try {
      // Filter out warnings before JSON
      const lines = stdout.split('\n');
      const jsonStart = lines.findIndex(l => l.trim().startsWith('{') || l.trim().startsWith('['));

      if (jsonStart >= 0) {
        const jsonStr = lines.slice(jsonStart).join('\n');
        const data = JSON.parse(jsonStr);
        return data.response || data.content || data.text || JSON.stringify(data, null, 2);
      }
    } catch { /* ignore parsing errors */ }

    // Fallback: filter warnings and return raw output
    return stdout
      .split('\n')
      .filter(line => !line.includes('GOOGLE_API_KEY') && !line.includes('GEMINI_API_KEY'))
      .join('\n')
      .trim();
  }

  /**
   * Stream generation
   * @param {string} prompt
   * @param {Function} onChunk
   * @param {Object} options
   */
  async streamGenerate(prompt, onChunk, options = {}) {
    const { model } = options;

    const args = [];
    if (model) {
      args.push('-m', model);
    }
    args.push(prompt);

    return new Promise((resolve, reject) => {
      let proc;
      if (IS_WINDOWS) {
        const escapedArgs = args.map(arg =>
          arg.includes(' ') || arg.includes('"') ? `"${arg.replace(/"/g, '\\"')}"` : arg
        );
        const command = `"${this.cliPath}" ${escapedArgs.join(' ')}`;
        proc = spawn(command, [], { shell: true, windowsHide: true });
      } else {
        proc = spawn(this.cliPath, args, { windowsHide: true });
      }

      let fullContent = '';

      proc.stdout.on('data', (data) => {
        const chunk = data.toString();
        // Filter API key warnings
        if (!chunk.includes('GOOGLE_API_KEY') && !chunk.includes('GEMINI_API_KEY')) {
          fullContent += chunk;
          if (onChunk) onChunk(chunk);
        }
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ content: fullContent.trim(), success: true });
        } else {
          reject(new GeminiError(`Stream error (exit code ${code})`));
        }
      });

      proc.on('error', reject);
    });
  }

  /**
   * Health check with caching
   * @param {boolean} forceRefresh
   * @returns {Promise<Object>}
   */
  async healthCheck(forceRefresh = false) {
    return this.healthCache.get('gemini', forceRefresh);
  }

  /**
   * Perform actual health check
   * @private
   */
  async _performHealthCheck() {
    return new Promise((resolve) => {
      let proc;
      if (IS_WINDOWS) {
        const command = `"${this.cliPath}" --version`;
        proc = spawn(command, [], { shell: true, windowsHide: true });
      } else {
        proc = spawn(this.cliPath, ['--version'], { windowsHide: true });
      }

      let version = '';

      proc.stdout.on('data', (data) => {
        version += data.toString();
      });

      proc.on('close', (code) => {
        resolve({
          available: code === 0,
          version: version.trim(),
          path: this.cliPath
        });
      });

      proc.on('error', () => {
        resolve({ available: false, version: '', path: this.cliPath });
      });

      setTimeout(() => {
        proc.kill();
        resolve({ available: false, version: '', path: this.cliPath, timeout: true });
      }, 10000);
    });
  }

  /**
   * Get default model
   * @returns {string}
   */
  getDefaultModel() {
    return this.defaultModel;
  }

  /**
   * Get cost per token
   * @returns {number}
   */
  getCostPerToken() {
    return this.costPerToken;
  }

  /**
   * Estimate cost for a prompt
   * @param {string} prompt
   * @param {number} expectedOutputTokens
   * @returns {number}
   */
  estimateCost(prompt, expectedOutputTokens = 500) {
    const inputTokens = Math.ceil(prompt.length / 4);
    return this.fixedCost + ((inputTokens + expectedOutputTokens) * this.costPerToken);
  }

  /**
   * Handle and normalize errors
   * @param {Error} error
   * @returns {HydraError}
   */
  _handleError(error) {
    if (error instanceof TimeoutError) {
      return error;
    }

    if (error instanceof GeminiError) {
      return error;
    }

    // Check for rate limiting
    if (error.message && (
      error.message.includes('rate limit') ||
      error.message.includes('429') ||
      error.message.includes('quota')
    )) {
      return new GeminiError('Rate limit exceeded', {
        code: 'GEMINI_RATE_LIMIT',
        retryable: true,
        cause: error
      });
    }

    return normalizeError(error, 'GEMINI_ERROR');
  }

  /**
   * Get pool status
   * @returns {Object}
   */
  getPoolStatus() {
    return this.pool.getStatus();
  }

  /**
   * Get circuit breaker status
   * @returns {Object}
   */
  getCircuitStatus() {
    return this.circuitBreaker.getState();
  }

  /**
   * Get combined provider status
   * @returns {Object}
   */
  getStatus() {
    return {
      name: this.name,
      cliPath: this.cliPath,
      defaultModel: this.defaultModel,
      pool: this.getPoolStatus(),
      circuit: this.getCircuitStatus(),
      stats: this.getStats()
    };
  }
}

// Singleton instance
let _geminiProvider = null;

/**
 * Get or create Gemini provider singleton
 * @param {Object} config
 * @returns {GeminiProvider}
 */
export function getGeminiProvider(config = {}) {
  if (!_geminiProvider) {
    _geminiProvider = new GeminiProvider(config);
  }
  return _geminiProvider;
}

/**
 * Reset provider singleton (for testing)
 */
export function resetGeminiProvider() {
  _geminiProvider = null;
}
