/**
 * viewStore — Zustand store for SPA view routing, sidebar, sessions & tabs.
 *
 * Uses @jaskier/state createAppStore. All store logic lives in @jaskier/state;
 * this module configures the store instance for ClaudeHydra and re-exports
 * the hooks and types that the rest of the app imports.
 */

import { createAppStore } from '@jaskier/state';

const {
  useViewStore: useBaseStore,
  useCurrentSession,
  useCurrentChatHistory,
  useCurrentSessionId,
} = createAppStore({
  storageKey: 'claude-hydra-v4-view',
  devtoolsName: 'ClaudeHydra/ViewStore',
  persistVersion: 2,
});

export const useViewStore = useBaseStore;
{
  useCurrentChatHistory, useCurrentSession, useCurrentSessionId;
}

// ── Types ────────────────────────────────────────────────────────────────────

// Re-export shared data types from @jaskier/state
export type { Artifact, ChatMessage, ChatSession, ChatTab, MessageRole, ViewStoreState } from '@jaskier/state';

// CH-specific ViewId includes 'delegations' and 'analytics' beyond the base ViewType
export type ViewId =
  | 'home'
  | 'chat'
  | 'agents'
  | 'settings'
  | 'logs'
  | 'delegations'
  | 'analytics'
  | 'swarm'
  | 'semantic-cache'
  | 'collab';
