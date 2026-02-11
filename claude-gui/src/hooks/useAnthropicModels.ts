import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useClaudeStore } from '../stores/claudeStore';
import type { AnthropicApiModel, AnthropicModel } from '../types/anthropic';

const isTauri = () =>
  typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);

/** Parse model ID into family and version */
function parseModelId(id: string): { family: string; version: string } {
  // claude-3-5-haiku-20241022 → family: "haiku", version: "3.5"
  const legacyMatch = id.match(/^claude-(\d+)-(\d+)-(\w+)-/);
  if (legacyMatch) {
    return { family: legacyMatch[3], version: `${legacyMatch[1]}.${legacyMatch[2]}` };
  }

  // claude-3-opus-20240229 → family: "opus", version: "3"
  const oldMatch = id.match(/^claude-(\d+)-(\w+)-/);
  if (oldMatch) {
    return { family: oldMatch[2], version: oldMatch[1] };
  }

  // claude-sonnet-4-20250514 → family: "sonnet", version: "4"
  const newMatch = id.match(/^claude-(\w+)-(\d+)-/);
  if (newMatch) {
    return { family: newMatch[1], version: newMatch[2] };
  }

  return { family: 'unknown', version: '0' };
}

/** Check if model ID represents Claude 3+ */
function isClaude3Plus(id: string): boolean {
  return (
    id.startsWith('claude-3') ||
    id.startsWith('claude-sonnet-4') ||
    id.startsWith('claude-opus-4') ||
    id.startsWith('claude-haiku-4')
  );
}

/** Normalize raw API models into frontend format */
function normalizeModels(raw: AnthropicApiModel[]): AnthropicModel[] {
  const models = raw
    .filter((m) => isClaude3Plus(m.id))
    .map((m) => {
      const { family, version } = parseModelId(m.id);
      return {
        id: m.id,
        displayName: m.display_name || m.id,
        provider: 'anthropic' as const,
        createdAt: m.created_at,
        family,
        version,
        isLatest: false,
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Mark latest model per family
  const seenFamilies = new Set<string>();
  for (const model of models) {
    if (!seenFamilies.has(model.family)) {
      model.isLatest = true;
      seenFamilies.add(model.family);
    }
  }

  return models;
}

/** Fetch models from Anthropic via the appropriate transport */
async function fetchAnthropicModels(apiKey: string): Promise<AnthropicModel[]> {
  if (isTauri() && apiKey) {
    // Desktop: Rust IPC (no CORS)
    const raw = await invoke<AnthropicApiModel[]>('anthropic_list_models', {
      apiKey,
    });
    return normalizeModels(raw);
  }

  // Browser: proxy endpoint (Vite dev proxy or Vercel Edge Function)
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const response = await fetch('/api/anthropic-models', { headers });
  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status}`);
  }

  const data = await response.json();

  // Edge Function returns normalized data, dev server returns raw
  if (Array.isArray(data) && data[0]?.provider === 'anthropic') {
    return data as AnthropicModel[];
  }

  // Raw API response (from dev server)
  const raw: AnthropicApiModel[] = data.data || data;
  return normalizeModels(raw);
}

export function useAnthropicModels() {
  const anthropicKey = useClaudeStore((s) => s.apiKeys.anthropic);

  const query = useQuery({
    queryKey: ['anthropic-models', anthropicKey ? 'keyed' : 'server'],
    queryFn: () => fetchAnthropicModels(anthropicKey),
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });

  return {
    models: query.data ?? [],
    latestModels: (query.data ?? []).filter((m) => m.isLatest),
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}
