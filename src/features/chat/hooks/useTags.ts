/**
 * useTags — TanStack Query hooks for session tagging and full-text search.
 *
 * Endpoints:
 * - GET    /api/sessions/:id/tags       — tags for a session
 * - POST   /api/sessions/:id/tags       — add tags
 * - DELETE /api/sessions/:id/tags/:tag  — remove a tag
 * - GET    /api/sessions/search         — full-text search + tag filter
 * - GET    /api/tags                    — all unique tags with counts
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiDelete, apiGet, apiPost } from '@/shared/api/client';

// ── Types ────────────────────────────────────────────────────────────────

interface SessionTagsResponse {
  session_id: string;
  tags: string[];
}

interface TagCount {
  tag: string;
  count: number;
}

interface AllTagsResponse {
  tags: TagCount[];
}

interface SearchResult {
  session_id: string;
  session_title: string;
  message_id: string | null;
  message_preview: string | null;
  message_role: string | null;
  message_timestamp: string | null;
  tags: string[];
  rank: number | null;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string | null;
  tags: string[];
}

// ── Queries ──────────────────────────────────────────────────────────────

/** GET /api/sessions/:id/tags — fetch tags for a single session */
export function useSessionTagsQuery(sessionId: string | null) {
  return useQuery<SessionTagsResponse>({
    queryKey: ['session-tags', sessionId],
    queryFn: () => apiGet<SessionTagsResponse>(`/api/sessions/${sessionId}/tags`),
    enabled: !!sessionId,
    staleTime: 30_000,
  });
}

/** GET /api/tags — all unique tags with counts */
export function useAllTagsQuery() {
  return useQuery<AllTagsResponse>({
    queryKey: ['all-tags'],
    queryFn: () => apiGet<AllTagsResponse>('/api/tags'),
    staleTime: 60_000,
  });
}

/** GET /api/sessions/search — full-text search + tag filter */
export function useSearchQuery(query: string, tags: string[], enabled = true) {
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  if (tags.length > 0) params.set('tags', tags.join(','));

  const hasSearch = query.trim().length > 0 || tags.length > 0;

  return useQuery<SearchResponse>({
    queryKey: ['session-search', query, tags],
    queryFn: () => apiGet<SearchResponse>(`/api/sessions/search?${params.toString()}`),
    enabled: enabled && hasSearch,
    staleTime: 15_000,
  });
}

// ── Mutations ────────────────────────────────────────────────────────────

/** POST /api/sessions/:id/tags — add tags to a session */
export function useAddTagsMutation() {
  const queryClient = useQueryClient();

  return useMutation<SessionTagsResponse, Error, { sessionId: string; tags: string[] }>({
    mutationFn: ({ sessionId, tags }) => apiPost<SessionTagsResponse>(`/api/sessions/${sessionId}/tags`, { tags }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['session-tags', variables.sessionId] });
      void queryClient.invalidateQueries({ queryKey: ['all-tags'] });
      void queryClient.invalidateQueries({ queryKey: ['session-search'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to add tags');
    },
  });
}

/** DELETE /api/sessions/:id/tags/:tag — remove a tag */
export function useRemoveTagMutation() {
  const queryClient = useQueryClient();

  return useMutation<{ session_id: string; removed: string }, Error, { sessionId: string; tag: string }>({
    mutationFn: ({ sessionId, tag }) =>
      apiDelete<{ session_id: string; removed: string }>(`/api/sessions/${sessionId}/tags/${encodeURIComponent(tag)}`),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['session-tags', variables.sessionId] });
      void queryClient.invalidateQueries({ queryKey: ['all-tags'] });
      void queryClient.invalidateQueries({ queryKey: ['session-search'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to remove tag');
    },
  });
}
