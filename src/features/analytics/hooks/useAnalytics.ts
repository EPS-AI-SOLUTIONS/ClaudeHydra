// src/features/analytics/hooks/useAnalytics.ts
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/shared/api/client';

// ============================================
// TYPES
// ============================================

export interface DailyTokenUsage {
  day: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  request_count: number;
}

interface TokenUsageResponse {
  data: DailyTokenUsage[];
  days: number;
}

export interface DailyLatency {
  day: string;
  tier: string;
  avg_ms: number;
  p50_ms: number;
  p95_ms: number;
  request_count: number;
}

interface LatencyResponse {
  data: DailyLatency[];
  days: number;
}

export interface ModelSuccessRate {
  model: string;
  total: number;
  successes: number;
  failures: number;
  success_rate: number;
}

interface SuccessRateResponse {
  data: ModelSuccessRate[];
  days: number;
}

export interface ToolUsageStat {
  tool_name: string;
  usage_count: number;
  error_count: number;
  avg_duration_ms: number | null;
}

interface TopToolsResponse {
  data: ToolUsageStat[];
  days: number;
  limit: number;
}

export interface CostBreakdown {
  model: string;
  tier: string;
  input_tokens: number;
  output_tokens: number;
  input_cost_usd: number;
  output_cost_usd: number;
  total_cost_usd: number;
}

interface CostResponse {
  data: CostBreakdown[];
  total_cost_usd: number;
  projected_monthly_usd: number;
  days: number;
}

// ============================================
// HOOKS
// ============================================

const REFETCH_INTERVAL = 60_000; // 60 seconds

export function useTokenUsage(days: number) {
  return useQuery({
    queryKey: ['analytics-tokens', days],
    queryFn: () => apiGet<TokenUsageResponse>(`/api/analytics/tokens?days=${days}`),
    refetchInterval: REFETCH_INTERVAL,
    retry: 1,
    staleTime: 30_000,
  });
}

export function useLatency(days: number) {
  return useQuery({
    queryKey: ['analytics-latency', days],
    queryFn: () => apiGet<LatencyResponse>(`/api/analytics/latency?days=${days}`),
    refetchInterval: REFETCH_INTERVAL,
    retry: 1,
    staleTime: 30_000,
  });
}

export function useSuccessRate(days: number) {
  return useQuery({
    queryKey: ['analytics-success-rate', days],
    queryFn: () => apiGet<SuccessRateResponse>(`/api/analytics/success-rate?days=${days}`),
    refetchInterval: REFETCH_INTERVAL,
    retry: 1,
    staleTime: 30_000,
  });
}

export function useTopTools(days: number, limit = 10) {
  return useQuery({
    queryKey: ['analytics-top-tools', days, limit],
    queryFn: () => apiGet<TopToolsResponse>(`/api/analytics/top-tools?days=${days}&limit=${limit}`),
    refetchInterval: REFETCH_INTERVAL,
    retry: 1,
    staleTime: 30_000,
  });
}

export function useCostEstimate(days: number) {
  return useQuery({
    queryKey: ['analytics-cost', days],
    queryFn: () => apiGet<CostResponse>(`/api/analytics/cost?days=${days}`),
    refetchInterval: REFETCH_INTERVAL,
    retry: 1,
    staleTime: 30_000,
  });
}
