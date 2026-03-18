/**
 * useSwarm — Swarm IPC state management
 *
 * Provides peer discovery, task delegation, real-time SSE events,
 * and task history for the SwarmView.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

interface SwarmAttachment {
  contentType: string;
  url: string;
  name?: string;
}

export interface SwarmPeer {
  id: string;
  name: string;
  url: string;
  port: number;
  provider: string;
  status: 'online' | 'offline' | 'degraded' | 'unknown';
  lastSeen: string | null;
  version: string | null;
  tiers: string[];
}

export interface SwarmTaskSummary {
  id: string;
  pattern: string;
  source_peer: string;
  target_peers: string[];
  status: string;
  results_count: number;
  success_count: number;
  created_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  prompt_preview: string;
  attachments?: SwarmAttachment[];
}

interface SwarmResult {
  peer_id: string;
  peer_name: string;
  agent_id: string | null;
  model_used: string | null;
  content: string;
  attachments?: SwarmAttachment[];
  status: 'success' | 'error' | 'timeout' | 'skipped';
  duration_ms: number;
  tokens_used: number | null;
  error: string | null;
  completed_at: string;
}

interface SwarmTask {
  id: string;
  pattern: string;
  source_peer: string;
  target_peers: string[];
  prompt: string;
  status: string;
  results: SwarmResult[];
  created_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  error: string | null;
  attachments?: SwarmAttachment[];
}

export interface SwarmEvent {
  eventType: string;
  taskId: string;
  peerId: string | null;
  message: string;
  data: unknown;
  timestamp: string;
}

export type OrchestrationPattern = 'parallel' | 'sequential' | 'review' | 'fan_out';

// ── API Base ─────────────────────────────────────────────────────────────────

const API_BASE = 'http://localhost:8082';

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useSwarm() {
  const [peers, setPeers] = useState<SwarmPeer[]>([]);
  const [tasks, setTasks] = useState<SwarmTaskSummary[]>([]);
  const [events, setEvents] = useState<SwarmEvent[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isDelegating, setIsDelegating] = useState(false);
  const [selectedTask, setSelectedTask] = useState<SwarmTask | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // ── Discover peers ──────────────────────────────────────────────────────

  const discover = useCallback(async () => {
    setIsDiscovering(true);
    try {
      const resp = await fetch(`${API_BASE}/api/swarm/discover`);
      const data = await resp.json();
      setPeers(data.peers || []);
    } catch (err) {
      console.error('Swarm discover failed:', err);
    } finally {
      setIsDiscovering(false);
    }
  }, []);

  // ── Load peers (cached) ─────────────────────────────────────────────────

  const loadPeers = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/swarm/peers`);
      const data = await resp.json();
      setPeers(data);
    } catch (err) {
      console.error('Swarm peers load failed:', err);
    }
  }, []);

  // ── Load tasks ──────────────────────────────────────────────────────────

  const loadTasks = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/swarm/tasks`);
      const data = await resp.json();
      setTasks(data);
    } catch (err) {
      console.error('Swarm tasks load failed:', err);
    }
  }, []);

  // ── Load task details ───────────────────────────────────────────────────

  const loadTask = useCallback(async (taskId: string) => {
    try {
      const resp = await fetch(`${API_BASE}/api/swarm/tasks/${taskId}`);
      const data = await resp.json();
      setSelectedTask(data);
      return data as SwarmTask;
    } catch (err) {
      console.error('Swarm task load failed:', err);
      return null;
    }
  }, []);

  // ── Delegate task ───────────────────────────────────────────────────────

  const delegate = useCallback(
    async (
      prompt: string,
      pattern: OrchestrationPattern = 'parallel',
      targets: string[] = [],
      timeoutSecs = 120,
      attachments: SwarmAttachment[] = [],
    ) => {
      setIsDelegating(true);
      try {
        const resp = await fetch(`${API_BASE}/api/swarm/delegate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            pattern,
            targets,
            timeout_secs: timeoutSecs,
            attachments,
          }),
        });
        const data = await resp.json();
        // Refresh tasks list
        setTimeout(() => loadTasks(), 500);
        return data;
      } catch (err) {
        console.error('Swarm delegate failed:', err);
        return null;
      } finally {
        setIsDelegating(false);
      }
    },
    [loadTasks],
  );

  // ── SSE event stream ────────────────────────────────────────────────────

  useEffect(() => {
    const es = new EventSource(`${API_BASE}/api/swarm/events`);
    eventSourceRef.current = es;

    const handleEvent = (e: MessageEvent) => {
      try {
        const event: SwarmEvent = JSON.parse(e.data);
        setEvents((prev) => [event, ...prev].slice(0, 100));

        // Auto-refresh tasks on completion events
        if (event.eventType === 'task_completed' || event.eventType === 'task_failed') {
          loadTasks();
        }
      } catch {
        // ping/keepalive — ignore
      }
    };

    // Listen for all event types
    const eventTypes = [
      'task_created',
      'delegation_sent',
      'delegation_acknowledged',
      'peer_working',
      'partial_result',
      'peer_completed',
      'peer_error',
      'peer_timeout',
      'task_completed',
      'task_failed',
      'task_cancelled',
      'peer_discovered',
      'peer_lost',
      'attachment_received',
      'media_stream_chunk',
    ];
    for (const type of eventTypes) {
      es.addEventListener(type, handleEvent);
    }

    es.onerror = () => {
      // Auto-reconnect handled by browser
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [loadTasks]);

  // ── Initial load ────────────────────────────────────────────────────────

  useEffect(() => {
    loadPeers();
    loadTasks();
  }, [loadPeers, loadTasks]);

  // ── Derived stats ───────────────────────────────────────────────────────

  const onlinePeers = peers.filter((p) => p.status === 'online');
  const stats = {
    totalPeers: peers.length,
    onlinePeers: onlinePeers.length,
    totalTasks: tasks.length,
    completedTasks: tasks.filter((t) => t.status === 'completed').length,
    failedTasks: tasks.filter((t) => t.status === 'failed').length,
    runningTasks: tasks.filter((t) => t.status === 'running').length,
  };

  return {
    peers,
    tasks,
    events,
    stats,
    selectedTask,
    isDiscovering,
    isDelegating,
    discover,
    loadPeers,
    loadTasks,
    loadTask,
    delegate,
    setSelectedTask,
  };
}
