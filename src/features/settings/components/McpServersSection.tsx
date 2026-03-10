/** Jaskier Shared Pattern — MCP Servers Settings Section */

import { cn } from '@jaskier/ui';
import { ChevronDown, ChevronRight, Network, Plus, Power, PowerOff, Trash2, Wrench } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button, Input } from '@/components/atoms';
import { useViewTheme } from '@/shared/hooks/useViewTheme';
import {
  type McpServer,
  useConnectMcpServer,
  useCreateMcpServer,
  useDeleteMcpServer,
  useDisconnectMcpServer,
  useMcpServers,
  useMcpServerTools,
} from '../hooks/useMcpServers';

// ── Add Server Form ──────────────────────────────────────────────────────────

function AddServerForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const createMutation = useCreateMcpServer();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [timeout, setTimeout] = useState(30);

  const handleSubmit = useCallback(async () => {
    if (!name.trim() || !url.trim()) return;
    try {
      await createMutation.mutateAsync({
        name: name.trim(),
        transport: 'http',
        url: url.trim(),
        auth_token: authToken.trim() || undefined,
        timeout_secs: timeout,
      });
      toast.success(t('mcp.serverAdded', 'MCP server added'));
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add server');
    }
  }, [name, url, authToken, timeout, createMutation, onClose, t]);

  return (
    <div className={cn('space-y-3 p-4 rounded-lg border', theme.border, theme.card)}>
      <Input
        placeholder={t('mcp.name', 'Server Name')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="font-mono text-sm"
      />
      <Input
        placeholder={t('mcp.url', 'Server URL (e.g. http://localhost:3000/mcp)')}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="font-mono text-sm"
      />
      <Input
        placeholder={t('mcp.authToken', 'Auth Token (optional)')}
        type="password"
        value={authToken}
        onChange={(e) => setAuthToken(e.target.value)}
        className="font-mono text-sm"
      />
      <div className="flex items-center gap-2">
        <label htmlFor="mcp-timeout" className={cn('text-xs font-mono', theme.textMuted)}>
          {t('mcp.timeout', 'Timeout (s)')}
        </label>
        <Input
          id="mcp-timeout"
          type="number"
          min={5}
          max={120}
          value={timeout}
          onChange={(e) => setTimeout(Number(e.target.value))}
          className="font-mono text-sm w-20"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={!name.trim() || !url.trim() || createMutation.isPending}>
          {createMutation.isPending ? t('common.loading', 'Loading...') : t('mcp.addServer', 'Add Server')}
        </Button>
      </div>
    </div>
  );
}

// ── Server Tools List ────────────────────────────────────────────────────────

function ServerToolsList({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const { data: tools, isLoading } = useMcpServerTools(serverId);

  if (isLoading) {
    return <p className={cn('text-xs font-mono pl-6', theme.textMuted)}>{t('common.loading', 'Loading...')}</p>;
  }

  if (!tools?.length) {
    return <p className={cn('text-xs font-mono pl-6', theme.textMuted)}>{t('mcp.noTools', 'No tools discovered')}</p>;
  }

  return (
    <div className="pl-6 space-y-1">
      {tools.map((tool) => (
        <div key={tool.id} className="flex items-start gap-2">
          <Wrench size={12} className="text-[var(--matrix-accent)] mt-0.5 shrink-0" />
          <div>
            <span className={cn('text-xs font-mono font-medium', theme.text)}>{tool.tool_name}</span>
            {tool.description && <p className={cn('text-[10px] font-mono', theme.textMuted)}>{tool.description}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Server Row ───────────────────────────────────────────────────────────────

function ServerRow({ server }: { server: McpServer }) {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const [expanded, setExpanded] = useState(false);
  const connectMutation = useConnectMcpServer();
  const disconnectMutation = useDisconnectMcpServer();
  const deleteMutation = useDeleteMcpServer();

  const isConnected = server.enabled;
  const busy = connectMutation.isPending || disconnectMutation.isPending || deleteMutation.isPending;

  const handleToggle = useCallback(async () => {
    try {
      if (isConnected) {
        await disconnectMutation.mutateAsync(server.id);
        toast.success(t('mcp.disconnected', 'Disconnected'));
      } else {
        await connectMutation.mutateAsync(server.id);
        toast.success(t('mcp.connected', 'Connected'));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Connection failed');
    }
  }, [isConnected, server.id, connectMutation, disconnectMutation, t]);

  const handleDelete = useCallback(async () => {
    try {
      await deleteMutation.mutateAsync(server.id);
      toast.success(t('mcp.deleted', 'Server removed'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  }, [server.id, deleteMutation, t]);

  return (
    <div className={cn('rounded-lg border p-3 space-y-2', theme.border)}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="p-0.5 hover:opacity-70 transition-opacity"
          aria-label="Toggle tools"
        >
          {expanded ? (
            <ChevronDown size={14} className={theme.textMuted} />
          ) : (
            <ChevronRight size={14} className={theme.textMuted} />
          )}
        </button>

        <div className={cn('w-2 h-2 rounded-full shrink-0', isConnected ? 'bg-emerald-400' : 'bg-zinc-500')} />

        <span className={cn('text-sm font-mono font-medium flex-1', theme.text)}>{server.name}</span>

        <span className={cn('text-[10px] font-mono', theme.textMuted)}>{server.url ?? server.command}</span>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleToggle}
          disabled={busy}
          aria-label={isConnected ? 'Disconnect' : 'Connect'}
        >
          {isConnected ? <PowerOff size={14} /> : <Power size={14} />}
        </Button>

        <Button variant="ghost" size="sm" onClick={handleDelete} disabled={busy} aria-label="Delete">
          <Trash2 size={14} className="text-red-400" />
        </Button>
      </div>

      {expanded && <ServerToolsList serverId={server.id} />}
    </div>
  );
}

// ── Main Section ─────────────────────────────────────────────────────────────

export const McpServersSection = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const { data: servers, isLoading } = useMcpServers();
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Network size={18} className="text-[var(--matrix-accent)]" />
          <h3 className={cn('text-sm font-semibold font-mono uppercase tracking-wider', theme.text)}>
            {t('mcp.title', 'MCP Servers')}
          </h3>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowAddForm(!showAddForm)}>
          <Plus size={14} />
          <span className="ml-1 text-xs">{t('mcp.addServer', 'Add Server')}</span>
        </Button>
      </div>

      <p className={cn('text-xs', theme.textMuted)}>
        {t('mcp.description', 'Connect external MCP servers to extend agent capabilities with additional tools.')}
      </p>

      {showAddForm && <AddServerForm onClose={() => setShowAddForm(false)} />}

      {isLoading && <p className={cn('text-xs font-mono', theme.textMuted)}>{t('common.loading', 'Loading...')}</p>}

      {!isLoading && !servers?.length && !showAddForm && (
        <p className={cn('text-xs font-mono', theme.textMuted)}>{t('mcp.noServers', 'No MCP servers configured')}</p>
      )}

      <div className="space-y-2">
        {servers?.map((server) => (
          <ServerRow key={server.id} server={server} />
        ))}
      </div>
    </div>
  );
});

McpServersSection.displayName = 'McpServersSection';
