/** Jaskier Shared Pattern — Vault Health Monitoring Hook */
// useVaultStatus.ts — Hook for Jaskier Vault health & audit

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/shared/api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VaultHealth {
  online: boolean;
  credential_count: number;
  namespace_count: number;
  last_audit: string | null;
  encryption: string;
}

export interface AuditEntry {
  timestamp: string;
  action: string;
  namespace: string;
  service: string;
  result: 'success' | 'failed';
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

const VAULT_HEALTH_KEY = ['vault-health'] as const;
const VAULT_AUDIT_KEY = ['vault-audit'] as const;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useVaultStatus() {
  const queryClient = useQueryClient();

  // Health check with 60s polling
  const { data: health = null, isLoading: isHealthLoading } = useQuery<VaultHealth | null>({
    queryKey: VAULT_HEALTH_KEY,
    queryFn: () => apiGet<VaultHealth>('/api/vault/health'),
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });

  // Audit log with 60s polling
  const { data: auditLog = [], isLoading: isAuditLoading } = useQuery<AuditEntry[]>({
    queryKey: VAULT_AUDIT_KEY,
    queryFn: () => apiGet<AuditEntry[]>('/api/vault/audit'),
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });

  // Emergency panic mutation
  const panicMutation = useMutation({
    mutationFn: () => apiPost<void>('/api/vault/panic'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VAULT_HEALTH_KEY });
      queryClient.invalidateQueries({ queryKey: VAULT_AUDIT_KEY });
    },
  });

  // Rotate all credentials mutation
  const rotateMutation = useMutation({
    mutationFn: () => apiPost<void>('/api/vault/rotate'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VAULT_HEALTH_KEY });
      queryClient.invalidateQueries({ queryKey: VAULT_AUDIT_KEY });
    },
  });

  return {
    health,
    auditLog,
    isLoading: isHealthLoading || isAuditLoading,
    isOnline: health?.online ?? false,
    triggerPanic: () => panicMutation.mutateAsync(),
    rotateAll: () => rotateMutation.mutateAsync(),
  };
}
