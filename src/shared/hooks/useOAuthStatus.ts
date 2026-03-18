/** Jaskier Shared Pattern — OAuth PKCE status hook */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { apiGet, apiPost } from '@/shared/api/client';
import type { OAuthCallbackResponse, OAuthLoginResponse, OAuthStatus } from '@/shared/api/schemas';

const OAUTH_DISMISSED_KEY = 'jaskier_oauth_dismissed';
const OAUTH_QUERY_KEY = ['oauth-status'] as const;

type OAuthPhase = 'idle' | 'waiting_code' | 'exchanging' | 'authenticated' | 'error';

interface UseOAuthStatusReturn {
  status: OAuthStatus | undefined;
  isLoading: boolean;
  phase: OAuthPhase;
  isDismissed: boolean;
  dismiss: () => void;
  login: () => void;
  submitCode: (callbackUrl: string) => void;
  logout: () => void;
  cancel: () => void;
  authUrl: string | null;
  errorMessage: string | null;
  isMutating: boolean;
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(OAUTH_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function parseCallbackUrl(input: string): { code: string; state: string } | null {
  try {
    const url = new URL(input.trim());
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (code && state) return { code, state };
    return null;
  } catch {
    return null;
  }
}

export function useOAuthStatus(): UseOAuthStatusReturn {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [localPhase, setLocalPhase] = useState<OAuthPhase>('idle');
  const [isDismissed, setIsDismissed] = useState(readDismissed);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: status, isLoading } = useQuery<OAuthStatus>({
    queryKey: OAUTH_QUERY_KEY,
    queryFn: () => apiGet<OAuthStatus>('/api/auth/status'),
    staleTime: 60_000,
    refetchInterval: 300_000,
    retry: 1,
  });

  // Derive phase from backend status + local state
  const phase: OAuthPhase = status?.authenticated && !status.expired ? 'authenticated' : localPhase;

  const loginMutation = useMutation({
    mutationFn: () => apiPost<OAuthLoginResponse>('/api/auth/login'),
    onSuccess: (data) => {
      setAuthUrl(data.auth_url);
      setErrorMessage(null);
      const win = window.open(data.auth_url, '_blank', 'noopener');
      if (!win) {
        toast.info(t('oauth.popupBlocked'));
      }
      setLocalPhase('waiting_code');
    },
    onError: () => {
      setErrorMessage(t('oauth.loginError'));
      toast.error(t('oauth.loginError'));
      setLocalPhase('error');
    },
  });

  const callbackMutation = useMutation({
    mutationFn: (params: { code: string; state: string }) =>
      apiPost<OAuthCallbackResponse>('/api/auth/callback', params),
    onSuccess: () => {
      setLocalPhase('idle');
      setAuthUrl(null);
      setErrorMessage(null);
      qc.invalidateQueries({ queryKey: OAUTH_QUERY_KEY });
      toast.success(t('oauth.loginSuccess'));
    },
    onError: () => {
      setErrorMessage(t('oauth.loginError'));
      toast.error(t('oauth.loginError'));
      setLocalPhase('error');
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiPost('/api/auth/logout'),
    onSuccess: () => {
      setLocalPhase('idle');
      setAuthUrl(null);
      setErrorMessage(null);
      qc.invalidateQueries({ queryKey: OAUTH_QUERY_KEY });
      toast.success(t('oauth.logoutSuccess'));
    },
  });

  const login = useCallback(() => {
    setErrorMessage(null);
    loginMutation.mutate();
  }, [loginMutation]);

  const submitCode = useCallback(
    (callbackUrl: string) => {
      const parsed = parseCallbackUrl(callbackUrl);
      if (!parsed) {
        toast.error(t('oauth.invalidUrl'));
        return;
      }
      setLocalPhase('exchanging');
      callbackMutation.mutate(parsed);
    },
    [callbackMutation, t],
  );

  const logout = useCallback(() => {
    logoutMutation.mutate();
  }, [logoutMutation]);

  const cancel = useCallback(() => {
    setLocalPhase('idle');
    setAuthUrl(null);
    setErrorMessage(null);
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(OAUTH_DISMISSED_KEY, 'true');
    } catch {
      /* ignore */
    }
    setIsDismissed(true);
  }, []);

  return {
    status,
    isLoading,
    phase,
    isDismissed,
    dismiss,
    login,
    submitCode,
    logout,
    cancel,
    authUrl,
    errorMessage,
    isMutating: loginMutation.isPending || callbackMutation.isPending || logoutMutation.isPending,
  };
}
