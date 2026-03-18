/**
 * useSandbox — Sandbox Environment state management
 *
 * Provides sandbox session lifecycle, code execution, and execution history
 * for the Swarm Sandbox panel.
 */

import { useCallback, useEffect, useState } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

export type SandboxLanguage = 'node' | 'python' | 'rust' | 'bash';

type SandboxStatus = 'creating' | 'ready' | 'running' | 'stopped' | 'error';
type ExecutionStatus = 'success' | 'error' | 'timeout' | 'container_error';

interface ResourceLimits {
  memory_mb: number;
  cpu_shares: number;
  timeout_secs: number;
  no_network: boolean;
  read_only: boolean;
}

export interface SandboxSession {
  id: string;
  container_id: string | null;
  language: SandboxLanguage;
  status: SandboxStatus;
  resource_limits: ResourceLimits;
  created_at: string;
  last_execution_at: string | null;
  execution_count: number;
}

export interface SandboxExecution {
  id: string;
  session_id: string;
  code: string;
  language: SandboxLanguage;
  stdout: string;
  stderr: string;
  exit_code: number | null;
  status: ExecutionStatus;
  duration_ms: number;
  executed_at: string;
}

interface SandboxHealth {
  docker_available: boolean;
  active_sessions: number;
  total_executions: number;
  fallback_mode: boolean;
}

// ── API Base ─────────────────────────────────────────────────────────────────

const API_BASE = 'http://localhost:8082';

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useSandbox() {
  const [sessions, setSessions] = useState<SandboxSession[]>([]);
  const [executions, setExecutions] = useState<SandboxExecution[]>([]);
  const [health, setHealth] = useState<SandboxHealth | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [latestExecution, setLatestExecution] = useState<SandboxExecution | null>(null);

  // ── Health check ─────────────────────────────────────────────────────────

  const checkHealth = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/sandbox/health`);
      const data: SandboxHealth = await resp.json();
      setHealth(data);
      return data;
    } catch (err) {
      console.error('Sandbox health check failed:', err);
      return null;
    }
  }, []);

  // ── Create session ───────────────────────────────────────────────────────

  const createSession = useCallback(async (language: SandboxLanguage, limits?: Partial<ResourceLimits>) => {
    setIsCreating(true);
    try {
      const resp = await fetch(`${API_BASE}/api/sandbox/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, limits }),
      });
      const data: SandboxSession = await resp.json();
      if (resp.ok) {
        setSessions((prev) => [data, ...prev]);
      }
      return data;
    } catch (err) {
      console.error('Sandbox create failed:', err);
      return null;
    } finally {
      setIsCreating(false);
    }
  }, []);

  // ── Execute code ─────────────────────────────────────────────────────────

  const executeCode = useCallback(
    async (code: string, language: SandboxLanguage, sessionId?: string, timeoutSecs?: number) => {
      setIsExecuting(true);
      setLatestExecution(null);
      try {
        const resp = await fetch(`${API_BASE}/api/sandbox/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            language: sessionId ? undefined : language,
            session_id: sessionId,
            timeout_secs: timeoutSecs,
          }),
        });
        const data: SandboxExecution = await resp.json();
        setLatestExecution(data);
        setExecutions((prev) => [data, ...prev].slice(0, 100));
        return data;
      } catch (err) {
        console.error('Sandbox execute failed:', err);
        return null;
      } finally {
        setIsExecuting(false);
      }
    },
    [],
  );

  // ── Load sessions ────────────────────────────────────────────────────────

  const loadSessions = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/sandbox/sessions`);
      const data: SandboxSession[] = await resp.json();
      setSessions(data);
    } catch (err) {
      console.error('Sandbox sessions load failed:', err);
    }
  }, []);

  // ── Load executions ──────────────────────────────────────────────────────

  const loadExecutions = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/sandbox/executions`);
      const data: SandboxExecution[] = await resp.json();
      setExecutions(data);
    } catch (err) {
      console.error('Sandbox executions load failed:', err);
    }
  }, []);

  // ── Destroy session ──────────────────────────────────────────────────────

  const destroySession = useCallback(async (sessionId: string) => {
    try {
      await fetch(`${API_BASE}/api/sandbox/sessions/${sessionId}`, {
        method: 'DELETE',
      });
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      console.error('Sandbox destroy failed:', err);
    }
  }, []);

  // ── Initial load ─────────────────────────────────────────────────────────

  useEffect(() => {
    checkHealth();
    loadSessions();
    loadExecutions();
  }, [checkHealth, loadSessions, loadExecutions]);

  // ── Derived stats ────────────────────────────────────────────────────────

  const stats = {
    activeSessions: sessions.filter((s) => s.status === 'ready').length,
    totalSessions: sessions.length,
    totalExecutions: executions.length,
    successRate:
      executions.length > 0
        ? Math.round((executions.filter((e) => e.status === 'success').length / executions.length) * 100)
        : 0,
  };

  return {
    sessions,
    executions,
    health,
    stats,
    latestExecution,
    isCreating,
    isExecuting,
    checkHealth,
    createSession,
    executeCode,
    loadSessions,
    loadExecutions,
    destroySession,
  };
}
