import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useState } from 'react';

// Check if running in Tauri (v2 uses __TAURI_INTERNALS__)
const isTauri = () =>
  typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);

import {
  Check,
  Clock,
  FileText,
  Globe,
  Loader2,
  RefreshCw,
  Settings,
  Shield,
  ShieldCheck,
  ShieldOff,
  Terminal,
  X,
} from 'lucide-react';

interface BridgeRequest {
  id: string;
  message: string;
  type: 'command' | 'file' | 'network' | 'system';
  status: 'pending' | 'approved' | 'rejected';
  timestamp: string;
}

interface BridgeData {
  auto_approve: boolean;
  requests: BridgeRequest[];
  settings: {
    poll_interval_ms: number;
    max_pending_requests: number;
    timeout_ms: number;
  };
}

const TYPE_ICONS = {
  command: Terminal,
  file: FileText,
  network: Globe,
  system: Settings,
};

const TYPE_COLORS = {
  command: 'text-green-400',
  file: 'text-blue-400',
  network: 'text-purple-400',
  system: 'text-orange-400',
};

export function BridgePanel() {
  const [data, setData] = useState<BridgeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch bridge state
  const fetchData = useCallback(async () => {
    if (!isTauri()) return; // Skip in browser mode
    try {
      const result = await invoke<BridgeData>('get_bridge_state');
      setData(result);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  // Toggle auto-approve
  const toggleAutoApprove = useCallback(async () => {
    if (!data) return;
    setLoading(true);
    try {
      const result = await invoke<BridgeData>('set_bridge_auto_approve', {
        enabled: !data.auto_approve,
      });
      setData(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [data]);

  // Approve request
  const approveRequest = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const result = await invoke<BridgeData>('approve_bridge_request', { id });
      setData(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Reject request
  const rejectRequest = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const result = await invoke<BridgeData>('reject_bridge_request', { id });
      setData(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll every 2 seconds
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const pendingRequests = data?.requests.filter((r) => r.status === 'pending') || [];

  // Format relative time
  const getRelativeTime = (timestamp: string): string => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  };

  return (
    <div className="flex flex-col h-full bg-matrix-bg-secondary/50 rounded-lg border border-matrix-border">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-matrix-border">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-matrix-accent" />
          <span className="text-sm font-semibold text-matrix-text">Bridge IPC</span>
          {pendingRequests.length > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] bg-yellow-500/20 text-yellow-400 rounded-full">
              {pendingRequests.length} pending
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh button */}
          <button
            onClick={fetchData}
            className="p-1.5 rounded hover:bg-matrix-accent/20 text-matrix-text-dim hover:text-matrix-accent transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>

          {/* Auto-approve toggle */}
          <button
            onClick={toggleAutoApprove}
            disabled={loading}
            className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors ${
              data?.auto_approve
                ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
            }`}
            title={data?.auto_approve ? 'Auto-approve ON' : 'Auto-approve OFF'}
          >
            {loading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : data?.auto_approve ? (
              <ShieldCheck size={12} />
            ) : (
              <ShieldOff size={12} />
            )}
            {data?.auto_approve ? 'YOLO Mode' : 'Safe Mode'}
          </button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/20 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Requests list */}
      <div className="flex-1 overflow-auto p-2 space-y-2">
        {pendingRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-matrix-text-dim">
            <Shield size={32} className="mb-2 opacity-30" />
            <span className="text-xs">No pending requests</span>
            <span className="text-[10px] opacity-50 mt-1">
              CLI commands will appear here for approval
            </span>
          </div>
        ) : (
          pendingRequests.map((request) => {
            const TypeIcon = TYPE_ICONS[request.type];
            const typeColor = TYPE_COLORS[request.type];

            return (
              <div
                key={request.id}
                className="p-3 bg-matrix-bg-primary/50 rounded-lg border border-matrix-border hover:border-matrix-accent/30 transition-colors"
              >
                {/* Request header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <TypeIcon size={14} className={typeColor} />
                    <span className="text-[10px] font-mono text-matrix-text-dim">{request.id}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-matrix-text-dim">
                    <Clock size={10} />
                    {getRelativeTime(request.timestamp)}
                  </div>
                </div>

                {/* Request message */}
                <div className="text-xs text-matrix-text font-mono bg-black/20 p-2 rounded mb-3 max-h-20 overflow-auto">
                  {request.message}
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => approveRequest(request.id)}
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition-colors disabled:opacity-50"
                  >
                    <Check size={12} />
                    Approve
                  </button>
                  <button
                    onClick={() => rejectRequest(request.id)}
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors disabled:opacity-50"
                  >
                    <X size={12} />
                    Reject
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer stats */}
      <div className="px-3 py-2 border-t border-matrix-border text-[10px] text-matrix-text-dim flex justify-between">
        <span>Poll: {data?.settings.poll_interval_ms || 2000}ms</span>
        <span>Timeout: {Math.floor((data?.settings.timeout_ms || 300000) / 1000)}s</span>
      </div>
    </div>
  );
}
