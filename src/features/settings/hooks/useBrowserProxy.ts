/** Jaskier Shared Pattern — Browser Proxy Status Hook */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiDelete } from '@/shared/api/client';

export interface BrowserProxyStatus {
  configured: boolean;
  reachable: boolean;
  proxy_url?: string;
  error?: string;
  health?: {
    ready: boolean;
    logged_in: boolean;
    workers_ready: number;
    workers_busy: number;
    pool_size: number;
    queue_length: number;
    total_requests: number;
    total_errors: number;
    uptime_seconds: number;
  };
  login?: {
    logged_in: boolean;
    login_in_progress: boolean;
    workers_ready: number;
    pool_size: number;
    last_login_error: string | null;
    auth_file_age_seconds: number | null;
  };
}

export function useBrowserProxyStatus(polling = false) {
  return useQuery<BrowserProxyStatus>({
    queryKey: ['browser-proxy-status'],
    queryFn: () => apiGet<BrowserProxyStatus>('/api/browser-proxy/status'),
    refetchInterval: polling ? 3000 : false,
    refetchOnWindowFocus: false,
  });
}

export function useBrowserProxyLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<{ status: string; message?: string }>('/api/browser-proxy/login'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['browser-proxy-status'] });
    },
  });
}

export function useBrowserProxyReinit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<{ status: string; workers_ready?: number }>('/api/browser-proxy/reinit'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['browser-proxy-status'] });
    },
  });
}

export function useBrowserProxyLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiDelete<{ status: string }>('/api/browser-proxy/logout'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['browser-proxy-status'] });
    },
  });
}
