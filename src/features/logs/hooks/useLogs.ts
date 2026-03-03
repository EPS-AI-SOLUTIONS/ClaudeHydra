// src/features/logs/hooks/useLogs.ts
import { useQuery } from '@tanstack/react-query';
import { apiDelete, apiGet } from '@/shared/api/client';

// ============================================
// TYPES
// ============================================

export interface BackendLogEntry {
  timestamp: string;
  level: string;
  target: string;
  message: string;
}

interface BackendLogsResponse {
  logs: BackendLogEntry[];
  total: number;
}

// ============================================
// HOOKS
// ============================================

function buildParams(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return '';
  return `?${entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')}`;
}

export function useBackendLogs(filters: { limit?: number; level?: string; search?: string }, autoRefresh: boolean) {
  const params = buildParams({
    limit: filters.limit,
    level: filters.level,
    search: filters.search,
  });

  return useQuery({
    queryKey: ['logs-backend', filters],
    queryFn: () => apiGet<BackendLogsResponse>(`/api/logs/backend${params}`),
    refetchInterval: autoRefresh ? 5000 : false,
    retry: 1,
    staleTime: 2000,
  });
}

export async function clearBackendLogs(): Promise<void> {
  await apiDelete('/api/logs/backend');
}
