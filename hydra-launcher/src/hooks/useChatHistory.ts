import { useState, useEffect, useCallback } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface ChatSession {
  id: string;
  name: string;
  provider: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const STORAGE_KEY = 'regis_chat_history';
const MAX_SESSIONS = 50;

export const useChatHistory = () => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load sessions from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Convert date strings back to Date objects
        const restored = parsed.map((session: ChatSession) => ({
          ...session,
          createdAt: new Date(session.createdAt),
          updatedAt: new Date(session.updatedAt),
          messages: session.messages.map((msg: ChatMessage) => ({
            ...msg,
            timestamp: new Date(msg.timestamp),
          })),
        }));
        setSessions(restored);
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
    }
    setIsLoaded(true);
  }, []);

  // Save sessions to localStorage
  const saveToStorage = useCallback((newSessions: ChatSession[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSessions));
    } catch (error) {
      console.error('Failed to save chat history:', error);
    }
  }, []);

  // Save a new session or update existing
  const saveSession = useCallback((session: ChatSession) => {
    setSessions((prev) => {
      const existingIndex = prev.findIndex((s) => s.id === session.id);
      let updated: ChatSession[];

      if (existingIndex >= 0) {
        // Update existing session
        updated = [...prev];
        updated[existingIndex] = {
          ...session,
          updatedAt: new Date(),
        };
      } else {
        // Add new session
        updated = [session, ...prev];
      }

      // Limit to MAX_SESSIONS
      if (updated.length > MAX_SESSIONS) {
        updated = updated.slice(0, MAX_SESSIONS);
      }

      saveToStorage(updated);
      return updated;
    });
  }, [saveToStorage]);

  // Delete a session
  const deleteSession = useCallback((sessionId: string) => {
    setSessions((prev) => {
      const updated = prev.filter((s) => s.id !== sessionId);
      saveToStorage(updated);
      return updated;
    });
  }, [saveToStorage]);

  // Clear all sessions
  const clearAllSessions = useCallback(() => {
    setSessions([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Get sessions by provider
  const getSessionsByProvider = useCallback((provider: string) => {
    return sessions.filter((s) => s.provider === provider);
  }, [sessions]);

  // Search sessions by content
  const searchSessions = useCallback((query: string) => {
    const lowerQuery = query.toLowerCase();
    return sessions.filter((session) => {
      if (session.name.toLowerCase().includes(lowerQuery)) return true;
      return session.messages.some((msg) =>
        msg.content.toLowerCase().includes(lowerQuery)
      );
    });
  }, [sessions]);

  // Get recent sessions (last N)
  const getRecentSessions = useCallback((limit: number = 10) => {
    return sessions
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, limit);
  }, [sessions]);

  return {
    sessions,
    isLoaded,
    saveSession,
    deleteSession,
    clearAllSessions,
    getSessionsByProvider,
    searchSessions,
    getRecentSessions,
  };
};

export default useChatHistory;
