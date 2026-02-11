import { invoke } from '@tauri-apps/api/core';
import type { ApprovalHistoryEntry, ApprovalRule, SessionStatus } from '../types/claude';

// Check if running in Tauri (v2 uses __TAURI_INTERNALS__)
const isTauri = () =>
  typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);

// Safe invoke that returns mock data in browser mode
const safeInvoke = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
  if (!isTauri()) {
    console.warn(`[IPC] Tauri not available, skipping: ${cmd}`);
    throw new Error('Not running in Tauri');
  }
  return invoke<T>(cmd, args);
};

// Claude IPC wrapper for Tauri commands
export const claudeIpc = {
  // Session management
  startSession: (workingDir: string, cliPath: string, initialPrompt?: string): Promise<string> =>
    safeInvoke('start_claude_session', {
      workingDir,
      cliPath,
      initialPrompt,
    }),

  stopSession: (): Promise<void> => safeInvoke('stop_claude_session'),

  getStatus: async (): Promise<SessionStatus> => {
    console.log('[IPC] getStatus called, isTauri:', isTauri());
    if (isTauri()) {
      try {
        const status = await safeInvoke<SessionStatus>('get_session_status');
        console.log('[IPC] getStatus result:', status);
        return status;
      } catch (e) {
        console.error('[IPC] getStatus error:', e);
        throw e;
      }
    }
    return {
      is_active: false,
      pending_approval: false,
      auto_approve_all: false,
      approved_count: 0,
      denied_count: 0,
      auto_approved_count: 0,
    };
  },

  // Input/Output
  sendInput: (input: string): Promise<void> => safeInvoke('send_input', { input }),

  // Approval actions
  approve: (): Promise<void> => safeInvoke('approve_action'),

  deny: (): Promise<void> => safeInvoke('deny_action'),

  // Auto-approve settings
  toggleAutoApproveAll: (enabled: boolean): Promise<void> =>
    safeInvoke('toggle_auto_approve_all', { enabled }),

  // Rules management
  getRules: (): Promise<ApprovalRule[]> =>
    isTauri() ? safeInvoke('get_approval_rules') : Promise.resolve([]),

  updateRules: (rules: ApprovalRule[]): Promise<void> =>
    safeInvoke('update_approval_rules', { rules }),

  // History
  getHistory: (): Promise<ApprovalHistoryEntry[]> =>
    isTauri() ? safeInvoke('get_approval_history') : Promise.resolve([]),

  clearHistory: (): Promise<void> => safeInvoke('clear_approval_history'),
};

// CPU & Parallel Processing IPC
export interface CpuInfo {
  logical_cores: number;
  physical_cores: number;
  rayon_threads: number;
}

export interface BatchResult {
  index: number;
  prompt: string;
  response: string | null;
  error: string | null;
  duration_ms: number;
}

export const parallelIpc = {
  // Get CPU info for performance monitoring
  getCpuInfo: (): Promise<CpuInfo> =>
    isTauri()
      ? safeInvoke('get_cpu_info')
      : Promise.resolve({
          logical_cores: navigator.hardwareConcurrency || 4,
          physical_cores: Math.ceil((navigator.hardwareConcurrency || 4) / 2),
          rayon_threads: navigator.hardwareConcurrency || 4,
        }),

  // Batch generate - process multiple prompts in parallel
  batchGenerate: (
    model: string,
    prompts: string[],
    options?: Record<string, unknown>,
  ): Promise<BatchResult[]> => safeInvoke('ollama_batch_generate', { model, prompts, options }),
};

// ============================================================================
// Debug LiveView IPC
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: number;
  timestamp: number;
  level: LogLevel;
  source: string;
  message: string;
  details?: string;
}

export interface IpcCall {
  id: number;
  timestamp: number;
  command: string;
  duration_ms: number;
  success: boolean;
  error?: string;
}

export interface DebugStats {
  // Memory
  memory_used_mb: number;
  memory_total_mb: number;
  memory_percent: number;

  // Tasks
  active_tasks: number;
  queued_tasks: number;
  completed_tasks: number;

  // IPC
  ipc_calls_total: number;
  ipc_calls_failed: number;
  ipc_avg_latency_ms: number;
  ipc_calls_per_sec: number;

  // Events
  events_emitted: number;
  events_per_sec: number;

  // System
  uptime_secs: number;
  cpu_cores: number;
  timestamp: number;
}

export interface DebugSnapshot {
  stats: DebugStats;
  recent_logs: LogEntry[];
  recent_ipc: IpcCall[];
}

export const debugIpc = {
  // Get current system stats
  getStats: (): Promise<DebugStats> =>
    isTauri()
      ? safeInvoke('debug_get_stats')
      : Promise.resolve({
          memory_used_mb: 0,
          memory_total_mb: 256,
          memory_percent: 0,
          active_tasks: 0,
          queued_tasks: 0,
          completed_tasks: 0,
          ipc_calls_total: 0,
          ipc_calls_failed: 0,
          ipc_avg_latency_ms: 0,
          ipc_calls_per_sec: 0,
          events_emitted: 0,
          events_per_sec: 0,
          uptime_secs: 0,
          cpu_cores: navigator.hardwareConcurrency || 4,
          timestamp: Date.now(),
        }),

  // Get logs with optional filtering
  getLogs: (level?: LogLevel, limit?: number, sinceId?: number): Promise<LogEntry[]> =>
    isTauri()
      ? safeInvoke('debug_get_logs', { level, limit, since_id: sinceId })
      : Promise.resolve([]),

  // Get IPC call history
  getIpcHistory: (limit?: number): Promise<IpcCall[]> =>
    isTauri() ? safeInvoke('debug_get_ipc_history', { limit }) : Promise.resolve([]),

  // Get full debug snapshot
  getSnapshot: (): Promise<DebugSnapshot> =>
    isTauri()
      ? safeInvoke('debug_get_snapshot')
      : Promise.resolve({
          stats: {
            memory_used_mb: 0,
            memory_total_mb: 256,
            memory_percent: 0,
            active_tasks: 0,
            queued_tasks: 0,
            completed_tasks: 0,
            ipc_calls_total: 0,
            ipc_calls_failed: 0,
            ipc_avg_latency_ms: 0,
            ipc_calls_per_sec: 0,
            events_emitted: 0,
            events_per_sec: 0,
            uptime_secs: 0,
            cpu_cores: navigator.hardwareConcurrency || 4,
            timestamp: Date.now(),
          },
          recent_logs: [],
          recent_ipc: [],
        }),

  // Clear all logs
  clearLogs: (): Promise<void> => safeInvoke('debug_clear_logs'),

  // Add a log entry from frontend
  addLog: (level: LogLevel, source: string, message: string, details?: string): Promise<void> =>
    safeInvoke('debug_add_log', { level, source, message, details }),

  // Start real-time streaming
  startStreaming: (): Promise<void> => safeInvoke('debug_start_streaming'),

  // Stop streaming
  stopStreaming: (): Promise<void> => safeInvoke('debug_stop_streaming'),
};
