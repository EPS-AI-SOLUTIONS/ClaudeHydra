/** Jaskier Shared Pattern — MCP Server hooks */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost } from '@/shared/api/client';

export interface McpServer {
  id: string;
  name: string;
  transport: 'http' | 'stdio';
  url?: string;
  command?: string;
  args?: string;
  enabled: boolean;
  timeout_secs: number;
  created_at: string;
  updated_at: string;
}

export interface McpDiscoveredTool {
  id: string;
  server_id: string;
  tool_name: string;
  description: string;
  discovered_at: string;
}

export function useMcpServers() {
  return useQuery<McpServer[]>({
    queryKey: ['mcp-servers'],
    queryFn: () => apiGet<McpServer[]>('/api/mcp/servers'),
    staleTime: 10_000,
  });
}

export function useMcpServerTools(serverId: string | null) {
  return useQuery<McpDiscoveredTool[]>({
    queryKey: ['mcp-server-tools', serverId],
    queryFn: () => apiGet<McpDiscoveredTool[]>(`/api/mcp/servers/${serverId}/tools`),
    enabled: !!serverId,
    staleTime: 30_000,
  });
}

export function useCreateMcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; transport: string; url?: string; auth_token?: string; timeout_secs?: number }) =>
      apiPost('/api/mcp/servers', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mcp-servers'] }),
  });
}

export function useDeleteMcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/mcp/servers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mcp-servers'] }),
  });
}

export function useConnectMcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost(`/api/mcp/servers/${id}/connect`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mcp-servers'] }),
  });
}

export function useDisconnectMcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost(`/api/mcp/servers/${id}/disconnect`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mcp-servers'] }),
  });
}
