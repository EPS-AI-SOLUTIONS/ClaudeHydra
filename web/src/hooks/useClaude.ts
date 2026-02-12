'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApprovalHistoryEntry, ClaudeEvent, SessionStatus } from '@/types/claude';

interface UseClaudeReturn {
  /** Stan sesji Claude */
  status: SessionStatus;
  /** Czy połączony z SSE */
  connected: boolean;
  /** Ostatni event */
  lastEvent: ClaudeEvent | null;
  /** Oczekujący event wymagający aprobaty */
  pendingApproval: ClaudeEvent | null;
  /** Zatwierdź event */
  approve: (id: string) => Promise<void>;
  /** Odrzuć event */
  deny: (id: string) => Promise<void>;
  /** Wyczyść kolejkę */
  clearQueue: () => Promise<void>;
  /** Odśwież status */
  refreshStatus: () => Promise<void>;
}

const DEFAULT_STATUS: SessionStatus = {
  is_active: false,
  pending_approval: false,
  auto_approve_all: false,
  approved_count: 0,
  denied_count: 0,
  auto_approved_count: 0,
};

export function useClaude(): UseClaudeReturn {
  const [status, setStatus] = useState<SessionStatus>(DEFAULT_STATUS);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<ClaudeEvent | null>(null);
  const [pendingApproval, setPendingApproval] = useState<ClaudeEvent | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pobierz status sesji z API
  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/bridge/state');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // Ignoruj błędy sieciowe
    }
  }, []);

  // Zatwierdź event
  const approve = useCallback(
    async (id: string) => {
      try {
        await fetch('/api/bridge/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
        setPendingApproval(null);

        // Zapisz do historii
        if (pendingApproval?.approval_type) {
          await fetch('/api/claude/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              approval_type: pendingApproval.approval_type,
              action: 'approved',
              auto_approved: false,
            }),
          });
        }

        await refreshStatus();
      } catch (e) {
        console.error('Failed to approve:', e);
      }
    },
    [pendingApproval, refreshStatus],
  );

  // Odrzuć event
  const deny = useCallback(
    async (id: string) => {
      try {
        await fetch('/api/bridge/reject', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
        setPendingApproval(null);

        if (pendingApproval?.approval_type) {
          await fetch('/api/claude/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              approval_type: pendingApproval.approval_type,
              action: 'denied',
              auto_approved: false,
            }),
          });
        }

        await refreshStatus();
      } catch (e) {
        console.error('Failed to deny:', e);
      }
    },
    [pendingApproval, refreshStatus],
  );

  // Wyczyść kolejkę
  const clearQueue = useCallback(async () => {
    try {
      await fetch('/api/bridge/clear', { method: 'POST' });
      setPendingApproval(null);
      await refreshStatus();
    } catch (e) {
      console.error('Failed to clear queue:', e);
    }
  }, [refreshStatus]);

  // Połączenie SSE
  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 5;

    function connectSSE() {
      const es = new EventSource('/api/claude/events');
      esRef.current = es;

      es.onopen = () => {
        setConnected(true);
        retryCount = 0;
      };

      es.addEventListener('claude-event', (e) => {
        try {
          const event = JSON.parse(e.data) as ClaudeEvent;
          setLastEvent(event);
        } catch {
          // Invalid JSON
        }
      });

      es.addEventListener('approval-required', (e) => {
        try {
          const event = JSON.parse(e.data) as ClaudeEvent;
          setPendingApproval(event);
          setStatus((prev) => ({ ...prev, pending_approval: true }));
        } catch {
          // Invalid JSON
        }
      });

      es.addEventListener('auto-approved', (e) => {
        try {
          const data = JSON.parse(e.data) as {
            event: ClaudeEvent;
            matched_rule: string;
          };
          setLastEvent(data.event);
          setStatus((prev) => ({
            ...prev,
            auto_approved_count: prev.auto_approved_count + 1,
          }));
        } catch {
          // Invalid JSON
        }
      });

      es.addEventListener('session-ended', () => {
        setStatus(DEFAULT_STATUS);
        setPendingApproval(null);
      });

      es.onerror = () => {
        es.close();
        esRef.current = null;
        setConnected(false);

        if (retryCount < maxRetries) {
          const delay = 1000 * 2 ** retryCount;
          retryCount++;
          retryTimerRef.current = setTimeout(connectSSE, delay);
        }
      };
    }

    connectSSE();
    refreshStatus();

    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
      if (esRef.current) {
        esRef.current.close();
      }
    };
  }, [refreshStatus]);

  return {
    status,
    connected,
    lastEvent,
    pendingApproval,
    approve,
    deny,
    clearQueue,
    refreshStatus,
  };
}
