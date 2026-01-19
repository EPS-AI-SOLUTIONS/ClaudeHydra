/**
 * HYDRA Model Registry Module
 * Model catalog, aliases, caching stats, and multi-GPU support
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { checkHealth, listModels } from '../ollama-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

/**
 * Pre-defined model catalog with metadata
 */
const MODEL_CATALOG = {
  // Llama models
  'llama3.2:1b': {
    name: 'Llama 3.2 1B',
    family: 'llama',
    params: '1B',
    context: 128000,
    description: 'Fast, lightweight model for quick tasks',
    tags: ['fast', 'small', 'chat'],
    vram: 1.5,
  },
  'llama3.2:3b': {
    name: 'Llama 3.2 3B',
    family: 'llama',
    params: '3B',
    context: 128000,
    description: 'Balanced model for general use',
    tags: ['balanced', 'chat'],
    vram: 3,
  },
  'llama3.2': {
    name: 'Llama 3.2',
    family: 'llama',
    params: '3B',
    context: 128000,
    description: 'Default Llama 3.2 model',
    tags: ['default', 'chat'],
    vram: 3,
  },
  'llama3.1:8b': {
    name: 'Llama 3.1 8B',
    family: 'llama',
    params: '8B',
    context: 128000,
    description: 'High quality general purpose model',
    tags: ['quality', 'chat', 'reasoning'],
    vram: 6,
  },
  'llama3.1:70b': {
    name: 'Llama 3.1 70B',
    family: 'llama',
    params: '70B',
    context: 128000,
    description: 'Large model for complex tasks',
    tags: ['large', 'quality', 'reasoning'],
    vram: 45,
  },

  // Mistral models
  mistral: {
    name: 'Mistral 7B',
    family: 'mistral',
    params: '7B',
    context: 32000,
    description: 'Efficient and capable 7B model',
    tags: ['efficient', 'chat'],
    vram: 5,
  },
  'mistral-nemo': {
    name: 'Mistral Nemo 12B',
    family: 'mistral',
    params: '12B',
    context: 128000,
    description: 'Long context Mistral model',
    tags: ['long-context', 'chat'],
    vram: 8,
  },

  // Coding models
  'qwen2.5-coder:1.5b': {
    name: 'Qwen 2.5 Coder 1.5B',
    family: 'qwen',
    params: '1.5B',
    context: 32000,
    description: 'Fast code completion model',
    tags: ['code', 'fast', 'completion'],
    vram: 1.5,
  },
  'qwen2.5-coder:7b': {
    name: 'Qwen 2.5 Coder 7B',
    family: 'qwen',
    params: '7B',
    context: 32000,
    description: 'High quality code model',
    tags: ['code', 'quality'],
    vram: 5,
  },
  'deepseek-coder-v2': {
    name: 'DeepSeek Coder V2',
    family: 'deepseek',
    params: '16B',
    context: 128000,
    description: 'Advanced coding model',
    tags: ['code', 'quality', 'long-context'],
    vram: 12,
  },
  codellama: {
    name: 'Code Llama 7B',
    family: 'codellama',
    params: '7B',
    context: 16000,
    description: 'Code-focused Llama model',
    tags: ['code', 'completion'],
    vram: 5,
  },

  // Gemma models
  'gemma2:2b': {
    name: 'Gemma 2 2B',
    family: 'gemma',
    params: '2B',
    context: 8000,
    description: 'Small and efficient Google model',
    tags: ['small', 'fast'],
    vram: 2,
  },
  'gemma2:9b': {
    name: 'Gemma 2 9B',
    family: 'gemma',
    params: '9B',
    context: 8000,
    description: 'Capable Google model',
    tags: ['quality', 'balanced'],
    vram: 7,
  },

  // Phi models
  'phi3:mini': {
    name: 'Phi 3 Mini',
    family: 'phi',
    params: '3.8B',
    context: 128000,
    description: 'Microsoft small language model',
    tags: ['small', 'efficient', 'long-context'],
    vram: 3,
  },
};

/**
 * Default model aliases
 */
const DEFAULT_ALIASES = {
  fast: 'llama3.2:1b',
  smart: 'llama3.2:3b',
  default: 'llama3.2',
  large: 'llama3.1:8b',
  huge: 'llama3.1:70b',
  code: 'qwen2.5-coder:7b',
  'code-fast': 'qwen2.5-coder:1.5b',
};

/**
 * Model Registry class
 */
export class ModelRegistry {
  constructor(options = {}) {
    this.dataDir = options.dataDir || join(REPO_ROOT, '.hydra-data');
    this.aliasesPath = join(this.dataDir, 'model-aliases.json');
    this.statsPath = join(this.dataDir, 'model-stats.json');
    this.aliases = { ...DEFAULT_ALIASES };
    this.stats = {};
    this.catalog = { ...MODEL_CATALOG };
    this.loadData();
  }

  /**
   * Load persisted data
   */
  loadData() {
    // Ensure data directory exists
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }

    // Load aliases
    if (existsSync(this.aliasesPath)) {
      try {
        const data = JSON.parse(readFileSync(this.aliasesPath, 'utf-8'));
        this.aliases = { ...DEFAULT_ALIASES, ...data };
      } catch {
        /* ignore */
      }
    }

    // Load stats
    if (existsSync(this.statsPath)) {
      try {
        this.stats = JSON.parse(readFileSync(this.statsPath, 'utf-8'));
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Save data
   */
  saveData() {
    try {
      writeFileSync(this.aliasesPath, JSON.stringify(this.aliases, null, 2));
      writeFileSync(this.statsPath, JSON.stringify(this.stats, null, 2));
    } catch {
      /* ignore */
    }
  }

  /**
   * Resolve model name (handle aliases)
   */
  resolve(nameOrAlias) {
    return this.aliases[nameOrAlias] || nameOrAlias;
  }

  /**
   * Set alias
   */
  setAlias(alias, modelName) {
    this.aliases[alias] = modelName;
    this.saveData();
  }

  /**
   * Remove alias
   */
  removeAlias(alias) {
    if (DEFAULT_ALIASES[alias]) {
      this.aliases[alias] = DEFAULT_ALIASES[alias];
    } else {
      delete this.aliases[alias];
    }
    this.saveData();
  }

  /**
   * Get all aliases
   */
  getAliases() {
    return { ...this.aliases };
  }

  /**
   * Get model info from catalog
   */
  getInfo(modelName) {
    const resolved = this.resolve(modelName);

    // Check catalog
    for (const [key, info] of Object.entries(this.catalog)) {
      if (resolved === key || resolved.startsWith(key)) {
        return { ...info, model: resolved };
      }
    }

    // Return basic info for unknown models
    return {
      name: resolved,
      family: 'unknown',
      model: resolved,
      tags: [],
    };
  }

  /**
   * Get available models from Ollama
   */
  async getAvailable() {
    const models = await listModels();
    return models.map((m) => ({
      ...m,
      catalog: this.catalog[m.name] || null,
    }));
  }

  /**
   * Search models by tag or name
   */
  search(query) {
    const q = query.toLowerCase();
    const results = [];

    for (const [key, info] of Object.entries(this.catalog)) {
      const nameMatch = info.name.toLowerCase().includes(q);
      const tagMatch = info.tags?.some((t) => t.includes(q));
      const familyMatch = info.family?.toLowerCase().includes(q);

      if (nameMatch || tagMatch || familyMatch) {
        results.push({ model: key, ...info });
      }
    }

    return results;
  }

  /**
   * Record model usage stats
   */
  recordUsage(modelName, metrics = {}) {
    const resolved = this.resolve(modelName);

    if (!this.stats[resolved]) {
      this.stats[resolved] = {
        totalCalls: 0,
        totalTokens: 0,
        totalDuration: 0,
        cacheHits: 0,
        cacheMisses: 0,
        errors: 0,
        firstUsed: new Date().toISOString(),
        lastUsed: null,
      };
    }

    const stat = this.stats[resolved];
    stat.totalCalls++;
    stat.totalTokens += metrics.tokens || 0;
    stat.totalDuration += metrics.duration || 0;
    stat.cacheHits += metrics.cacheHit ? 1 : 0;
    stat.cacheMisses += metrics.cacheHit === false ? 1 : 0;
    stat.errors += metrics.error ? 1 : 0;
    stat.lastUsed = new Date().toISOString();

    this.saveData();
  }

  /**
   * Get model stats
   */
  getStats(modelName) {
    const resolved = this.resolve(modelName);
    return this.stats[resolved] || null;
  }

  /**
   * Get all stats
   */
  getAllStats() {
    return { ...this.stats };
  }

  /**
   * Get cache stats summary
   */
  getCacheStats() {
    let totalHits = 0;
    let totalMisses = 0;

    for (const stat of Object.values(this.stats)) {
      totalHits += stat.cacheHits || 0;
      totalMisses += stat.cacheMisses || 0;
    }

    const total = totalHits + totalMisses;
    return {
      hits: totalHits,
      misses: totalMisses,
      total,
      hitRate: total > 0 ? ((totalHits / total) * 100).toFixed(1) : 0,
    };
  }

  /**
   * Format model list for console
   */
  formatList(models) {
    const lines = [];
    lines.push('');
    lines.push('Available Models');
    lines.push('─'.repeat(70));

    for (const model of models) {
      const info = this.catalog[model.name] || {};
      const size = model.size
        ? `${(model.size / 1024 / 1024 / 1024).toFixed(1)}GB`
        : '';
      const tags = info.tags?.join(', ') || '';

      lines.push(
        `  ${model.name.padEnd(25)} ${size.padStart(8)}  ${tags}`
      );
    }

    lines.push('─'.repeat(70));
    lines.push(`  Total: ${models.length} model(s)`);
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Format aliases for console
   */
  formatAliases() {
    const lines = [];
    lines.push('');
    lines.push('Model Aliases');
    lines.push('─'.repeat(50));

    for (const [alias, model] of Object.entries(this.aliases)) {
      const isDefault = DEFAULT_ALIASES[alias] === model;
      const marker = isDefault ? '' : '*';
      lines.push(`  ${alias.padEnd(15)} → ${model}${marker}`);
    }

    lines.push('─'.repeat(50));
    lines.push('  * = custom alias');
    lines.push('');

    return lines.join('\n');
  }
}

/**
 * GPU Detection and Management
 */
export class GPUManager {
  constructor() {
    this.gpus = [];
    this.detected = false;
  }

  /**
   * Detect available GPUs
   */
  async detect() {
    this.gpus = [];

    // Try nvidia-smi for NVIDIA GPUs
    const nvidiaGpus = await this.detectNvidia();
    this.gpus.push(...nvidiaGpus);

    // Could add AMD ROCm detection here

    this.detected = true;
    return this.gpus;
  }

  /**
   * Detect NVIDIA GPUs
   */
  async detectNvidia() {
    return new Promise((resolve) => {
      const proc = spawn('nvidia-smi', [
        '--query-gpu=index,name,memory.total,memory.free,memory.used,utilization.gpu',
        '--format=csv,noheader,nounits',
      ]);

      let stdout = '';
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          resolve([]);
          return;
        }

        const gpus = stdout
          .trim()
          .split('\n')
          .map((line) => {
            const [index, name, total, free, used, utilization] = line
              .split(',')
              .map((s) => s.trim());
            return {
              index: parseInt(index),
              name,
              vendor: 'nvidia',
              memory: {
                total: parseInt(total),
                free: parseInt(free),
                used: parseInt(used),
              },
              utilization: parseInt(utilization),
            };
          });

        resolve(gpus);
      });

      proc.on('error', () => {
        resolve([]);
      });
    });
  }

  /**
   * Get GPU by index
   */
  get(index) {
    return this.gpus[index] || null;
  }

  /**
   * Get all GPUs
   */
  getAll() {
    return [...this.gpus];
  }

  /**
   * Check if multi-GPU is available
   */
  isMultiGpu() {
    return this.gpus.length > 1;
  }

  /**
   * Get total VRAM
   */
  getTotalVram() {
    return this.gpus.reduce((sum, gpu) => sum + (gpu.memory?.total || 0), 0);
  }

  /**
   * Get free VRAM
   */
  getFreeVram() {
    return this.gpus.reduce((sum, gpu) => sum + (gpu.memory?.free || 0), 0);
  }

  /**
   * Check if model can fit in VRAM
   */
  canFitModel(modelInfo) {
    const requiredVram = (modelInfo.vram || 0) * 1024; // Convert GB to MB
    const freeVram = this.getFreeVram();
    return freeVram >= requiredVram;
  }

  /**
   * Format GPU info for console
   */
  formatInfo() {
    if (this.gpus.length === 0) {
      return 'No GPUs detected';
    }

    const lines = [];
    lines.push('');
    lines.push('GPU Information');
    lines.push('─'.repeat(60));

    for (const gpu of this.gpus) {
      const memPercent = Math.round(
        (gpu.memory.used / gpu.memory.total) * 100
      );
      const memBar = this.createBar(memPercent, 20);

      lines.push(`  GPU ${gpu.index}: ${gpu.name}`);
      lines.push(
        `    Memory: ${gpu.memory.used}MB / ${gpu.memory.total}MB ${memBar} ${memPercent}%`
      );
      lines.push(`    Utilization: ${gpu.utilization}%`);
      lines.push('');
    }

    lines.push('─'.repeat(60));
    lines.push(
      `  Total VRAM: ${this.getTotalVram()}MB | Free: ${this.getFreeVram()}MB`
    );
    lines.push('');

    return lines.join('\n');
  }

  createBar(percent, width) {
    const filled = Math.round((percent / 100) * width);
    return '█'.repeat(filled) + '░'.repeat(width - filled);
  }
}

// Singleton instances
let modelRegistry = null;
let gpuManager = null;

export function getModelRegistry(options) {
  if (!modelRegistry) {
    modelRegistry = new ModelRegistry(options);
  }
  return modelRegistry;
}

export function getGPUManager() {
  if (!gpuManager) {
    gpuManager = new GPUManager();
  }
  return gpuManager;
}

export { MODEL_CATALOG, DEFAULT_ALIASES };
