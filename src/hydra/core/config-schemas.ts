/**
 * @fileoverview HYDRA Configuration Schemas
 * Zod-based configuration validation schemas, extracted from config.ts.
 *
 * @description
 * Defines:
 * - ProviderConfigSchema (base)
 * - LlamaCppConfigSchema, GeminiConfigSchema (provider-specific)
 * - RouterConfigSchema, PipelineConfigSchema, CacheConfigSchema, StatsConfigSchema
 * - HydraConfigSchema (root)
 * - DEFAULT_CONFIG object literal
 *
 * @module hydra/core/config-schemas
 * @version 2.0.0
 */

import { z } from 'zod';
import {
  ClaudeInstancesConfigSchema,
  DEFAULT_CLAUDE_INSTANCES_CONFIG,
} from './config-schemas-claude-instances.js';

// Re-export Claude Instances utilities for convenience
export { applyEnvOverrides, watchConfigFile } from './config-schemas-claude-instances.js';

// =============================================================================
// Provider Schemas
// =============================================================================

/**
 * Provider configuration schema (base)
 */
export const ProviderConfigSchema = z.object({
  enabled: z.boolean().default(true),
  timeout: z.number().min(1000).max(600000).default(120000),
  maxRetries: z.number().min(0).max(10).default(3),
  costPerToken: z.number().min(0).default(0),
  fixedCost: z.number().min(0).default(0),
  defaultModel: z.string().optional(),
  pool: z
    .object({
      maxConcurrent: z.number().min(1).max(100).default(5),
      maxQueueSize: z.number().min(0).max(1000).default(100),
      acquireTimeout: z.number().min(1000).max(60000).default(30000),
    })
    .default({}),
  rateLimit: z
    .object({
      enabled: z.boolean().default(false),
      tokensPerInterval: z.number().min(1).default(10),
      interval: z.number().min(100).default(1000),
    })
    .default({}),
});

/**
 * LlamaCpp-specific configuration schema
 */
export const LlamaCppConfigSchema = ProviderConfigSchema.extend({
  models: z
    .object({
      router: z.string().default('draft'),
      researcher: z.string().default('main'),
      coder: z.string().default('main'),
      reasoner: z.string().default('main'),
      default: z.string().default('main'),
    })
    .default({}),
  tools: z
    .object({
      default: z.string().default('llama_generate'),
      fast: z.string().default('llama_generate_fast'),
      code: z.string().default('llama_code'),
      json: z.string().default('llama_json'),
      vision: z.string().default('llama_vision'),
      functionCall: z.string().default('llama_function_call'),
    })
    .default({}),
});

/**
 * Gemini-specific configuration schema
 */
export const GeminiConfigSchema = ProviderConfigSchema.extend({
  cliPath: z.string().optional(),
  apiKey: z.string().optional(),
  defaultModel: z.string().default('gemini-2.0-flash-exp'),
  thinkingModel: z.string().default('gemini-2.0-flash-thinking-exp'),
  costPerToken: z.number().default(0.000001),
  fixedCost: z.number().default(0.001),
  autoSelectBestModel: z.boolean().default(true),
  modelRefreshInterval: z.number().min(60000).default(300000), // 5 minutes
});

// =============================================================================
// System Schemas
// =============================================================================

/** Router configuration schema */
export const RouterConfigSchema = z.object({
  useLLMRouting: z.boolean().default(true),
  fallbackToHeuristic: z.boolean().default(true),
  complexityThresholds: z
    .object({
      simple: z.number().default(1),
      medium: z.number().default(2),
      complex: z.number().default(4),
    })
    .default({}),
  categoryPatterns: z.record(z.array(z.string())).default({}),
});

/** Pipeline configuration schema */
export const PipelineConfigSchema = z.object({
  verbose: z.boolean().default(false),
  enableSpeculation: z.boolean().default(true),
  enablePlanning: z.boolean().default(true),
  enableSynthesis: z.boolean().default(true),
  enableFeedbackLoop: z.boolean().default(true),
  maxPlanSteps: z.number().min(1).max(20).default(5),
  maxFeedbackIterations: z.number().min(1).max(5).default(3),
  qualityThreshold: z.number().min(0).max(10).default(7),
  fallbackProvider: z.enum(['ollama', 'gemini']).default('gemini'),
  parallelExecution: z.boolean().default(false),
});

/** Cache configuration schema */
export const CacheConfigSchema = z.object({
  enabled: z.boolean().default(true),
  healthCheck: z
    .object({
      ttl: z.number().min(1000).default(30000),
      staleTTL: z.number().min(1000).default(60000),
      autoRefresh: z.boolean().default(true),
    })
    .default({}),
  responses: z
    .object({
      enabled: z.boolean().default(false),
      ttl: z.number().min(1000).default(300000),
      maxSize: z.number().min(10).default(1000),
    })
    .default({}),
});

/** Stats configuration schema */
export const StatsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  rollingWindowSize: z.number().min(10).max(1000).default(100),
  timeSeriesBucketSize: z.number().min(1000).default(60000),
  timeSeriesRetention: z.number().min(1).default(60),
  exportFormat: z.enum(['json', 'prometheus']).default('json'),
});

// =============================================================================
// Root Schema
// =============================================================================

/** Main HYDRA configuration schema */
export const HydraConfigSchema = z.object({
  providers: z
    .object({
      llamacpp: LlamaCppConfigSchema.default({}),
      gemini: GeminiConfigSchema.default({}),
    })
    .default({}),
  router: RouterConfigSchema.default({}),
  pipeline: PipelineConfigSchema.default({}),
  cache: CacheConfigSchema.default({}),
  stats: StatsConfigSchema.default({}),
  claudeInstances: ClaudeInstancesConfigSchema.default({}),
  logging: z
    .object({
      level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
      timestamps: z.boolean().default(true),
      colors: z.boolean().default(true),
    })
    .default({}),
});

// =============================================================================
// Default Configuration
// =============================================================================

/** Default configuration object (static, no env overrides) */
export const DEFAULT_CONFIG = {
  providers: {
    llamacpp: {
      enabled: true,
      timeout: 120000,
      maxRetries: 3,
      costPerToken: 0,
      fixedCost: 0,
      models: {
        router: 'draft',
        researcher: 'main',
        coder: 'main',
        reasoner: 'main',
        default: 'main',
      },
      tools: {
        default: 'llama_generate',
        fast: 'llama_generate_fast',
        code: 'llama_code',
        json: 'llama_json',
        vision: 'llama_vision',
        functionCall: 'llama_function_call',
      },
      pool: {
        maxConcurrent: 5,
        maxQueueSize: 100,
        acquireTimeout: 30000,
      },
      rateLimit: {
        enabled: false,
        tokensPerInterval: 10,
        interval: 1000,
      },
    },
    gemini: {
      enabled: true,
      timeout: 120000,
      maxRetries: 3,
      costPerToken: 0.000001,
      fixedCost: 0.001,
      defaultModel: 'gemini-2.0-flash-exp',
      thinkingModel: 'gemini-2.0-flash-thinking-exp',
      autoSelectBestModel: true,
      modelRefreshInterval: 300000,
      pool: {
        maxConcurrent: 3,
        maxQueueSize: 50,
        acquireTimeout: 30000,
      },
      rateLimit: {
        enabled: true,
        tokensPerInterval: 5,
        interval: 1000,
      },
    },
  },
  router: {
    useLLMRouting: true,
    fallbackToHeuristic: true,
    complexityThresholds: {
      simple: 1,
      medium: 2,
      complex: 4,
    },
  },
  pipeline: {
    verbose: false,
    enableSpeculation: true,
    enablePlanning: true,
    enableSynthesis: true,
    enableFeedbackLoop: true,
    maxPlanSteps: 5,
    maxFeedbackIterations: 3,
    qualityThreshold: 7,
    fallbackProvider: 'gemini',
    parallelExecution: false,
  },
  cache: {
    enabled: true,
    healthCheck: {
      ttl: 30000,
      staleTTL: 60000,
      autoRefresh: true,
    },
    responses: {
      enabled: false,
      ttl: 300000,
      maxSize: 1000,
    },
  },
  stats: {
    enabled: true,
    rollingWindowSize: 100,
    timeSeriesBucketSize: 60000,
    timeSeriesRetention: 60,
    exportFormat: 'json',
  },
  claudeInstances: DEFAULT_CLAUDE_INSTANCES_CONFIG,
  logging: {
    level: 'info',
    timestamps: true,
    colors: true,
  },
};

/** All schemas bundled for external validation */
export const Schemas = {
  HydraConfigSchema,
  ProviderConfigSchema,
  LlamaCppConfigSchema,
  GeminiConfigSchema,
  RouterConfigSchema,
  PipelineConfigSchema,
  CacheConfigSchema,
  StatsConfigSchema,
  ClaudeInstancesConfigSchema,
};
