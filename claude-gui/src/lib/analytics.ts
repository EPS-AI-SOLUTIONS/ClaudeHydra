/**
 * Analytics & Monitoring for AI Learning System
 * Block 9: Metrics, Topic Clustering, Query Analytics, Cost Estimation, Performance Timing
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================================================
// Types
// ============================================================================

/** Query type classification */
export type QueryType = 'code' | 'explain' | 'debug' | 'general';

/** Performance timing metrics */
export interface PerformanceTiming {
  embeddingMs: number;
  retrievalMs: number;
  generationMs: number;
  totalMs: number;
  timestamp: number;
}

/** Topic cluster from k-means */
export interface TopicCluster {
  id: number;
  name: string;
  keywords: string[];
  count: number;
  percentage: number;
}

/** Recent activity entry */
export interface ActivityEntry {
  id: string;
  timestamp: number;
  type: 'query' | 'learning' | 'rag_add' | 'model_update' | 'export';
  description: string;
  metadata?: Record<string, unknown>;
}

/** Alzur (incremental learning) status */
export interface AlzurStatus {
  samples: number;
  bufferSize: number;
  modelVersion: string;
  lastUpdate: number;
  isTraining: boolean;
}

/** Cost estimation data */
export interface CostEstimation {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number; // USD
}

/** Analytics metrics store state */
export interface AnalyticsMetrics {
  // Core metrics
  totalSamples: number;
  modelVersions: string[];
  ragEntries: number;
  avgQuality: number;

  // Query analytics
  queryCounts: Record<QueryType, number>;
  totalQueries: number;

  // Topic clustering
  topTopics: TopicCluster[];
  keywordFrequency: Record<string, number>;

  // Cost tracking
  totalCost: CostEstimation;
  sessionCost: CostEstimation;

  // Performance
  performanceHistory: PerformanceTiming[];
  avgPerformance: PerformanceTiming;

  // Activity
  recentActivity: ActivityEntry[];

  // Alzur status
  alzurStatus: AlzurStatus;
}

/** Analytics store actions */
export interface AnalyticsActions {
  // Metrics
  incrementSamples: (count?: number) => void;
  addModelVersion: (version: string) => void;
  setRagEntries: (count: number) => void;
  updateAvgQuality: (quality: number) => void;

  // Query tracking
  trackQuery: (type: QueryType, keywords?: string[]) => void;

  // Topic clustering
  updateTopics: () => void;
  addKeywords: (keywords: string[]) => void;

  // Cost estimation
  trackTokens: (prompt: number, completion: number) => void;
  resetSessionCost: () => void;

  // Performance
  recordTiming: (timing: Omit<PerformanceTiming, 'timestamp'>) => void;

  // Activity
  addActivity: (entry: Omit<ActivityEntry, 'id' | 'timestamp'>) => void;
  clearActivity: () => void;

  // Alzur
  updateAlzurStatus: (status: Partial<AlzurStatus>) => void;

  // Reset
  resetAllMetrics: () => void;
}

export type AnalyticsStore = AnalyticsMetrics & AnalyticsActions;

// ============================================================================
// Constants
// ============================================================================

const COST_PER_TOKEN = 0.00001; // $0.00001 per token (example rate)
const MAX_ACTIVITY_ENTRIES = 50;
const MAX_PERFORMANCE_HISTORY = 100;
const K_CLUSTERS = 5;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Classify a query into a type based on content analysis
 */
export function classifyQuery(query: string): QueryType {
  const lowerQuery = query.toLowerCase();

  // Code patterns
  const codePatterns = [
    'write',
    'create',
    'implement',
    'function',
    'class',
    'component',
    'code',
    'script',
    'program',
    'build',
    'develop',
    'napish',
    'stworz',
  ];

  // Explain patterns
  const explainPatterns = [
    'explain',
    'what is',
    'how does',
    'why',
    'describe',
    'tell me',
    'wyjasni',
    'co to',
    'jak dziala',
    'dlaczego',
    'opisz',
  ];

  // Debug patterns
  const debugPatterns = [
    'fix',
    'debug',
    'error',
    'bug',
    'issue',
    'problem',
    'crash',
    'not working',
    'napraw',
    'blad',
    'nie dziala',
    'problem',
  ];

  if (codePatterns.some((p) => lowerQuery.includes(p))) return 'code';
  if (explainPatterns.some((p) => lowerQuery.includes(p))) return 'explain';
  if (debugPatterns.some((p) => lowerQuery.includes(p))) return 'debug';
  return 'general';
}

/**
 * Extract keywords from text
 */
export function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the',
    'a',
    'an',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'must',
    'shall',
    'can',
    'to',
    'of',
    'in',
    'for',
    'on',
    'with',
    'at',
    'by',
    'from',
    'as',
    'into',
    'through',
    'and',
    'or',
    'but',
    'if',
    'then',
    'else',
    'when',
    'up',
    'down',
    'out',
    'over',
    'under',
    'again',
    'further',
    'once',
    'here',
    'there',
    'this',
    'that',
    'these',
    'those',
    'it',
    'its',
    'i',
    'me',
    'my',
    'we',
    'our',
    'you',
    'your',
    'he',
    'she',
    'they',
    'them',
    'their',
    // Polish stop words
    'i',
    'w',
    'z',
    'na',
    'do',
    'nie',
    'tak',
    'jak',
    'co',
    'to',
    'czy',
    'dla',
    'po',
    'ale',
    'ze',
    'sie',
    'jest',
    'oraz',
    'przez',
    'od',
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u0080-\u024F\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));
}

/**
 * Simple k-means clustering on keyword frequency
 * Returns top K topic clusters
 */
export function clusterTopics(
  keywordFrequency: Record<string, number>,
  k: number = K_CLUSTERS,
): TopicCluster[] {
  const entries = Object.entries(keywordFrequency).sort(([, a], [, b]) => b - a);

  if (entries.length === 0) {
    return [];
  }

  const totalCount = entries.reduce((sum, [, count]) => sum + count, 0);

  // Simple clustering: group top keywords into K clusters
  const clusters: TopicCluster[] = [];
  const chunkSize = Math.ceil(entries.length / k);

  for (let i = 0; i < k && i * chunkSize < entries.length; i++) {
    const chunk = entries.slice(i * chunkSize, (i + 1) * chunkSize);
    const clusterKeywords = chunk.slice(0, 5).map(([kw]) => kw);
    const clusterCount = chunk.reduce((sum, [, c]) => sum + c, 0);

    if (clusterCount > 0) {
      clusters.push({
        id: i,
        name: clusterKeywords[0] || `Cluster ${i + 1}`,
        keywords: clusterKeywords,
        count: clusterCount,
        percentage: (clusterCount / totalCount) * 100,
      });
    }
  }

  return clusters.sort((a, b) => b.count - a.count);
}

/**
 * Calculate average performance from history
 */
function calculateAvgPerformance(history: PerformanceTiming[]): PerformanceTiming {
  if (history.length === 0) {
    return {
      embeddingMs: 0,
      retrievalMs: 0,
      generationMs: 0,
      totalMs: 0,
      timestamp: Date.now(),
    };
  }

  const sum = history.reduce(
    (acc, t) => ({
      embeddingMs: acc.embeddingMs + t.embeddingMs,
      retrievalMs: acc.retrievalMs + t.retrievalMs,
      generationMs: acc.generationMs + t.generationMs,
      totalMs: acc.totalMs + t.totalMs,
    }),
    { embeddingMs: 0, retrievalMs: 0, generationMs: 0, totalMs: 0 },
  );

  const count = history.length;
  return {
    embeddingMs: Math.round(sum.embeddingMs / count),
    retrievalMs: Math.round(sum.retrievalMs / count),
    generationMs: Math.round(sum.generationMs / count),
    totalMs: Math.round(sum.totalMs / count),
    timestamp: Date.now(),
  };
}

// ============================================================================
// Initial State
// ============================================================================

const initialMetrics: AnalyticsMetrics = {
  totalSamples: 0,
  modelVersions: ['v1.0.0'],
  ragEntries: 0,
  avgQuality: 0,

  queryCounts: {
    code: 0,
    explain: 0,
    debug: 0,
    general: 0,
  },
  totalQueries: 0,

  topTopics: [],
  keywordFrequency: {},

  totalCost: {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCost: 0,
  },
  sessionCost: {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCost: 0,
  },

  performanceHistory: [],
  avgPerformance: {
    embeddingMs: 0,
    retrievalMs: 0,
    generationMs: 0,
    totalMs: 0,
    timestamp: 0,
  },

  recentActivity: [],

  alzurStatus: {
    samples: 0,
    bufferSize: 0,
    modelVersion: 'v1.0.0',
    lastUpdate: 0,
    isTraining: false,
  },
};

// ============================================================================
// Analytics Store
// ============================================================================

export const useAnalyticsStore = create<AnalyticsStore>()(
  persist(
    (set, _get) => ({
      ...initialMetrics,

      // Metrics
      incrementSamples: (count = 1) =>
        set((state) => ({ totalSamples: state.totalSamples + count })),

      addModelVersion: (version) =>
        set((state) => ({
          modelVersions: state.modelVersions.includes(version)
            ? state.modelVersions
            : [...state.modelVersions, version],
        })),

      setRagEntries: (count) => set({ ragEntries: count }),

      updateAvgQuality: (quality) =>
        set((state) => ({
          avgQuality:
            state.totalSamples === 0
              ? quality
              : (state.avgQuality * state.totalSamples + quality) / (state.totalSamples + 1),
        })),

      // Query tracking
      trackQuery: (type, keywords = []) =>
        set((state) => {
          // Update query counts
          const newQueryCounts = {
            ...state.queryCounts,
            [type]: state.queryCounts[type] + 1,
          };

          // Update keyword frequency
          const newKeywordFreq = { ...state.keywordFrequency };
          keywords.forEach((kw) => {
            newKeywordFreq[kw] = (newKeywordFreq[kw] || 0) + 1;
          });

          return {
            queryCounts: newQueryCounts,
            totalQueries: state.totalQueries + 1,
            keywordFrequency: newKeywordFreq,
          };
        }),

      // Topic clustering
      updateTopics: () =>
        set((state) => ({
          topTopics: clusterTopics(state.keywordFrequency, K_CLUSTERS),
        })),

      addKeywords: (keywords) =>
        set((state) => {
          const newFreq = { ...state.keywordFrequency };
          keywords.forEach((kw) => {
            newFreq[kw] = (newFreq[kw] || 0) + 1;
          });
          return { keywordFrequency: newFreq };
        }),

      // Cost estimation
      trackTokens: (prompt, completion) =>
        set((state) => {
          const total = prompt + completion;
          const cost = total * COST_PER_TOKEN;

          return {
            totalCost: {
              promptTokens: state.totalCost.promptTokens + prompt,
              completionTokens: state.totalCost.completionTokens + completion,
              totalTokens: state.totalCost.totalTokens + total,
              estimatedCost: state.totalCost.estimatedCost + cost,
            },
            sessionCost: {
              promptTokens: state.sessionCost.promptTokens + prompt,
              completionTokens: state.sessionCost.completionTokens + completion,
              totalTokens: state.sessionCost.totalTokens + total,
              estimatedCost: state.sessionCost.estimatedCost + cost,
            },
          };
        }),

      resetSessionCost: () =>
        set({
          sessionCost: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            estimatedCost: 0,
          },
        }),

      // Performance
      recordTiming: (timing) =>
        set((state) => {
          const newEntry: PerformanceTiming = {
            ...timing,
            timestamp: Date.now(),
          };

          const newHistory = [...state.performanceHistory, newEntry].slice(
            -MAX_PERFORMANCE_HISTORY,
          );

          return {
            performanceHistory: newHistory,
            avgPerformance: calculateAvgPerformance(newHistory),
          };
        }),

      // Activity
      addActivity: (entry) =>
        set((state) => {
          const newEntry: ActivityEntry = {
            ...entry,
            id: crypto.randomUUID(),
            timestamp: Date.now(),
          };

          return {
            recentActivity: [newEntry, ...state.recentActivity].slice(0, MAX_ACTIVITY_ENTRIES),
          };
        }),

      clearActivity: () => set({ recentActivity: [] }),

      // Alzur
      updateAlzurStatus: (status) =>
        set((state) => ({
          alzurStatus: { ...state.alzurStatus, ...status },
        })),

      // Reset
      resetAllMetrics: () => set(initialMetrics),
    }),
    {
      name: 'claude-analytics-storage',
      partialize: (state) => ({
        totalSamples: state.totalSamples,
        modelVersions: state.modelVersions,
        ragEntries: state.ragEntries,
        avgQuality: state.avgQuality,
        queryCounts: state.queryCounts,
        totalQueries: state.totalQueries,
        keywordFrequency: state.keywordFrequency,
        topTopics: state.topTopics,
        totalCost: state.totalCost,
        alzurStatus: state.alzurStatus,
        // Note: performanceHistory, sessionCost, and recentActivity are NOT persisted
      }),
    },
  ),
);

// ============================================================================
// Selectors (for performance optimization)
// ============================================================================

export const selectQueryDistribution = (state: AnalyticsStore) => {
  const total = state.totalQueries;
  if (total === 0) return { code: 0, explain: 0, debug: 0, general: 0 };

  return {
    code: (state.queryCounts.code / total) * 100,
    explain: (state.queryCounts.explain / total) * 100,
    debug: (state.queryCounts.debug / total) * 100,
    general: (state.queryCounts.general / total) * 100,
  };
};

export const selectTopKeywords = (state: AnalyticsStore, limit = 10) => {
  return Object.entries(state.keywordFrequency)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([keyword, count]) => ({ keyword, count }));
};

export const selectCostSummary = (state: AnalyticsStore) => ({
  total: state.totalCost.estimatedCost.toFixed(4),
  session: state.sessionCost.estimatedCost.toFixed(4),
  totalTokens: state.totalCost.totalTokens,
  sessionTokens: state.sessionCost.totalTokens,
});
