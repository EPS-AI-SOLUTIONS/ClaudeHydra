/** Jaskier Shared Pattern — Google Auth status hook (API Key + OAuth) */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { apiDelete, apiGet, apiPost } from '@/shared/api/client';

// ── Types ──────────────────────────────────────────────────────────────

export interface GoogleAuthStatus {
  authenticated: boolean;
  method?: 'oauth' | 'api_key' | 'env';
  expired?: boolean;
  expires_at?: number;
  user_email?: string;
  user_name?: string;
  oauth_available?: boolean;
}

interface GoogleAuthLoginResponse {
  auth_url: string;
  state: string;
}

interface SaveApiKeyResponse {
  status: string;
  authenticated: boolean;
  valid: boolean;
}

export type GoogleAuthPhase = 'idle' | 'oauth_pending' | 'saving_key' | 'authenticated' | 'error';

export interface UseGoogleAuthStatusReturn {
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

const GOOGLE_AUTH_QUERY_KEY = ['google-auth-status'] as const;

export function useGoogleAuthStatus(): UseGoogleAuthStatusReturn {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [localPhase, setLocalPhase] = useState<GoogleAuthPhase>('idle');
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const { data: status, isLoading } = useQuery<GoogleAuthStatus>({
    queryKey: GOOGLE_AUTH_QUERY_KEY,
    queryFn: () => apiGet<GoogleAuthStatus>('/api/auth/google/status'),
    staleTime: 60_000,
    refetchInterval: 300_000,
    retry: 1,
  });

  const phase: GoogleAuthPhase = status?.authenticated && !status.expired ? 'authenticated' : localPhase;
  const authMethod = status?.method ?? null;

  // Stop polling when authenticated
  useEffect(() => {
    if (status?.authenticated && localPhase === 'oauth_pending') {
      stopPolling();
      setLocalPhase('idle');
      setAuthUrl(null);
      toast.success(t('googleAuth.loginSuccess'));
    }
  }, [status?.authenticated, localPhase, stopPolling, t]);

  // ── Google OAuth flow ──────────────────────────────────────────────
  const loginMutation = useMutation({
    mutationFn: () => apiPost<GoogleAuthLoginResponse>('/api/auth/google/login'),
    onSuccess: (data) => {
      setAuthUrl(data.auth_url);
      setErrorMessage(null);
      setLocalPhase('oauth_pending');

      const win = window.open(data.auth_url, '_blank', 'noopener');
      if (!win) {
        toast.info(t('googleAuth.popupBlocked'));
        // Don't start polling if popup was blocked — user must retry
        return;
      }

      // Start polling every 2s, auto-stop after 5 minutes
      stopPolling();
      pollRef.current = setInterval(() => {
        qc.invalidateQueries({ queryKey: GOOGLE_AUTH_QUERY_KEY });
      }, 2000);
      setTimeout(
        () => {
          if (pollRef.current) {
            stopPolling();
            setLocalPhase('idle');
            toast.info(t('googleAuth.loginTimeout', 'Login timed out — please try again'));
          }
        },
        5 * 60 * 1000,
      );
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : t('googleAuth.loginError');
      setErrorMessage(msg);
      toast.error(t('googleAuth.loginError'));
      setLocalPhase('error');
    },
  });

  // ── API Key flow ───────────────────────────────────────────────────
  const saveKeyMutation = useMutation({
    mutationFn: (key: string) => apiPost<SaveApiKeyResponse>('/api/auth/google/apikey', { api_key: key }),
    onMutate: () => {
      setLocalPhase('saving_key');
      setErrorMessage(null);
    },
    onSuccess: () => {
      setLocalPhase('idle');
      qc.invalidateQueries({ queryKey: GOOGLE_AUTH_QUERY_KEY });
      toast.success(t('googleAuth.apiKeySaved'));
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : t('googleAuth.invalidApiKey');
      setErrorMessage(msg);
      toast.error(t('googleAuth.invalidApiKey'));
      setLocalPhase('error');
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: () => apiDelete('/api/auth/google/apikey'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GOOGLE_AUTH_QUERY_KEY });
      toast.success(t('googleAuth.apiKeyDeleted'));
    },
  });

  // ── Logout ─────────────────────────────────────────────────────────
  const logoutMutation = useMutation({
    mutationFn: () => apiPost('/api/auth/google/logout'),
    onSuccess: () => {
      setLocalPhase('idle');
      setAuthUrl(null);
      setErrorMessage(null);
      qc.invalidateQueries({ queryKey: GOOGLE_AUTH_QUERY_KEY });
      toast.success(t('googleAuth.logoutSuccess'));
    },
  });

  const login = useCallback(() => {
    setErrorMessage(null);
    loginMutation.mutate();
  }, [loginMutation]);

  const saveApiKey = useCallback(
    (key: string) => {
      saveKeyMutation.mutate(key);
    },
    [saveKeyMutation],
  );

  const deleteApiKey = useCallback(() => {
    deleteKeyMutation.mutate();
  }, [deleteKeyMutation]);

  const logout = useCallback(() => {
    logoutMutation.mutate();
  }, [logoutMutation]);

  const cancel = useCallback(() => {
    stopPolling();
    setLocalPhase('idle');
    setAuthUrl(null);
    setErrorMessage(null);
  }, [stopPolling]);

  return {
    status,
    isLoading,
    phase,
    authMethod,
    login,
    saveApiKey,
    deleteApiKey,
    logout,
    cancel,
    authUrl,
    errorMessage,
    isMutating:
      loginMutation.isPending || saveKeyMutation.isPending || deleteKeyMutation.isPending || logoutMutation.isPending,
  };
}
