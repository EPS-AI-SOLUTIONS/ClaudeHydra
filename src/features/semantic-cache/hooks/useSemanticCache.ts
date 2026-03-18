/**
 * useSemanticCache — TanStack Query hooks for the Semantic Cache API.
 *
 * Provides reactive data fetching for cache stats, health, config, and entries.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const API_BASE = '/api/semantic-cache';

// ── Types ────────────────────────────────────────────────────────────────────

interface CacheMetrics {
  total_queries: number;
  exact_hits: number;
  partial_hits: number;
  misses: number;
  hit_rate: number;
  exact_hit_rate: number;
  tokens_saved: number;
  estimated_cost_saved_usd: number;
  avg_search_latency_ms: number;
  uptime_seconds: number;
}

interface CollectionStats {
  points_count: number;
  segments_count: number;
  status: string;
  vectors_count: number;
}

interface CacheStatsResponse {
  metrics: CacheMetrics;
  collection: CollectionStats | null;
}

interface CacheHealthResponse {
  qdrant_reachable: boolean;
  embedding_configured: boolean;
  cache_enabled: boolean;
  collection_exists: boolean;
}

interface CacheConfig {
  qdrant_url: string;
  collection_name: string;
  embedding_model: string;
  vector_size: number;
  exact_hit_threshold: number;
  partial_hit_threshold: number;
  ttl_seconds: number;
  enabled: boolean;
  max_entries: number;
  cost_per_million_input_tokens: number;
  cost_per_million_output_tokens: number;
}

export interface CacheEntry {
  id: string;
  query_preview: string;
  model: string;
  provider: string;
  token_count: number;
  hit_count: number;
  created_at: string;
  ttl_expires_at: string;
}

interface CacheEntriesResponse {
  entries: CacheEntry[];
  next_offset: string | null;
  total_estimate: number;
}

// ── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
  return resp.json();
}

// ── Hooks ────────────────────────────────────────────────────────────────────

/** Cache stats + collection info — polls every 10s */
export function useCacheStats() {
  return useQuery<CacheStatsResponse>({
    queryKey: ['semantic-cache', 'stats'],
    queryFn: () => fetchJson(`${API_BASE}/stats`),
    refetchInterval: 10_000,
    retry: 1,
  });
}

/** Qdrant + embedding health check */
export function useCacheHealth() {
  return useQuery<CacheHealthResponse>({
    queryKey: ['semantic-cache', 'health'],
    queryFn: () => fetchJson(`${API_BASE}/health`),
    refetchInterval: 30_000,
    retry: 1,
  });
}

/** Current configuration */
export function useCacheConfig() {
  return useQuery<CacheConfig>({
    queryKey: ['semantic-cache', 'config'],
    queryFn: () => fetchJson(`${API_BASE}/config`),
  });
}

/** Update cache configuration */
export function useUpdateConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (config: Partial<CacheConfig>) => {
      const resp = await fetch(`${API_BASE}/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['semantic-cache'] });
    },
  });
}

/** List cached entries (paginated) */
export function useCacheEntries(limit = 20, offset?: string) {
  return useQuery<CacheEntriesResponse>({
    queryKey: ['semantic-cache', 'entries', limit, offset],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (offset) params.set('offset', offset);
      return fetchJson(`${API_BASE}/entries?${params}`);
    },
  });
}

/** Delete a specific cache entry */
export function useDeleteEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const resp = await fetch(`${API_BASE}/entries/${id}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['semantic-cache'] });
    },
  });
}

/** Invalidate cache — by git commit or flush all */
export function useInvalidateCache() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { git_commit_hash?: string; flush_all?: boolean }) => {
      const resp = await fetch(`${API_BASE}/invalidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['semantic-cache'] });
    },
  });
}

/** Compress code on demand */
export function useCompressCode() {
  return useMutation({
    mutationFn: async (params: { path: string; content: string }) => {
      const resp = await fetch(`${API_BASE}/compress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json();
    },
  });
}
