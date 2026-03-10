/**
 * useSessionSync — dual persistence layer (Zustand localStorage + PostgreSQL on fly.io).
 *
 * Hydrates Zustand from DB on startup if localStorage is empty.
 * All CRUD operations write to both DB and Zustand simultaneously.
 * One-time migration from localStorage → DB on first use.
 */

import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { type ChatSession, useViewStore } from '@/stores/viewStore';
import {
  useAddMessageMutation,
  useCreateSessionMutation,
  useDeleteSessionMutation,
  useGenerateTitleMutation,
  useSessionsQuery,
  useUpdateSessionMutation,
} from './useSessions';

const MIGRATION_FLAG = 'ch-sessions-migrated-to-db';

export function useSessionSync() {
  const {
    chatSessions,
    activeSessionId,
    createSessionWithId,
    deleteSessionLocal,
    updateSessionTitleLocal,
    hydrateSessions,
    syncWorkingDirectories,
    selectSession,
    openTab,
    setView,
  } = useViewStore(
    useShallow((state) => ({
      chatSessions: state.chatSessions,
      activeSessionId: state.activeSessionId,
      createSessionWithId: state.createSessionWithId,
      deleteSessionLocal: state.deleteSession,
      updateSessionTitleLocal: state.updateSessionTitle,
      hydrateSessions: state.hydrateSessions,
      syncWorkingDirectories: state.syncWorkingDirectories,
      selectSession: state.selectSession,
      openTab: state.openTab,
      setView: state.setView,
    })),
  );

  const { data: dbSessions, isSuccess: dbLoaded } = useSessionsQuery();
  const createMutation = useCreateSessionMutation();
  const deleteMutation = useDeleteSessionMutation();
  const updateMutation = useUpdateSessionMutation();
  const addMessageMutation = useAddMessageMutation();
  const generateTitleMutation = useGenerateTitleMutation();

  const hydratedRef = useRef(false);

  // ── Hydrate from DB on startup ──────────────────────────────────────
  useEffect(() => {
    if (!dbLoaded || !dbSessions || hydratedRef.current) return;
    hydratedRef.current = true;

    const mapped: ChatSession[] = dbSessions.map((s) => ({
      id: s.id,
      title: s.title,
      createdAt: new Date(s.created_at).getTime(),
      updatedAt: new Date(s.updated_at ?? s.created_at).getTime(),
      messageCount: s.message_count,
      workingDirectory: s.working_directory ?? '',
    }));

    if (mapped.length > 0) {
      hydrateSessions(mapped);
    }

    // One-time migration: push any localStorage-only sessions to DB
    if (!localStorage.getItem(MIGRATION_FLAG)) {
      const localOnly = chatSessions.filter((local) => !dbSessions.some((db) => db.id === local.id));
      for (const session of localOnly) {
        createMutation.mutate({ title: session.title });
      }
      localStorage.setItem(MIGRATION_FLAG, '1');
    }
  }, [dbLoaded, dbSessions, chatSessions, hydrateSessions, createMutation]);

  // Sync workingDirectory from DB on every load (DB is source of truth)
  useEffect(() => {
    if (!dbLoaded || !dbSessions) return;
    const dirs = dbSessions.map((s) => ({
      id: s.id,
      workingDirectory: s.working_directory ?? '',
    }));
    syncWorkingDirectories(dirs);
  }, [dbLoaded, dbSessions, syncWorkingDirectories]);

  // ── Synced CRUD operations ──────────────────────────────────────────

  /** #16 - Optimistic UI: immediately show temp session, replace on API success, remove on failure */
  const createSessionWithSync = useCallback(
    (title?: string) => {
      const sessionTitle = title ?? `Chat ${chatSessions.length + 1}`;
      // Create optimistic temp session in store immediately
      const tempId = `_pending_${crypto.randomUUID()}`;
      createSessionWithId(tempId, sessionTitle);
      // Mark as pending in store
      useViewStore.getState().markSessionPending(tempId, true);

      createMutation.mutate(
        { title: sessionTitle },
        {
          onSuccess: (created) => {
            // Replace temp session with real one from API
            useViewStore.getState().replaceSession(tempId, created.id, created.title);
          },
          onError: () => {
            // Remove temp session and notify user
            deleteSessionLocal(tempId);
            toast.error('Failed to create session');
          },
        },
      );
    },
    [chatSessions.length, createMutation, createSessionWithId, deleteSessionLocal],
  );

  const deleteSessionWithSync = useCallback(
    (id: string) => {
      deleteSessionLocal(id);
      deleteMutation.mutate(id);
    },
    [deleteSessionLocal, deleteMutation],
  );

  const renameSessionWithSync = useCallback(
    (id: string, newTitle: string) => {
      updateSessionTitleLocal(id, newTitle);
      updateMutation.mutate({ id, title: newTitle });
    },
    [updateSessionTitleLocal, updateMutation],
  );

  /** Ask AI to generate a session title from the first user message. */
  const generateTitleWithSync = useCallback(
    async (id: string) => {
      try {
        const result = await generateTitleMutation.mutateAsync(id);
        if (result.title) {
          updateSessionTitleLocal(id, result.title);
        }
      } catch {
        // Best-effort: substring title already set as placeholder
      }
    },
    [generateTitleMutation, updateSessionTitleLocal],
  );

  const addMessageWithSync = useCallback(
    (sessionId: string, role: string, content: string, model?: string) => {
      addMessageMutation.mutate({ sessionId, role, content, ...(model !== undefined && { model }) });
    },
    [addMessageMutation],
  );

  return {
    createSessionWithSync,
    deleteSessionWithSync,
    renameSessionWithSync,
    generateTitleWithSync,
    addMessageWithSync,
    activeSessionId,
    chatSessions,
    selectSession,
    openTab,
    setView,
    isLoading: createMutation.isPending,
  };
}
