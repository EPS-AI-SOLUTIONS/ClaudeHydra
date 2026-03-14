/** Jaskier Shared Pattern — Unified AI Provider Management Hook */
// useAiProviders.ts — Replaces: useOAuthStatus + useGoogleAuthStatus
// Uses: TanStack Query with 30s polling

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { apiGet, apiPost } from '@/shared/api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProviderInfo {
  provider: string;
  plan_name: string;
  auth_type: 'oauth_pkce' | 'session_token' | 'cookie_session' | 'api_key_via_vault' | 'none';
  is_connected: boolean;
  plan_tier: string | null;
  monthly_cost_cents: number;
  last_verified: string | null;
  last_error: string | null;
}

export interface ConnectResponse {
  authorize_url?: string;
  message?: string;
  provider: string;
}

export interface TestResult {
  success: boolean;
  latency_ms: number;
  model_used?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Query key
// ---------------------------------------------------------------------------

const AI_PROVIDERS_KEY = ['ai-providers'] as const;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAiProviders() {
  const queryClient = useQueryClient();

  // Fetch all providers with 30s polling
  const {
    data: providers = [],
    isLoading,
    error,
  } = useQuery<ProviderInfo[]>({
    queryKey: AI_PROVIDERS_KEY,
    queryFn: () => apiGet<ProviderInfo[]>('/api/ai/providers'),
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });

  // Connect mutation
  const connectMutation = useMutation({
    mutationFn: (provider: string) => apiPost<ConnectResponse>(`/api/ai/providers/${provider}/connect`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AI_PROVIDERS_KEY });
    },
  });

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: (provider: string) => apiPost<void>(`/api/ai/providers/${provider}/disconnect`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AI_PROVIDERS_KEY });
    },
  });

  // Test mutation
  const testMutation = useMutation({
    mutationFn: (provider: string) => apiPost<TestResult>(`/api/ai/providers/${provider}/test`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AI_PROVIDERS_KEY });
    },
  });

  // Refresh mutation
  const refreshMutation = useMutation({
    mutationFn: (provider: string) => apiPost<void>(`/api/ai/providers/${provider}/refresh`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AI_PROVIDERS_KEY });
    },
  });

  // Derived values
  const totalMonthlyCost = useMemo(
    () => providers.filter((p) => p.is_connected).reduce((sum, p) => sum + p.monthly_cost_cents, 0),
    [providers],
  );

  const connectedCount = useMemo(() => providers.filter((p) => p.is_connected).length, [providers]);

  return {
    providers,
    isLoading,
    error: error as Error | null,
    connectProvider: (provider: string) => connectMutation.mutateAsync(provider),
    disconnectProvider: (provider: string) => disconnectMutation.mutateAsync(provider),
    testProvider: (provider: string) => testMutation.mutateAsync(provider),
    refreshProvider: (provider: string) => refreshMutation.mutateAsync(provider),
    totalMonthlyCost,
    connectedCount,
  };
}
