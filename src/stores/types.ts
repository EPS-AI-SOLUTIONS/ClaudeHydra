// src/stores/types.ts
import type { ChatSession, ChatTab as SharedChatTab } from '@/shared/types/store';

export type ViewId = 'home' | 'chat' | 'agents' | 'settings' | 'logs' | 'delegations';

export type Session = ChatSession;
export type ChatTab = SharedChatTab;

export interface Artifact {
  id: string;
  code: string;
  language: string;
  title?: string;
}
