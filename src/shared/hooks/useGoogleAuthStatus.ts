/**
 * ClaudeHydra — Google Auth status hook.
 * Thin wrapper around @jaskier/core useAuthStatus with CH-specific Google OAuth paths.
 */

import type { AuthPhase } from '@jaskier/core';
import { useAuthStatus } from '@jaskier/core';
import { apiDelete, apiGet, apiPost } from '@/shared/api/client';

// Re-export phase type for backward compatibility
type GoogleAuthPhase = AuthPhase;

interface GoogleAuthStatus {
  authenticated: boolean;
  method?: 'oauth' | 'api_key' | 'env';
  expired?: boolean;
  expires_at?: number;
  user_email?: string;
  user_name?: string;
  oauth_available?: boolean;
}

interface UseGoogleAuthStatusReturn {
  status: GoogleAuthStatus | undefined;
  isLoading: boolean;
  phase: GoogleAuthPhase;
  authMethod: 'oauth' | 'api_key' | 'env' | null;
  login: () => void;
  saveApiKey: (key: string) => void;
  deleteApiKey: () => void;
  logout: () => void;
  cancel: () => void;
  authUrl: string | null;
  errorMessage: string | null;
  isMutating: boolean;
}

const GOOGLE_AUTH_CONFIG = {
  paths: {
    status: '/api/auth/google/status',
    login: '/api/auth/google/login',
    logout: '/api/auth/google/logout',
    apikey: '/api/auth/google/apikey',
  },
  i18nPrefix: 'googleAuth',
  queryKey: ['google-auth-status'] as const,
  dismissedKey: 'jaskier_google_auth_dismissed',
  apiClient: { apiGet, apiPost, apiDelete },
} as const;

export function useGoogleAuthStatus(): UseGoogleAuthStatusReturn {
  const result = useAuthStatus(GOOGLE_AUTH_CONFIG);
  return {
    ...result,
    // Cast to strongly-typed GoogleAuthStatus for CH consumers
    status: result.status as GoogleAuthStatus | undefined,
  };
}
