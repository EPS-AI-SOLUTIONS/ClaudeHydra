/**
 * Block 5: Model Management for AI Learning System
 *
 * Features:
 * 1. Model Registry - Track versions with metrics
 * 2. A/B Testing - Route traffic with performance tracking
 * 3. Auto Model Selection - Query-based model routing
 * 4. Model Rollback - Store and restore previous versions
 * 5. Quantization Config - Hardware-aware presets
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================================================
// Types & Interfaces
// ============================================================================

/** Model performance metrics */
export interface ModelMetrics {
  accuracy: number;
  latencyMs: number;
  tokensPerSecond: number;
  errorRate: number;
  userSatisfaction: number;
  totalRequests: number;
  successfulRequests: number;
}

/** Model information */
export interface ModelInfo {
  id: string;
  name: string;
  baseModel: string;
  version: string;
  createdAt: number;
  updatedAt: number;
  sampleCount: number;
  metrics: ModelMetrics;
  isActive: boolean;
  tags: string[];
  description: string;
}

/** Query type for auto-selection */
export type QueryType = 'code' | 'explain' | 'debug' | 'chat' | 'analyze' | 'translate' | 'unknown';

/** Query classification result */
export interface QueryClassification {
  type: QueryType;
  confidence: number;
  keywords: string[];
}

/** A/B Test configuration */
export interface ABTestConfig {
  id: string;
  name: string;
  primaryModelId: string;
  challengerModelId: string;
  primaryWeight: number; // 0-100, challenger gets (100 - primaryWeight)
  isActive: boolean;
  startedAt: number;
  endedAt: number | null;
  results: {
    primary: ABTestMetrics;
    challenger: ABTestMetrics;
  };
}

/** A/B Test metrics for each variant */
export interface ABTestMetrics {
  requests: number;
  avgLatencyMs: number;
  errorCount: number;
  userPreferences: number;
  conversionRate: number;
}

/** Quantization preset */
export interface QuantizationPreset {
  id: string;
  name: string;
  type: 'Q4_K_M' | 'Q5_K_M' | 'Q8_0' | 'F16' | 'F32';
  bitsPerWeight: number;
  memorySavings: number; // percentage
  speedImpact: number; // multiplier (1.0 = same, >1 = faster)
  qualityImpact: number; // 0-1 (1 = no loss)
  minRamGB: number;
  recommendedForVRAM: number;
  description: string;
}

/** Hardware capabilities */
export interface HardwareInfo {
  totalRamGB: number;
  availableRamGB: number;
  gpuVramGB: number | null;
  cpuCores: number;
  isGpuAvailable: boolean;
  gpuName: string | null;
}

/** Model version snapshot for rollback */
export interface ModelSnapshot {
  id: string;
  modelId: string;
  snapshot: ModelInfo;
  createdAt: number;
  reason: string;
}

/** Query routing rule */
export interface QueryRoutingRule {
  queryType: QueryType;
  preferredModelId: string;
  fallbackModelId: string | null;
  priority: number;
}

// ============================================================================
// Constants
// ============================================================================

const QUANTIZATION_PRESETS: QuantizationPreset[] = [
  {
    id: 'q4_k_m',
    name: 'Q4_K_M (Balanced)',
    type: 'Q4_K_M',
    bitsPerWeight: 4.5,
    memorySavings: 70,
    speedImpact: 1.3,
    qualityImpact: 0.92,
    minRamGB: 4,
    recommendedForVRAM: 4,
    description: 'Best balance of quality and speed. Recommended for most use cases.',
  },
  {
    id: 'q5_k_m',
    name: 'Q5_K_M (Quality)',
    type: 'Q5_K_M',
    bitsPerWeight: 5.5,
    memorySavings: 60,
    speedImpact: 1.1,
    qualityImpact: 0.96,
    minRamGB: 6,
    recommendedForVRAM: 6,
    description: 'Higher quality with moderate memory savings. Good for code generation.',
  },
  {
    id: 'q8_0',
    name: 'Q8_0 (High Quality)',
    type: 'Q8_0',
    bitsPerWeight: 8,
    memorySavings: 50,
    speedImpact: 1.0,
    qualityImpact: 0.99,
    minRamGB: 8,
    recommendedForVRAM: 8,
    description: 'Near-lossless quality. Best for critical applications.',
  },
  {
    id: 'f16',
    name: 'F16 (Full Precision)',
    type: 'F16',
    bitsPerWeight: 16,
    memorySavings: 0,
    speedImpact: 0.9,
    qualityImpact: 1.0,
    minRamGB: 16,
    recommendedForVRAM: 12,
    description: 'Full 16-bit precision. Maximum quality, high memory usage.',
  },
  {
    id: 'f32',
    name: 'F32 (Maximum Precision)',
    type: 'F32',
    bitsPerWeight: 32,
    memorySavings: -100,
    speedImpact: 0.7,
    qualityImpact: 1.0,
    minRamGB: 32,
    recommendedForVRAM: 24,
    description: 'Full 32-bit precision. For research and fine-tuning only.',
  },
];

const QUERY_TYPE_KEYWORDS: Record<QueryType, string[]> = {
  code: [
    'write',
    'code',
    'function',
    'implement',
    'create',
    'build',
    'develop',
    'typescript',
    'javascript',
    'python',
    'react',
    'component',
    'api',
    'class',
    'method',
    'algorithm',
    'script',
    'program',
    'refactor',
    'optimize',
  ],
  explain: [
    'explain',
    'what is',
    'how does',
    'why',
    'describe',
    'tell me about',
    'understand',
    'clarify',
    'meaning',
    'definition',
    'concept',
    'theory',
    'example',
    'tutorial',
    'guide',
    'learn',
  ],
  debug: [
    'debug',
    'fix',
    'error',
    'bug',
    'issue',
    'problem',
    'not working',
    'fails',
    'crash',
    'exception',
    'undefined',
    'null',
    'broken',
    'wrong',
    'troubleshoot',
    'diagnose',
    'resolve',
  ],
  chat: [
    'hello',
    'hi',
    'hey',
    'thanks',
    'thank you',
    'please',
    'help',
    'can you',
    'would you',
    'could you',
    'opinion',
    'think',
    'feel',
  ],
  analyze: [
    'analyze',
    'review',
    'assess',
    'evaluate',
    'compare',
    'benchmark',
    'performance',
    'security',
    'audit',
    'inspect',
    'check',
    'validate',
    'test',
    'verify',
    'measure',
  ],
  translate: [
    'translate',
    'convert',
    'transform',
    'migrate',
    'port',
    'rewrite',
    'from',
    'to',
    'language',
    'format',
    'syntax',
  ],
  unknown: [],
};

const MODEL_PREFERENCES: Record<QueryType, string[]> = {
  code: ['qwen2.5-coder', 'codellama', 'deepseek-coder', 'starcoder'],
  explain: ['llama3.2', 'mistral', 'phi3', 'gemma'],
  debug: ['qwen2.5-coder', 'codellama', 'llama3.2'],
  chat: ['llama3.2', 'mistral', 'phi3'],
  analyze: ['llama3.2', 'mistral', 'qwen2.5-coder'],
  translate: ['llama3.2', 'mistral'],
  unknown: ['llama3.2', 'mistral', 'phi3'],
};

const MAX_SNAPSHOTS_PER_MODEL = 3;

// ============================================================================
// Store Interface
// ============================================================================

interface ModelRegistryState {
  // Model Registry
  models: Record<string, ModelInfo>;

  // A/B Testing
  abTests: Record<string, ABTestConfig>;
  activeAbTestId: string | null;

  // Routing Rules
  routingRules: QueryRoutingRule[];

  // Rollback Snapshots
  snapshots: ModelSnapshot[];

  // Hardware Info (cached)
  hardwareInfo: HardwareInfo | null;

  // Selected quantization
  selectedQuantization: string;

  // Actions - Model Registry
  registerModel: (model: Omit<ModelInfo, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateModel: (id: string, updates: Partial<ModelInfo>) => void;
  deleteModel: (id: string) => void;
  getModel: (id: string) => ModelInfo | undefined;
  getAllModels: () => ModelInfo[];
  getActiveModels: () => ModelInfo[];
  updateModelMetrics: (id: string, metrics: Partial<ModelMetrics>) => void;

  // Actions - A/B Testing
  createAbTest: (config: Omit<ABTestConfig, 'id' | 'startedAt' | 'endedAt' | 'results'>) => string;
  startAbTest: (id: string) => void;
  stopAbTest: (id: string) => void;
  recordAbTestResult: (
    testId: string,
    variant: 'primary' | 'challenger',
    success: boolean,
    latencyMs: number,
  ) => void;
  getAbTestWinner: (testId: string) => 'primary' | 'challenger' | 'inconclusive';
  routeAbTestTraffic: (testId: string) => 'primary' | 'challenger';

  // Actions - Auto Model Selection
  classifyQuery: (query: string) => QueryClassification;
  selectModelForQuery: (query: string) => ModelInfo | null;
  setRoutingRule: (rule: QueryRoutingRule) => void;
  removeRoutingRule: (queryType: QueryType) => void;

  // Actions - Model Rollback
  createSnapshot: (modelId: string, reason: string) => string;
  rollbackModel: (modelId: string, snapshotId?: string) => boolean;
  getModelSnapshots: (modelId: string) => ModelSnapshot[];
  deleteSnapshot: (snapshotId: string) => void;

  // Actions - Quantization
  getQuantizationPresets: () => QuantizationPreset[];
  selectQuantization: (presetId: string) => void;
  detectHardware: () => Promise<HardwareInfo>;
  getRecommendedQuantization: () => QuantizationPreset;

  // Actions - Utility
  exportRegistry: () => string;
  importRegistry: (json: string) => boolean;
  clearAllData: () => void;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useModelRegistry = create<ModelRegistryState>()(
  persist(
    (set, get) => ({
      // Initial State
      models: {},
      abTests: {},
      activeAbTestId: null,
      routingRules: [],
      snapshots: [],
      hardwareInfo: null,
      selectedQuantization: 'q4_k_m',

      // ========================================
      // Model Registry Actions
      // ========================================

      registerModel: (model) => {
        const id = crypto.randomUUID();
        const now = Date.now();
        const newModel: ModelInfo = {
          ...model,
          id,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          models: { ...state.models, [id]: newModel },
        }));

        return id;
      },

      updateModel: (id, updates) => {
        set((state) => {
          const model = state.models[id];
          if (!model) return state;

          return {
            models: {
              ...state.models,
              [id]: { ...model, ...updates, updatedAt: Date.now() },
            },
          };
        });
      },

      deleteModel: (id) => {
        set((state) => {
          const { [id]: _deleted, ...remaining } = state.models;
          // Also remove related snapshots
          const filteredSnapshots = state.snapshots.filter((s) => s.modelId !== id);
          return { models: remaining, snapshots: filteredSnapshots };
        });
      },

      getModel: (id) => get().models[id],

      getAllModels: () => Object.values(get().models),

      getActiveModels: () => Object.values(get().models).filter((m) => m.isActive),

      updateModelMetrics: (id, metrics) => {
        set((state) => {
          const model = state.models[id];
          if (!model) return state;

          return {
            models: {
              ...state.models,
              [id]: {
                ...model,
                metrics: { ...model.metrics, ...metrics },
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      // ========================================
      // A/B Testing Actions
      // ========================================

      createAbTest: (config) => {
        const id = crypto.randomUUID();
        const newTest: ABTestConfig = {
          ...config,
          id,
          startedAt: 0,
          endedAt: null,
          results: {
            primary: {
              requests: 0,
              avgLatencyMs: 0,
              errorCount: 0,
              userPreferences: 0,
              conversionRate: 0,
            },
            challenger: {
              requests: 0,
              avgLatencyMs: 0,
              errorCount: 0,
              userPreferences: 0,
              conversionRate: 0,
            },
          },
        };

        set((state) => ({
          abTests: { ...state.abTests, [id]: newTest },
        }));

        return id;
      },

      startAbTest: (id) => {
        set((state) => {
          const test = state.abTests[id];
          if (!test) return state;

          return {
            abTests: {
              ...state.abTests,
              [id]: { ...test, isActive: true, startedAt: Date.now() },
            },
            activeAbTestId: id,
          };
        });
      },

      stopAbTest: (id) => {
        set((state) => {
          const test = state.abTests[id];
          if (!test) return state;

          return {
            abTests: {
              ...state.abTests,
              [id]: { ...test, isActive: false, endedAt: Date.now() },
            },
            activeAbTestId: state.activeAbTestId === id ? null : state.activeAbTestId,
          };
        });
      },

      recordAbTestResult: (testId, variant, success, latencyMs) => {
        set((state) => {
          const test = state.abTests[testId];
          if (!test || !test.isActive) return state;

          const metrics = test.results[variant];
          const newRequests = metrics.requests + 1;
          const newAvgLatency = (metrics.avgLatencyMs * metrics.requests + latencyMs) / newRequests;
          const newErrorCount = success ? metrics.errorCount : metrics.errorCount + 1;
          const newConversionRate =
            (metrics.conversionRate * metrics.requests + (success ? 1 : 0)) / newRequests;

          return {
            abTests: {
              ...state.abTests,
              [testId]: {
                ...test,
                results: {
                  ...test.results,
                  [variant]: {
                    ...metrics,
                    requests: newRequests,
                    avgLatencyMs: newAvgLatency,
                    errorCount: newErrorCount,
                    conversionRate: newConversionRate,
                  },
                },
              },
            },
          };
        });
      },

      getAbTestWinner: (testId) => {
        const test = get().abTests[testId];
        if (!test) return 'inconclusive';

        const { primary, challenger } = test.results;
        const minSamples = 100;

        if (primary.requests < minSamples || challenger.requests < minSamples) {
          return 'inconclusive';
        }

        // Scoring: lower latency, higher conversion, fewer errors
        const primaryScore =
          primary.conversionRate * 100 -
          primary.avgLatencyMs / 1000 -
          (primary.errorCount / primary.requests) * 50;

        const challengerScore =
          challenger.conversionRate * 100 -
          challenger.avgLatencyMs / 1000 -
          (challenger.errorCount / challenger.requests) * 50;

        const threshold = 5; // Need 5% better to declare winner

        if (primaryScore > challengerScore + threshold) return 'primary';
        if (challengerScore > primaryScore + threshold) return 'challenger';
        return 'inconclusive';
      },

      routeAbTestTraffic: (testId) => {
        const test = get().abTests[testId];
        if (!test || !test.isActive) return 'primary';

        // Default: 80% primary, 20% challenger
        const random = Math.random() * 100;
        return random < test.primaryWeight ? 'primary' : 'challenger';
      },

      // ========================================
      // Auto Model Selection Actions
      // ========================================

      classifyQuery: (query) => {
        const normalizedQuery = query.toLowerCase();
        let bestMatch: QueryType = 'unknown';
        let bestScore = 0;
        const matchedKeywords: string[] = [];

        for (const [type, keywords] of Object.entries(QUERY_TYPE_KEYWORDS) as [
          QueryType,
          string[],
        ][]) {
          let score = 0;
          const matches: string[] = [];

          for (const keyword of keywords) {
            if (normalizedQuery.includes(keyword)) {
              score += keyword.length; // Longer keywords = more specific
              matches.push(keyword);
            }
          }

          if (score > bestScore) {
            bestScore = score;
            bestMatch = type;
            matchedKeywords.length = 0;
            matchedKeywords.push(...matches);
          }
        }

        const maxPossibleScore = 50; // Approximate max score
        const confidence = Math.min(bestScore / maxPossibleScore, 1);

        return {
          type: bestMatch,
          confidence,
          keywords: matchedKeywords,
        };
      },

      selectModelForQuery: (query) => {
        const state = get();
        const classification = state.classifyQuery(query);

        // Check for custom routing rule first
        const customRule = state.routingRules.find((r) => r.queryType === classification.type);
        if (customRule) {
          const preferredModel = state.models[customRule.preferredModelId];
          if (preferredModel?.isActive) return preferredModel;

          if (customRule.fallbackModelId) {
            const fallbackModel = state.models[customRule.fallbackModelId];
            if (fallbackModel?.isActive) return fallbackModel;
          }
        }

        // Use default preferences
        const preferredModels = MODEL_PREFERENCES[classification.type];
        const activeModels = state.getActiveModels();

        // Find best match from preferences
        for (const preferred of preferredModels) {
          const match = activeModels.find((m) =>
            m.baseModel.toLowerCase().includes(preferred.toLowerCase()),
          );
          if (match) return match;
        }

        // Fallback to any active model sorted by metrics
        const sortedModels = activeModels.sort((a, b) => {
          const scoreA = a.metrics.accuracy * 100 - a.metrics.latencyMs / 100;
          const scoreB = b.metrics.accuracy * 100 - b.metrics.latencyMs / 100;
          return scoreB - scoreA;
        });

        return sortedModels[0] || null;
      },

      setRoutingRule: (rule) => {
        set((state) => {
          const existing = state.routingRules.findIndex((r) => r.queryType === rule.queryType);
          const newRules = [...state.routingRules];

          if (existing >= 0) {
            newRules[existing] = rule;
          } else {
            newRules.push(rule);
          }

          return { routingRules: newRules.sort((a, b) => b.priority - a.priority) };
        });
      },

      removeRoutingRule: (queryType) => {
        set((state) => ({
          routingRules: state.routingRules.filter((r) => r.queryType !== queryType),
        }));
      },

      // ========================================
      // Model Rollback Actions
      // ========================================

      createSnapshot: (modelId, reason) => {
        const model = get().models[modelId];
        if (!model) return '';

        const snapshotId = crypto.randomUUID();
        const snapshot: ModelSnapshot = {
          id: snapshotId,
          modelId,
          snapshot: { ...model },
          createdAt: Date.now(),
          reason,
        };

        set((state) => {
          // Keep only last MAX_SNAPSHOTS_PER_MODEL snapshots per model
          const existingForModel = state.snapshots
            .filter((s) => s.modelId === modelId)
            .sort((a, b) => b.createdAt - a.createdAt);

          const toKeep = existingForModel.slice(0, MAX_SNAPSHOTS_PER_MODEL - 1);
          const otherSnapshots = state.snapshots.filter((s) => s.modelId !== modelId);

          return {
            snapshots: [...otherSnapshots, ...toKeep, snapshot],
          };
        });

        return snapshotId;
      },

      rollbackModel: (modelId, snapshotId) => {
        const state = get();
        const modelSnapshots = state.snapshots
          .filter((s) => s.modelId === modelId)
          .sort((a, b) => b.createdAt - a.createdAt);

        if (modelSnapshots.length === 0) return false;

        // Use specific snapshot or most recent
        const targetSnapshot = snapshotId
          ? modelSnapshots.find((s) => s.id === snapshotId)
          : modelSnapshots[0];

        if (!targetSnapshot) return false;

        // Create snapshot of current state before rollback
        get().createSnapshot(modelId, 'Pre-rollback backup');

        // Restore model to snapshot state
        set((state) => ({
          models: {
            ...state.models,
            [modelId]: {
              ...targetSnapshot.snapshot,
              updatedAt: Date.now(),
            },
          },
        }));

        return true;
      },

      getModelSnapshots: (modelId) => {
        return get()
          .snapshots.filter((s) => s.modelId === modelId)
          .sort((a, b) => b.createdAt - a.createdAt);
      },

      deleteSnapshot: (snapshotId) => {
        set((state) => ({
          snapshots: state.snapshots.filter((s) => s.id !== snapshotId),
        }));
      },

      // ========================================
      // Quantization Actions
      // ========================================

      getQuantizationPresets: () => QUANTIZATION_PRESETS,

      selectQuantization: (presetId) => {
        const preset = QUANTIZATION_PRESETS.find((p) => p.id === presetId);
        if (preset) {
          set({ selectedQuantization: presetId });
        }
      },

      detectHardware: async () => {
        // Browser-based hardware detection
        const info: HardwareInfo = {
          totalRamGB: 8, // Default fallback
          availableRamGB: 4,
          gpuVramGB: null,
          cpuCores: navigator.hardwareConcurrency || 4,
          isGpuAvailable: false,
          gpuName: null,
        };

        // Try to detect memory
        if ('deviceMemory' in navigator) {
          info.totalRamGB = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 8;
          info.availableRamGB = info.totalRamGB * 0.5; // Estimate
        }

        // Try to detect GPU via WebGL
        try {
          const canvas = document.createElement('canvas');
          const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
          if (gl) {
            const debugInfo = (gl as WebGLRenderingContext).getExtension(
              'WEBGL_debug_renderer_info',
            );
            if (debugInfo) {
              const renderer = (gl as WebGLRenderingContext).getParameter(
                debugInfo.UNMASKED_RENDERER_WEBGL,
              );
              info.gpuName = renderer;
              info.isGpuAvailable = true;

              // Estimate VRAM based on GPU name
              if (renderer.includes('RTX 4090')) info.gpuVramGB = 24;
              else if (renderer.includes('RTX 4080')) info.gpuVramGB = 16;
              else if (renderer.includes('RTX 4070')) info.gpuVramGB = 12;
              else if (renderer.includes('RTX 3090')) info.gpuVramGB = 24;
              else if (renderer.includes('RTX 3080')) info.gpuVramGB = 10;
              else if (renderer.includes('RTX 3070')) info.gpuVramGB = 8;
              else if (renderer.includes('RTX')) info.gpuVramGB = 8;
              else if (renderer.includes('GTX')) info.gpuVramGB = 6;
              else info.gpuVramGB = 4; // Conservative default
            }
          }
        } catch {
          // WebGL not available
        }

        set({ hardwareInfo: info });
        return info;
      },

      getRecommendedQuantization: () => {
        const hardware = get().hardwareInfo;

        if (!hardware) {
          // Default recommendation without hardware info
          return QUANTIZATION_PRESETS.find((p) => p.id === 'q4_k_m')!;
        }

        const availableRam = hardware.availableRamGB;
        const vram = hardware.gpuVramGB || 0;
        const effectiveMemory = Math.max(availableRam, vram);

        // Select based on available memory
        if (effectiveMemory >= 24) {
          return QUANTIZATION_PRESETS.find((p) => p.id === 'f16')!;
        } else if (effectiveMemory >= 12) {
          return QUANTIZATION_PRESETS.find((p) => p.id === 'q8_0')!;
        } else if (effectiveMemory >= 8) {
          return QUANTIZATION_PRESETS.find((p) => p.id === 'q5_k_m')!;
        } else {
          return QUANTIZATION_PRESETS.find((p) => p.id === 'q4_k_m')!;
        }
      },

      // ========================================
      // Utility Actions
      // ========================================

      exportRegistry: () => {
        const state = get();
        return JSON.stringify(
          {
            models: state.models,
            abTests: state.abTests,
            routingRules: state.routingRules,
            snapshots: state.snapshots,
            selectedQuantization: state.selectedQuantization,
            exportedAt: Date.now(),
            version: '1.0.0',
          },
          null,
          2,
        );
      },

      importRegistry: (json) => {
        try {
          const data = JSON.parse(json);

          if (!data.models || !data.version) {
            return false;
          }

          set({
            models: data.models || {},
            abTests: data.abTests || {},
            routingRules: data.routingRules || [],
            snapshots: data.snapshots || [],
            selectedQuantization: data.selectedQuantization || 'q4_k_m',
          });

          return true;
        } catch {
          return false;
        }
      },

      clearAllData: () => {
        set({
          models: {},
          abTests: {},
          activeAbTestId: null,
          routingRules: [],
          snapshots: [],
          hardwareInfo: null,
          selectedQuantization: 'q4_k_m',
        });
      },
    }),
    {
      name: 'model-registry-storage',
      partialize: (state) => ({
        models: state.models,
        abTests: state.abTests,
        activeAbTestId: state.activeAbTestId,
        routingRules: state.routingRules,
        snapshots: state.snapshots,
        selectedQuantization: state.selectedQuantization,
      }),
    },
  ),
);

// ============================================================================
// Exported Helper Functions
// ============================================================================

/**
 * Select the best model for a given query
 * @param query - The user's query string
 * @returns The best matching ModelInfo or null
 */
export function selectModelForQuery(query: string): ModelInfo | null {
  return useModelRegistry.getState().selectModelForQuery(query);
}

/**
 * Rollback a model to a previous version
 * @param modelId - The model ID to rollback
 * @param snapshotId - Optional specific snapshot ID (defaults to most recent)
 * @returns true if rollback succeeded
 */
export function rollbackModel(modelId: string, snapshotId?: string): boolean {
  return useModelRegistry.getState().rollbackModel(modelId, snapshotId);
}

/**
 * Get all quantization presets
 * @returns Array of QuantizationPreset
 */
export function getQuantizationPresets(): QuantizationPreset[] {
  return QUANTIZATION_PRESETS;
}

/**
 * Classify a query to determine its type
 * @param query - The user's query string
 * @returns QueryClassification with type, confidence, and matched keywords
 */
export function classifyQuery(query: string): QueryClassification {
  return useModelRegistry.getState().classifyQuery(query);
}

/**
 * Route A/B test traffic to determine which variant to use
 * @param testId - The A/B test ID
 * @returns 'primary' or 'challenger'
 */
export function routeAbTestTraffic(testId: string): 'primary' | 'challenger' {
  return useModelRegistry.getState().routeAbTestTraffic(testId);
}

// ============================================================================
// Default Export
// ============================================================================

export default useModelRegistry;
