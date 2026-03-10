/** Jaskier Shared Pattern */
// src/features/health/hooks/useHealthDashboard.ts
/**
 * ClaudeHydra v4 - Health Dashboard Hook
 * ========================================
 * Aggregates health, auth mode, system stats, and model count
 * for the HealthDashboard component. Reuses existing TanStack Query hooks
 * where available and adds new lightweight queries.
 */

import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiGetPolling } from '@/shared/api/client';
import { useHealthQuery, useSystemStatsQuery } from './useHealth';

// ============================================================================
// TYPES & SCHEMAS
// ============================================================================

const AuthModeSchema = z.object({
  auth_required: z.boolean(),
});
type AuthMode = z.infer<typeof AuthModeSchema>;

const ModelsResponseSchema = z
  .object({
    providers: z.record(z.string(), z.array(z.unknown())).optional(),
  })
  .passthrough();
type ModelsResponse = z.infer<typeof ModelsResponseSchema>;

interface HealthDashboardData {
  backendOnline: boolean;
  uptimeSeconds: number | null;
  authRequired: boolean | null;
  cpuUsage: number | null;
  memoryUsedMb: number | null;
  memoryTotalMb: number | null;
  modelCount: number | null;
  metrics: unknown;
  audit: unknown;
  loading: boolean;
  error: boolean;
  refetch: () => void;
}

// ============================================================================
// HOOK
// ============================================================================

export function useHealthDashboard(): HealthDashboardData {
  const healthQuery = useHealthQuery();
  const backendOnline = !!healthQuery.data && !healthQuery.isError;

  const statsQuery = useSystemStatsQuery(backendOnline);

  const authQuery = useQuery<AuthMode>({
    queryKey: ['auth', 'mode'],
    queryFn: async () => {
      const data = await apiGetPolling<unknown>('/api/auth/mode');
      return AuthModeSchema.parse(data);
    },
    refetchInterval: 60_000,
    retry: (failureCount) => failureCount < 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    enabled: backendOnline, // don't poll when backend is down
  });

  const modelsQuery = useQuery<ModelsResponse>({
    queryKey: ['models', 'list'],
    queryFn: async () => {
      const data = await apiGetPolling<unknown>('/api/models');
      return ModelsResponseSchema.parse(data);
    },
    refetchInterval: 60_000,
    retry: (failureCount) => failureCount < 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    enabled: backendOnline, // don't poll when backend is down
  });

  const metricsQuery = useQuery<unknown>({
    queryKey: ['system', 'metrics'],
    queryFn: () => apiGetPolling<unknown>('/api/system/metrics'),
    refetchInterval: 60_000,
    retry: (failureCount) => failureCount < 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    enabled: backendOnline,
  });

  const auditQuery = useQuery<unknown>({
    queryKey: ['system', 'audit'],
    queryFn: () => apiGetPolling<unknown>('/api/system/audit'),
    refetchInterval: 60_000,
    retry: (failureCount) => failureCount < 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    enabled: backendOnline,
  });
  const uptimeSeconds = healthQuery.data?.uptime_seconds ?? null;
  const authRequired = authQuery.data?.auth_required ?? null;
  const cpuUsage = statsQuery.data?.cpu_usage ?? null;
  const memoryUsedMb = statsQuery.data?.memory_used_mb ?? null;
  const memoryTotalMb = statsQuery.data?.memory_total_mb ?? null;
  const modelCount = modelsQuery.data?.providers
    ? Object.values(modelsQuery.data.providers).reduce(
        (sum: number, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
        0,
      )
    : null;
  const loading = healthQuery.isLoading || statsQuery.isLoading;
  const error = healthQuery.isError && statsQuery.isError;
  const metrics = metricsQuery.data ?? null;
  const audit = auditQuery.data ?? null;

  const refetch = () => {
    void healthQuery.refetch();
    void statsQuery.refetch();
    void authQuery.refetch();
    void modelsQuery.refetch();
    void metricsQuery.refetch();
    void auditQuery.refetch();
  };

  return {
    backendOnline,
    uptimeSeconds,
    authRequired,
    cpuUsage,
    memoryUsedMb,
    memoryTotalMb,
    modelCount,
    metrics,
    audit,
    loading,
    error,
    refetch,
  };
}
