/**
 * TanStack Query v5 client instance for ClaudeHydra v4.
 * Shared across the entire application via QueryClientProvider.
 */

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors or avoid multiple retries on 500
        if (error instanceof Error && 'status' in error) {
          const status = (error as Record<string, unknown>)['status'] as number;
          if (status >= 400 && status < 500) return false;
          if (status >= 500) return failureCount < 1; // max 1 retry for 500 errors
        }
        return failureCount < 3;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
