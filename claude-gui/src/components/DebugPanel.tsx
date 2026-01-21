/**
 * Debug LiveView Panel
 * Real-time system monitoring and debugging for Claude GUI
 *
 * Features:
 * - Live stats streaming (memory, CPU, tasks, IPC)
 * - Log viewer with level filtering
 * - IPC call history
 * - Performance metrics
 * - Threshold alerts for CPU/Memory/IPC latency
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import {
  Bug,
  Activity,
  Cpu,
  MemoryStick,
  Clock,
  Zap,
  Terminal,
  RefreshCw,
  Trash2,
  Play,
  Pause,
  AlertTriangle,
  Info,
  AlertCircle,
  ChevronDown,
  Database,
  Gauge,
  Search,
  Bell,
  Settings,
  X,
} from 'lucide-react';
import {
  debugIpc,
  type DebugStats,
  type LogEntry,
  type IpcCall,
  type LogLevel,
} from '../lib/ipc';
import { NetworkPanel, TaskQueuePanel, LogDetailModal, PerformanceHeatmap } from './debug';

// ============================================================================
// Alert Types and Components
// ============================================================================

interface AlertConfig {
  memoryPercent: number;
  cpuPercent: number;
  ipcLatencyMs: number;
  enabled: boolean;
}

interface AlertBannerProps {
  alerts: string[];
}

function AlertBanner({ alerts }: AlertBannerProps) {
  if (alerts.length === 0) return null;
  return (
    <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-2 mb-4">
      <div className="flex items-center gap-2 text-red-400">
        <Bell size={14} className="animate-pulse" />
        <span className="text-xs font-semibold">Active Alerts ({alerts.length})</span>
      </div>
      <div className="mt-1 space-y-1">
        {alerts.map((alert, i) => (
          <div key={i} className="text-[10px] text-red-300 flex items-center gap-1">
            <AlertTriangle size={10} />
            {alert}
          </div>
        ))}
      </div>
    </div>
  );
}

interface AlertConfigPopupProps {
  config: AlertConfig;
  onConfigChange: (config: AlertConfig) => void;
  onClose: () => void;
}

function AlertConfigPopup({ config, onConfigChange, onClose }: AlertConfigPopupProps) {
  return (
    <div className="absolute top-12 right-0 z-50 glass-card p-4 w-64 shadow-lg border border-matrix-border">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-matrix-text">Alert Settings</span>
        <button onClick={onClose} className="text-matrix-text-dim hover:text-matrix-text">
          <X size={14} />
        </button>
      </div>

      <div className="space-y-3">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => onConfigChange({ ...config, enabled: e.target.checked })}
            className="w-3 h-3 accent-matrix-accent"
          />
          <span className="text-matrix-text">Enable Alerts</span>
        </label>

        <div className="space-y-1">
          <label className="text-[10px] text-matrix-text-dim">Memory Threshold (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            value={config.memoryPercent}
            onChange={(e) => onConfigChange({ ...config, memoryPercent: Number(e.target.value) })}
            className="glass-input w-full text-xs px-2 py-1"
            disabled={!config.enabled}
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-matrix-text-dim">CPU Threshold (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            value={config.cpuPercent}
            onChange={(e) => onConfigChange({ ...config, cpuPercent: Number(e.target.value) })}
            className="glass-input w-full text-xs px-2 py-1"
            disabled={!config.enabled}
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-matrix-text-dim">IPC Latency Threshold (ms)</label>
          <input
            type="number"
            min={0}
            max={10000}
            value={config.ipcLatencyMs}
            onChange={(e) => onConfigChange({ ...config, ipcLatencyMs: Number(e.target.value) })}
            className="glass-input w-full text-xs px-2 py-1"
            disabled={!config.enabled}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  icon: React.ElementType;
  color: string;
}

function StatCard({ label, value, subValue, icon: Icon, color }: StatCardProps) {
  return (
    <div className="glass-card p-2 flex flex-col">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} className={color} />
        <span className="text-[10px] text-matrix-text-dim">{label}</span>
      </div>
      <div className={`text-lg font-mono font-bold ${color}`}>{value}</div>
      {subValue && (
        <div className="text-[9px] text-matrix-text-dim">{subValue}</div>
      )}
    </div>
  );
}

interface LogLevelBadgeProps {
  level: LogLevel;
}

function LogLevelBadge({ level }: LogLevelBadgeProps) {
  const config: Record<LogLevel, { icon: React.ElementType; color: string }> = {
    debug: { icon: Bug, color: 'text-gray-400 bg-gray-400/10' },
    info: { icon: Info, color: 'text-blue-400 bg-blue-400/10' },
    warn: { icon: AlertTriangle, color: 'text-yellow-400 bg-yellow-400/10' },
    error: { icon: AlertCircle, color: 'text-red-400 bg-red-400/10' },
  };

  const { icon: Icon, color } = config[level] || config.info;

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] uppercase font-mono ${color}`}>
      <Icon size={10} />
      {level}
    </span>
  );
}

// Highlight function for search matches
function highlightText(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escapedQuery})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="bg-yellow-400/30 text-yellow-300 px-0.5 rounded">{part}</mark>
      : part
  );
}

interface LogViewerProps {
  logs: LogEntry[];
  maxHeight?: string;
  searchQuery?: string;
  onLogClick?: (log: LogEntry) => void;
}

function LogViewer({ logs, maxHeight = '300px', searchQuery = '', onLogClick }: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const formatTime = (ts: number) => {
    const date = new Date(ts);
    const time = date.toLocaleTimeString('pl-PL', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const ms = String(date.getMilliseconds()).padStart(3, '0');
    return `${time}.${ms}`;
  };

  if (logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-matrix-text-dim text-xs italic">
        <Terminal size={16} className="mr-2 opacity-50" />
        Brak logow
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="overflow-auto font-mono text-[11px] bg-matrix-bg-primary/30 rounded border border-matrix-border"
        style={{ maxHeight }}
        onScroll={(e) => {
          const target = e.target as HTMLDivElement;
          const atBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 10;
          setAutoScroll(atBottom);
        }}
      >
        {logs.map((log) => (
          <div
            key={log.id}
            className="flex items-start gap-2 px-2 py-1 hover:bg-matrix-bg-secondary/30 border-b border-matrix-border/30 cursor-pointer"
            onClick={() => onLogClick?.(log)}
          >
            <span className="text-matrix-text-dim shrink-0">{formatTime(log.timestamp)}</span>
            <LogLevelBadge level={log.level} />
            <span className="text-matrix-accent shrink-0">[{highlightText(log.source, searchQuery)}]</span>
            <span className="text-matrix-text break-all">{highlightText(log.message, searchQuery)}</span>
            {log.details && (
              <span className="text-matrix-text-dim text-[9px] ml-auto shrink-0" title={log.details}>
                +details
              </span>
            )}
          </div>
        ))}
      </div>
      {!autoScroll && (
        <button
          onClick={() => {
            setAutoScroll(true);
            containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' });
          }}
          className="absolute bottom-2 right-2 glass-button p-1 text-[10px]"
        >
          <ChevronDown size={12} />
        </button>
      )}
    </div>
  );
}

interface IpcHistoryProps {
  calls: IpcCall[];
}

function IpcHistory({ calls }: IpcHistoryProps) {
  if (calls.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-matrix-text-dim text-xs italic">
        <Zap size={14} className="mr-2 opacity-50" />
        Brak wywolan IPC
      </div>
    );
  }

  return (
    <div className="space-y-1 max-h-48 overflow-auto">
      {calls.slice(0, 20).map((call) => (
        <div
          key={call.id}
          className={`flex items-center gap-2 px-2 py-1 rounded text-xs font-mono ${
            call.success ? 'bg-green-500/5' : 'bg-red-500/10'
          }`}
        >
          <span className={call.success ? 'text-green-400' : 'text-red-400'}>
            {call.success ? '✓' : '✗'}
          </span>
          <span className="text-matrix-accent flex-1 truncate">{call.command}</span>
          <span className="text-matrix-text-dim">{call.duration_ms.toFixed(1)}ms</span>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function DebugPanel() {
  // State
  const [stats, setStats] = useState<DebugStats | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [ipcHistory, setIpcHistory] = useState<IpcCall[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [levelFilter, setLevelFilter] = useState<LogLevel | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // Alert state
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    memoryPercent: 80,
    cpuPercent: 90,
    ipcLatencyMs: 100,
    enabled: true,
  });
  const [activeAlerts, setActiveAlerts] = useState<string[]>([]);
  const [showAlertConfig, setShowAlertConfig] = useState(false);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);

  // Refs
  const unlistenRef = useRef<UnlistenFn | null>(null);

  // Load initial data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [snapshot, logsData, ipcData] = await Promise.all([
        debugIpc.getSnapshot(),
        debugIpc.getLogs(undefined, 100),
        debugIpc.getIpcHistory(50),
      ]);
      setStats(snapshot.stats);
      setLogs(logsData);
      setIpcHistory(ipcData);
    } catch (error) {
      console.warn('Failed to load debug data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Check if running in Tauri
  const isTauri = typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);

  // Start streaming
  const startStreaming = useCallback(async () => {
    // Browser mode: simulate streaming with random data updates
    if (!isTauri) {
      console.log('[DebugPanel] Browser mode - simulating debug streaming');
      const simulationInterval = setInterval(() => {
        setStats(prev => ({
          memory_used_mb: Math.random() * 500,
          memory_total_mb: 8192,
          memory_percent: Math.random() * 30,
          active_tasks: Math.floor(Math.random() * 5),
          queued_tasks: Math.floor(Math.random() * 10),
          completed_tasks: (prev?.completed_tasks || 0) + Math.floor(Math.random() * 2),
          ipc_calls_total: (prev?.ipc_calls_total || 0) + Math.floor(Math.random() * 5),
          ipc_calls_failed: prev?.ipc_calls_failed || 0,
          ipc_avg_latency_ms: 10 + Math.random() * 50,
          ipc_calls_per_sec: 1 + Math.random() * 10,
          events_emitted: (prev?.events_emitted || 0) + 1,
          events_per_sec: 0.5 + Math.random() * 5,
          uptime_secs: (prev?.uptime_secs || 0) + 1,
          cpu_cores: navigator.hardwareConcurrency || 4,
          timestamp: Date.now(),
        }));
      }, 1000);

      // Store cleanup function in ref
      unlistenRef.current = () => {
        console.log('[DebugPanel] Stopping browser simulation');
        clearInterval(simulationInterval);
      };
      setIsStreaming(true);
      return;
    }

    // Tauri mode: real streaming via IPC
    try {
      // Listen for stats updates
      unlistenRef.current = await listen<DebugStats>('debug-stats', (event) => {
        setStats(event.payload);
      });

      await debugIpc.startStreaming();
      setIsStreaming(true);
    } catch (error) {
      console.warn('[DebugPanel] Failed to start streaming:', error);
    }
  }, [isTauri]);

  // Stop streaming
  const stopStreaming = useCallback(async () => {
    try {
      await debugIpc.stopStreaming();
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
      setIsStreaming(false);
    } catch (error) {
      console.warn('Failed to stop streaming:', error);
    }
  }, []);

  // Toggle streaming
  const toggleStreaming = useCallback(() => {
    if (isStreaming) {
      stopStreaming();
    } else {
      startStreaming();
    }
  }, [isStreaming, startStreaming, stopStreaming]);

  // Clear logs
  const clearLogs = useCallback(async () => {
    try {
      await debugIpc.clearLogs();
      setLogs([]);
    } catch (error) {
      console.warn('Failed to clear logs:', error);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadData();
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
      }
    };
  }, [loadData]);

  // Refresh logs periodically when not streaming
  useEffect(() => {
    if (isStreaming) return;

    const interval = setInterval(async () => {
      const lastId = logs.length > 0 ? logs[0].id : undefined;
      const newLogs = await debugIpc.getLogs(
        levelFilter === 'all' ? undefined : levelFilter,
        50,
        lastId
      );
      if (newLogs.length > 0) {
        setLogs((prev) => [...newLogs, ...prev].slice(0, 200));
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isStreaming, logs, levelFilter]);

  // Alert checking logic
  useEffect(() => {
    if (!stats || !alertConfig.enabled) {
      setActiveAlerts([]);
      return;
    }

    const newAlerts: string[] = [];

    if (stats.memory_percent > alertConfig.memoryPercent) {
      newAlerts.push(`Memory usage ${stats.memory_percent.toFixed(1)}% exceeds threshold ${alertConfig.memoryPercent}%`);
    }

    if (stats.ipc_avg_latency_ms > alertConfig.ipcLatencyMs) {
      newAlerts.push(`IPC latency ${stats.ipc_avg_latency_ms.toFixed(1)}ms exceeds threshold ${alertConfig.ipcLatencyMs}ms`);
    }

    // Note: CPU percent is not directly available in DebugStats, but we can add it if needed
    // For now, we'll check task queue overflow as a proxy for CPU stress
    if (stats.queued_tasks > 10) {
      newAlerts.push(`Task queue ${stats.queued_tasks} items - system may be under heavy load`);
    }

    setActiveAlerts(newAlerts);
  }, [stats, alertConfig]);

  // Filter logs by level and search query
  const filteredLogs = logs.filter((log) => {
    const matchesLevel = levelFilter === 'all' || log.level === levelFilter;
    const matchesSearch = !searchQuery ||
      log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.source.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesLevel && matchesSearch;
  });

  // Count search matches
  const searchMatchCount = searchQuery ? filteredLogs.length : 0;

  // Format uptime
  const formatUptime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  if (loading) {
    return (
      <div className="flex-1 glass-panel flex items-center justify-center">
        <RefreshCw className="animate-spin text-matrix-accent" size={24} />
      </div>
    );
  }

  return (
    <div className="flex-1 glass-panel flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-matrix-border">
        <div className="flex items-center gap-3">
          <Bug className="w-6 h-6 text-matrix-accent" />
          <div>
            <h2 className="text-lg font-bold text-matrix-text">Debug LiveView</h2>
            <p className="text-xs text-matrix-text-dim">Real-time monitoring & diagnostics</p>
          </div>
        </div>
        <div className="flex items-center gap-2 relative">
          <button
            onClick={() => setShowAlertConfig(!showAlertConfig)}
            className={`glass-button p-2 ${activeAlerts.length > 0 ? 'text-red-400' : alertConfig.enabled ? 'text-matrix-accent' : 'text-matrix-text-dim'}`}
            title="Alert Settings"
          >
            <Settings size={16} />
            {activeAlerts.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[9px] flex items-center justify-center text-white font-bold">
                {activeAlerts.length}
              </span>
            )}
          </button>
          <button
            onClick={toggleStreaming}
            className={`glass-button p-2 ${isStreaming ? 'text-green-400' : 'text-matrix-text-dim'}`}
            title={isStreaming ? 'Stop streaming' : 'Start streaming'}
          >
            {isStreaming ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button onClick={loadData} className="glass-button p-2" title="Refresh">
            <RefreshCw size={16} />
          </button>
          <button onClick={clearLogs} className="glass-button p-2" title="Clear logs">
            <Trash2 size={16} />
          </button>

          {/* Alert Config Popup */}
          {showAlertConfig && (
            <AlertConfigPopup
              config={alertConfig}
              onConfigChange={setAlertConfig}
              onClose={() => setShowAlertConfig(false)}
            />
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Alert Banner */}
        <AlertBanner alerts={activeAlerts} />

        {/* Stats Grid */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <StatCard
              label="Memory"
              value={`${stats.memory_used_mb.toFixed(0)}MB`}
              subValue={`${stats.memory_percent.toFixed(1)}%`}
              icon={MemoryStick}
              color={stats.memory_percent > alertConfig.memoryPercent && alertConfig.enabled ? 'text-red-400' : 'text-blue-400'}
            />
            <StatCard
              label="CPU Cores"
              value={stats.cpu_cores}
              icon={Cpu}
              color="text-green-400"
            />
            <StatCard
              label="Active Tasks"
              value={stats.active_tasks}
              subValue={`+${stats.queued_tasks} queued`}
              icon={Activity}
              color={stats.queued_tasks > 10 && alertConfig.enabled ? 'text-red-400' : 'text-yellow-400'}
            />
            <StatCard
              label="IPC Total"
              value={stats.ipc_calls_total}
              subValue={`${stats.ipc_calls_failed} failed`}
              icon={Zap}
              color="text-purple-400"
            />
            <StatCard
              label="Avg Latency"
              value={`${stats.ipc_avg_latency_ms.toFixed(1)}ms`}
              subValue={`${stats.ipc_calls_per_sec.toFixed(1)}/sec`}
              icon={Gauge}
              color={stats.ipc_avg_latency_ms > alertConfig.ipcLatencyMs && alertConfig.enabled ? 'text-red-400' : 'text-pink-400'}
            />
            <StatCard
              label="Uptime"
              value={formatUptime(stats.uptime_secs)}
              subValue={`${stats.events_emitted} events`}
              icon={Clock}
              color="text-cyan-400"
            />
          </div>
        )}

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Log Viewer */}
          <div className="glass-card p-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Terminal size={14} className="text-matrix-accent" />
                <span className="text-sm font-semibold text-matrix-text">Logs</span>
                <span className="text-[10px] text-matrix-text-dim">({filteredLogs.length})</span>
                {searchMatchCount > 0 && (
                  <span className="text-[10px] text-yellow-400">({searchMatchCount} matches)</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-matrix-text-dim" />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="glass-input text-[10px] pl-6 pr-2 py-1 w-24"
                  />
                </div>
                <select
                  value={levelFilter}
                  onChange={(e) => setLevelFilter(e.target.value as LogLevel | 'all')}
                  className="glass-input text-[10px] px-2 py-1"
                >
                  <option value="all">All Levels</option>
                  <option value="debug">Debug</option>
                  <option value="info">Info</option>
                  <option value="warn">Warn</option>
                  <option value="error">Error</option>
                </select>
              </div>
            </div>
            <LogViewer logs={filteredLogs} maxHeight="250px" searchQuery={searchQuery} onLogClick={setSelectedLog} />
          </div>

          {/* IPC History */}
          <div className="glass-card p-3">
            <div className="flex items-center gap-2 mb-3">
              <Database size={14} className="text-matrix-accent" />
              <span className="text-sm font-semibold text-matrix-text">IPC History</span>
              <span className="text-[10px] text-matrix-text-dim">({ipcHistory.length})</span>
            </div>
            <IpcHistory calls={ipcHistory} />
          </div>
        </div>

        {/* Performance Summary */}
        {stats && (
          <div className="glass-card p-3">
            <div className="flex items-center gap-2 mb-3">
              <Gauge size={14} className="text-matrix-accent" />
              <span className="text-sm font-semibold text-matrix-text">Performance Summary</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center text-xs">
              <div>
                <div className="text-2xl font-mono font-bold text-green-400">
                  {stats.completed_tasks}
                </div>
                <div className="text-matrix-text-dim">Completed Tasks</div>
              </div>
              <div>
                <div className="text-2xl font-mono font-bold text-blue-400">
                  {((1 - stats.ipc_calls_failed / Math.max(stats.ipc_calls_total, 1)) * 100).toFixed(1)}%
                </div>
                <div className="text-matrix-text-dim">Success Rate</div>
              </div>
              <div>
                <div className="text-2xl font-mono font-bold text-purple-400">
                  {stats.events_per_sec.toFixed(1)}
                </div>
                <div className="text-matrix-text-dim">Events/sec</div>
              </div>
              <div>
                <div className="text-2xl font-mono font-bold text-yellow-400">
                  {stats.ipc_avg_latency_ms.toFixed(1)}ms
                </div>
                <div className="text-matrix-text-dim">Avg Response</div>
              </div>
            </div>
          </div>
        )}

        {/* Advanced Panels Row */}
        {stats && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Task Queue Panel */}
            <TaskQueuePanel
              activeTasks={stats.active_tasks}
              queuedTasks={stats.queued_tasks}
              completedTasks={stats.completed_tasks}
            />

            {/* Network Panel */}
            <NetworkPanel />

            {/* Performance Heatmap */}
            <PerformanceHeatmap
              ipcCallsPerSec={stats.ipc_calls_per_sec}
              eventsPerSec={stats.events_per_sec}
              avgLatency={stats.ipc_avg_latency_ms}
            />
          </div>
        )}

        {/* Streaming Status */}
        {isStreaming && (
          <div className="flex items-center justify-center gap-2 text-xs text-green-400">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            LiveView streaming active
          </div>
        )}
      </div>

      {/* Log Detail Modal */}
      <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />

      {/* Footer */}
      <div className="px-4 py-2 border-t border-matrix-border text-[10px] text-matrix-text-dim flex justify-between">
        <span>Debug LiveView v1.1</span>
        <span>
          {stats ? `${formatUptime(stats.uptime_secs)} uptime` : 'Loading...'}
        </span>
      </div>
    </div>
  );
}

export default DebugPanel;
