/**
 * useMemoryPruning — TanStack Query hooks for the Memory Pruning API.
 *
 * Provides reactive data fetching for pruning stats, history, config, and cycle details.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const API_BASE = '/api/memory/prune';

// ── Types ────────────────────────────────────────────────────────────────────

interface PruningMetrics {
  total_cycles: number;
  total_deleted: number;
  total_merged: number;
  total_kept: number;
  total_tokens_saved: number;
  total_clusters_found: number;
  last_cycle_duration_ms: number;
  uptime_seconds: number;
}

interface PruningStatsResponse {
  metrics: PruningMetrics;
  is_running: boolean;
}

export interface PruneCycleSummary {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'completed' | 'failed';
  total_entries: number;
  deleted_count: number;
  merged_count: number;
  kept_count: number;
  clusters_found: number;
  tokens_saved: number;
  error: string | null;
  triggered_by: string;
}

export interface PruneLogEntry {
  entity_name: string;
  action: 'delete' | 'merge' | 'keep' | 'archive';
  reason: string;
  similarity_score: number | null;
  merged_into: string | null;
  tokens_before: number;
  tokens_after: number;
}

interface PruningConfig {
  enabled: boolean;
  similarity_threshold: number;
  min_age_hours: number;
  max_memory_entries: number;
  auto_prune_interval_secs: number;
  max_cluster_size: number;
}

// ── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
  return resp.json();
}

// ── Hooks ────────────────────────────────────────────────────────────────────

/** Pruning metrics + running status — polls every 10s */
export function usePruningStats() {
  return useQuery<PruningStatsResponse>({
    queryKey: ['memory-pruning', 'stats'],
    queryFn: () => fetchJson(`${API_BASE}/stats`),
    refetchInterval: 10_000,
    retry: 1,
  });
}

/** Pruning cycle history */
export function usePruningHistory(limit = 20) {
  return useQuery<{ cycles: PruneCycleSummary[] }>({
    queryKey: ['memory-pruning', 'history', limit],
    queryFn: () => fetchJson(`${API_BASE}/history?limit=${limit}`),
    refetchInterval: 30_000,
  });
}

/** Detailed log entries for a specific pruning cycle */
export function usePruningDetails(cycleId: string | null) {
  return useQuery<{ entries: PruneLogEntry[] }>({
    queryKey: ['memory-pruning', 'details', cycleId],
    queryFn: () => fetchJson(`${API_BASE}/details/${cycleId}`),
    enabled: !!cycleId,
  });
}

/** Current pruning configuration */
export function usePruningConfig() {
  return useQuery<PruningConfig>({
    queryKey: ['memory-pruning', 'config'],
    queryFn: () => fetchJson(`${API_BASE}/config`),
  });
}

/** Update pruning configuration */
export function useUpdatePruningConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (config: Partial<PruningConfig>) => {
      const resp = await fetch(`${API_BASE}/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memory-pruning'] });
    },
  });
}

/** Trigger a manual pruning cycle */
export function useTriggerPrune() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const resp = await fetch(`${API_BASE}`, {
        method: 'POST',
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json();
    },
    onSuccess: () => {
      // Refresh stats and history after triggering
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['memory-pruning'] });
      }, 1000);
    },
  });
}
