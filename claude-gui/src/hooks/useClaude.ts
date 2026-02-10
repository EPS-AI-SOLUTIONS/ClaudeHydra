import { useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { claudeIpc } from '../lib/ipc';
import { useClaudeStore } from '../stores/claudeStore';
import type { ClaudeEvent, AutoApprovedEvent } from '../types/claude';

// Check if running in Tauri (v2 uses __TAURI_INTERNALS__)
const isTauri = () => typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);

export function useClaude() {
  const {
    status,
    isConnecting,
    pendingApproval,
    workingDir,
    cliPath,
    setStatus,
    setConnecting,
    addOutputLine,
    setPendingApproval,
    addHistoryEntry,
    resetSession,
  } = useClaudeStore();

  // Listen for Claude events
  useEffect(() => {
    // Skip if not running in Tauri
    if (!isTauri()) return;

    let cancelled = false;
    const unlistenerPromises: Array<Promise<() => void>> = [];

    // Regular events
    unlistenerPromises.push(
      listen<ClaudeEvent>('claude-event', (event) => {
        if (cancelled) return;
        const claudeEvent = event.payload;

        switch (claudeEvent.event_type) {
          case 'assistant':
            addOutputLine({
              type: 'assistant',
              content: String(claudeEvent.data.message || ''),
              data: claudeEvent.data,
            });
            break;
          case 'tool_use':
            addOutputLine({
              type: 'tool',
              content: `Tool: ${claudeEvent.data.name}`,
              data: claudeEvent.data,
            });
            break;
          case 'tool_result':
            addOutputLine({
              type: 'output',
              content: String(claudeEvent.data.output || ''),
              data: claudeEvent.data,
            });
            break;
          case 'output':
            addOutputLine({
              type: 'output',
              content: String(claudeEvent.data.text || ''),
              data: claudeEvent.data,
            });
            break;
          case 'stderr':
            addOutputLine({
              type: 'error',
              content: String(claudeEvent.data.text || ''),
            });
            break;
          case 'error':
            addOutputLine({
              type: 'error',
              content: String(claudeEvent.data.message || 'Unknown error'),
            });
            break;
          case 'system':
            addOutputLine({
              type: 'system',
              content: String(claudeEvent.data.message || ''),
            });
            break;
        }
      })
    );

    // Approval required
    unlistenerPromises.push(
      listen<ClaudeEvent>('claude-approval-required', (event) => {
        if (cancelled) return;
        setPendingApproval(event.payload);
        addOutputLine({
          type: 'approval',
          content: 'Approval required',
          data: event.payload.data,
        });
      })
    );

    // Auto-approved
    unlistenerPromises.push(
      listen<AutoApprovedEvent>('claude-auto-approved', (event) => {
        if (cancelled) return;
        const { event: claudeEvent, matched_rule } = event.payload;
        addOutputLine({
          type: 'system',
          content: `[AUTO-APPROVED: ${matched_rule}]`,
          data: claudeEvent.data,
        });

        if (claudeEvent.approval_type) {
          addHistoryEntry({
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            approval_type: claudeEvent.approval_type,
            action: 'approved',
            auto_approved: true,
            matched_rule,
          });
        }
      })
    );

    // Session ended
    unlistenerPromises.push(
      listen('claude-session-ended', () => {
        if (cancelled) return;
        addOutputLine({
          type: 'system',
          content: 'Session ended',
        });
        resetSession();
      })
    );

    return () => {
      cancelled = true;
      // Wait for all listener registrations to complete, then unsubscribe
      Promise.allSettled(unlistenerPromises).then((results) => {
        for (const result of results) {
          if (result.status === 'fulfilled') {
            result.value();
          }
        }
      });
    };
  }, [addOutputLine, setPendingApproval, addHistoryEntry, resetSession]);

  // Refresh status periodically
  useEffect(() => {
    const refreshStatus = async () => {
      try {
        const newStatus = await claudeIpc.getStatus();
        console.log('[useClaude] Got status:', newStatus, 'is_active:', newStatus.is_active);
        setStatus(newStatus);
      } catch (e) {
        console.error('[useClaude] Failed to get status:', e);
      }
    };

    console.log('[useClaude] Starting status refresh, isTauri:', isTauri());
    refreshStatus();
    const interval = setInterval(refreshStatus, 2000);

    return () => clearInterval(interval);
  }, [setStatus]);

  // Start session
  const startSession = useCallback(
    async (prompt?: string) => {
      setConnecting(true);
      try {
        await claudeIpc.startSession(workingDir, cliPath, prompt);
        const newStatus = await claudeIpc.getStatus();
        setStatus(newStatus);
        addOutputLine({
          type: 'system',
          content: `Session started in ${workingDir}`,
        });
      } catch (error) {
        addOutputLine({
          type: 'error',
          content: `Failed to start session: ${error}`,
        });
      } finally {
        setConnecting(false);
      }
    },
    [workingDir, cliPath, setConnecting, setStatus, addOutputLine]
  );

  // Stop session
  const stopSession = useCallback(async () => {
    try {
      await claudeIpc.stopSession();
      resetSession();
      addOutputLine({
        type: 'system',
        content: 'Session stopped',
      });
    } catch (error) {
      addOutputLine({
        type: 'error',
        content: `Failed to stop session: ${error}`,
      });
    }
  }, [resetSession, addOutputLine]);

  // Send input
  const sendInput = useCallback(
    async (input: string) => {
      console.log('[useClaude] sendInput called:', input);
      try {
        console.log('[useClaude] Calling IPC sendInput...');
        await claudeIpc.sendInput(input + '\n');
        console.log('[useClaude] IPC sendInput SUCCESS');
        addOutputLine({
          type: 'output',
          content: `> ${input}`,
        });
      } catch (error) {
        console.error('[useClaude] IPC sendInput FAILED:', error);
        addOutputLine({
          type: 'error',
          content: `Failed to send input: ${error}`,
        });
      }
    },
    [addOutputLine]
  );

  // Approve
  const approve = useCallback(async () => {
    try {
      await claudeIpc.approve();
      if (pendingApproval?.approval_type) {
        addHistoryEntry({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          approval_type: pendingApproval.approval_type,
          action: 'approved',
          auto_approved: false,
        });
      }
      setPendingApproval(null);
      addOutputLine({
        type: 'system',
        content: '[APPROVED]',
      });
    } catch (error) {
      addOutputLine({
        type: 'error',
        content: `Failed to approve: ${error}`,
      });
    }
  }, [pendingApproval, setPendingApproval, addHistoryEntry, addOutputLine]);

  // Deny
  const deny = useCallback(async () => {
    try {
      await claudeIpc.deny();
      if (pendingApproval?.approval_type) {
        addHistoryEntry({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          approval_type: pendingApproval.approval_type,
          action: 'denied',
          auto_approved: false,
        });
      }
      setPendingApproval(null);
      addOutputLine({
        type: 'system',
        content: '[DENIED]',
      });
    } catch (error) {
      addOutputLine({
        type: 'error',
        content: `Failed to deny: ${error}`,
      });
    }
  }, [pendingApproval, setPendingApproval, addHistoryEntry, addOutputLine]);

  // Toggle auto-approve all
  const toggleAutoApproveAll = useCallback(
    async (enabled: boolean) => {
      try {
        await claudeIpc.toggleAutoApproveAll(enabled);
        const newStatus = await claudeIpc.getStatus();
        setStatus(newStatus);
      } catch (error) {
        addOutputLine({
          type: 'error',
          content: `Failed to toggle auto-approve: ${error}`,
        });
      }
    },
    [setStatus, addOutputLine]
  );

  return {
    status,
    isConnecting,
    pendingApproval,
    startSession,
    stopSession,
    sendInput,
    approve,
    deny,
    toggleAutoApproveAll,
  };
}
