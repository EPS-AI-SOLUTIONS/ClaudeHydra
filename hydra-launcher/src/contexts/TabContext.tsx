import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { safeInvoke, isTauri } from '../hooks/useTauri';
import { streamProvider, createStreamingController } from '../providers/streaming';
import { getWitcherRouter, parseWitcherCommand } from '../providers/witcher';

// ============================================================================
// TYPES
// ============================================================================

export type CLIProvider = 'hydra' | 'gemini' | 'jules' | 'deepseek' | 'codex' | 'grok' | 'ollama';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  provider?: CLIProvider;
  isStreaming?: boolean;
}

export interface Tab {
  id: string;
  name: string;
  provider: CLIProvider;
  messages: Message[];
  isActive: boolean;
  isLoading: boolean;
  hasUnread: boolean;
  hasConflict: boolean;
  createdAt: Date;
  lastActivity: Date;
  streamingMessageId?: string;
}

export interface QueueStats {
  totalQueued: number;
  processing: number;
  completedToday: number;
  failedToday: number;
  averageWaitMs: number;
  averageProcessMs: number;
}

export interface FileConflict {
  filePath: string;
  tabsInvolved: string[];
  conflictType: 'concurrent_edit' | 'external_change' | 'uncommitted_changes';
  detectedAt: number;
}

interface TabContextType {
  // Tab management
  tabs: Tab[];
  activeTabId: string | null;
  createTab: (name: string, provider: CLIProvider) => Promise<string>;
  closeTab: (tabId: string) => Promise<void>;
  switchTab: (tabId: string) => void;
  renameTab: (tabId: string, newName: string) => Promise<void>;
  changeTabProvider: (tabId: string, provider: CLIProvider) => void;

  // Default provider for new sessions
  defaultProvider: CLIProvider;
  setDefaultProvider: (provider: CLIProvider) => void;

  // Messaging - with streaming support
  sendMessage: (content: string, useStreaming?: boolean) => Promise<void>;
  stopStreaming: () => void;
  cancelMessage: (promptId: string) => Promise<boolean>;

  // Queue
  queueStats: QueueStats | null;
  isProcessing: boolean;

  // Conflicts
  conflicts: FileConflict[];
  registerFiles: (files: string[]) => Promise<void>;

  // State
  isConnected: boolean;
  isStreaming: boolean;
}

// ============================================================================
// CONTEXT
// ============================================================================

const TabContext = createContext<TabContextType | null>(null);

export const useTabContext = () => {
  const context = useContext(TabContext);
  if (!context) {
    throw new Error('useTabContext must be used within TabProvider');
  }
  return context;
};

// ============================================================================
// PROVIDER
// ============================================================================

interface TabProviderProps {
  children: React.ReactNode;
}

export const TabProvider: React.FC<TabProviderProps> = ({ children }) => {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [conflicts, setConflicts] = useState<FileConflict[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  // Default provider (loaded from localStorage)
  const [defaultProvider, setDefaultProviderState] = useState<CLIProvider>(() => {
    const stored = localStorage.getItem('hydra_ai_provider') as CLIProvider | null;
    return stored || 'hydra';
  });

  // Refs for streaming control
  const streamingControllerRef = useRef(createStreamingController());
  const processingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  useEffect(() => {
    const init = async () => {
      try {
        if (isTauri()) {
          // Create initial tab if none exist
          const existingTabs = await safeInvoke<any[]>('get_tabs');
          if (existingTabs.length === 0) {
            await createTab('HYDRA Session', 'hydra');
          } else {
            // Load existing tabs
            const loadedTabs: Tab[] = existingTabs.map(t => ({
              id: t.tab_id,
              name: t.name,
              provider: t.provider as CLIProvider,
              messages: [],
              isActive: false,
              isLoading: false,
              hasUnread: t.has_unread || false,
              hasConflict: t.has_conflict || false,
              createdAt: new Date(t.created_at || Date.now()),
              lastActivity: new Date(t.last_activity || Date.now()),
            }));
            setTabs(loadedTabs);
            if (loadedTabs.length > 0) {
              setActiveTabId(loadedTabs[0].id);
            }
          }
          setIsConnected(true);
        } else {
          // Browser mode - create mock tab
          const mockTab: Tab = {
            id: 'mock_tab_1',
            name: 'HYDRA Session (Demo)',
            provider: 'hydra',
            messages: [{
              id: '0',
              role: 'system',
              content: '⚔ KODEKS HYDRY OTWARTY ⚔\n\nWitaj w HYDRA 10.6.1 - Multi-Tab Streaming Edition.\nTryb demonstracyjny (przeglądarka).\n\n✨ Streaming włączony - odpowiedzi na żywo!',
              timestamp: new Date(),
            }],
            isActive: true,
            isLoading: false,
            hasUnread: false,
            hasConflict: false,
            createdAt: new Date(),
            lastActivity: new Date(),
          };
          setTabs([mockTab]);
          setActiveTabId(mockTab.id);
          setIsConnected(true);
        }
      } catch (error) {
        console.error('Failed to initialize tabs:', error);
      }
    };

    init();
  }, []);

  // ============================================================================
  // QUEUE PROCESSING (for non-streaming mode)
  // ============================================================================

  useEffect(() => {
    if (!isTauri()) return;

    const processQueue = async () => {
      try {
        const result = await safeInvoke<[string, string] | null>('process_next_prompt');
        if (result) {
          const [promptId, response] = result;
          const parts = promptId.split('_');
          if (parts.length >= 2) {
            const tabId = parts[1];
            handleResponse(tabId, response);
          }
        }

        const stats = await safeInvoke<any>('get_queue_stats');
        setQueueStats({
          totalQueued: stats.total_queued,
          processing: stats.processing,
          completedToday: stats.completed_today,
          failedToday: stats.failed_today,
          averageWaitMs: stats.average_wait_ms,
          averageProcessMs: stats.average_process_ms,
        });
        setIsProcessing(stats.processing > 0);
      } catch (error) {
        console.error('Queue processing error:', error);
      }
    };

    processingIntervalRef.current = setInterval(processQueue, 500);

    return () => {
      if (processingIntervalRef.current) {
        clearInterval(processingIntervalRef.current);
      }
    };
  }, []);

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  const handleResponse = useCallback((tabId: string, response: string) => {
    setTabs(prev => prev.map(tab => {
      if (tab.id === tabId) {
        const newMessage: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: response,
          timestamp: new Date(),
          provider: tab.provider,
        };
        return {
          ...tab,
          messages: [...tab.messages, newMessage],
          isLoading: false,
          hasUnread: tab.id !== activeTabId,
          lastActivity: new Date(),
        };
      }
      return tab;
    }));
  }, [activeTabId]);

  // Update streaming message content
  const updateStreamingMessage = useCallback((tabId: string, messageId: string, content: string, done: boolean) => {
    setTabs(prev => prev.map(tab => {
      if (tab.id === tabId) {
        const updatedMessages = tab.messages.map(msg => {
          if (msg.id === messageId) {
            return {
              ...msg,
              content,
              isStreaming: !done,
            };
          }
          return msg;
        });
        return {
          ...tab,
          messages: updatedMessages,
          isLoading: !done,
          streamingMessageId: done ? undefined : messageId,
          lastActivity: new Date(),
        };
      }
      return tab;
    }));

    if (done) {
      setIsStreaming(false);
    }
  }, []);

  // ============================================================================
  // TAB MANAGEMENT
  // ============================================================================

  const createTab = useCallback(async (name: string, provider: CLIProvider): Promise<string> => {
    try {
      if (isTauri()) {
        const result = await safeInvoke<any>('create_tab', { name, provider });
        const newTab: Tab = {
          id: result.tab_id,
          name: result.name,
          provider: result.provider as CLIProvider,
          messages: [{
            id: '0',
            role: 'system',
            content: `⚔ Zakładka "${name}" utworzona ⚔\n\nProvider: ${provider.toUpperCase()}\n✨ Streaming włączony - odpowiedzi na żywo!`,
            timestamp: new Date(),
          }],
          isActive: true,
          isLoading: false,
          hasUnread: false,
          hasConflict: false,
          createdAt: new Date(),
          lastActivity: new Date(),
        };
        setTabs(prev => [...prev, newTab]);
        setActiveTabId(newTab.id);
        return newTab.id;
      } else {
        const newTab: Tab = {
          id: `mock_tab_${Date.now()}`,
          name,
          provider,
          messages: [{
            id: '0',
            role: 'system',
            content: `⚔ Zakładka "${name}" utworzona (Demo) ⚔\n\nProvider: ${provider.toUpperCase()}\n✨ Streaming włączony!`,
            timestamp: new Date(),
          }],
          isActive: true,
          isLoading: false,
          hasUnread: false,
          hasConflict: false,
          createdAt: new Date(),
          lastActivity: new Date(),
        };
        setTabs(prev => [...prev, newTab]);
        setActiveTabId(newTab.id);
        return newTab.id;
      }
    } catch (error) {
      console.error('Failed to create tab:', error);
      throw error;
    }
  }, []);

  const closeTab = useCallback(async (tabId: string) => {
    try {
      // Stop any streaming for this tab
      const tab = tabs.find(t => t.id === tabId);
      if (tab?.streamingMessageId) {
        streamingControllerRef.current.stop();
      }

      if (isTauri()) {
        await safeInvoke('close_tab', { tabId });
      }

      setTabs(prev => {
        const newTabs = prev.filter(t => t.id !== tabId);
        if (activeTabId === tabId && newTabs.length > 0) {
          setActiveTabId(newTabs[0].id);
        } else if (newTabs.length === 0) {
          setActiveTabId(null);
        }
        return newTabs;
      });
    } catch (error) {
      console.error('Failed to close tab:', error);
    }
  }, [activeTabId, tabs]);

  const switchTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
    setTabs(prev => prev.map(tab => ({
      ...tab,
      isActive: tab.id === tabId,
      hasUnread: tab.id === tabId ? false : tab.hasUnread,
    })));
  }, []);

  const renameTab = useCallback(async (tabId: string, newName: string) => {
    try {
      if (isTauri()) {
        await safeInvoke('rename_tab', { tabId, newName });
      }
      setTabs(prev => prev.map(tab =>
        tab.id === tabId ? { ...tab, name: newName } : tab
      ));
    } catch (error) {
      console.error('Failed to rename tab:', error);
    }
  }, []);

  const changeTabProvider = useCallback((tabId: string, provider: CLIProvider) => {
    setTabs(prev => prev.map(tab =>
      tab.id === tabId ? { ...tab, provider } : tab
    ));
  }, []);

  const setDefaultProvider = useCallback((provider: CLIProvider) => {
    setDefaultProviderState(provider);
    localStorage.setItem('hydra_ai_provider', provider);
  }, []);

  // Listen for provider changes from settings panel
  useEffect(() => {
    const handleProviderChange = (event: CustomEvent<{ provider: CLIProvider }>) => {
      setDefaultProviderState(event.detail.provider);
      // Also update the active tab's provider
      if (activeTabId) {
        changeTabProvider(activeTabId, event.detail.provider);
      }
    };

    window.addEventListener('hydra-provider-change', handleProviderChange as EventListener);
    return () => {
      window.removeEventListener('hydra-provider-change', handleProviderChange as EventListener);
    };
  }, [activeTabId, changeTabProvider]);

  // ============================================================================
  // STREAMING MESSAGING
  // ============================================================================

  const sendMessage = useCallback(async (content: string, useStreaming = true) => {
    if (!activeTabId) return;

    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) return;

    // ========================================================================
    // WITCHER MODE ROUTING
    // Detect /witcher commands and route to appropriate provider
    // ========================================================================
    const witcherRouter = getWitcherRouter();
    const witcherCommand = parseWitcherCommand(content);

    let targetProvider = activeTab.provider;
    let routeInfo = '';

    if (witcherCommand?.sign) {
      // Explicit Witcher sign - route accordingly
      const decision = witcherRouter.route(content);
      targetProvider = decision.provider;
      routeInfo = `\n🐺 [Witcher ${witcherCommand.sign.toUpperCase()}] → ${targetProvider.toUpperCase()}`;
    } else if (content.toLowerCase().includes('/witcher')) {
      // General witcher command - auto-route based on content
      const decision = witcherRouter.route(content);
      targetProvider = decision.provider;
      routeInfo = `\n⚔ [Auto-route: ${decision.taskType}] → ${targetProvider.toUpperCase()} (${Math.round(decision.confidence * 100)}%)`;
    }

    // Add user message immediately
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content + routeInfo,
      timestamp: new Date(),
    };

    // Create placeholder for assistant response
    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      provider: targetProvider,
      isStreaming: useStreaming,
    };

    setTabs(prev => prev.map(tab => {
      if (tab.id === activeTabId) {
        return {
          ...tab,
          messages: [...tab.messages, userMessage, assistantMessage],
          isLoading: true,
          streamingMessageId: useStreaming ? assistantMessageId : undefined,
          lastActivity: new Date(),
        };
      }
      return tab;
    }));

    if (useStreaming) {
      // Use streaming with routed provider
      setIsStreaming(true);

      try {
        await streamProvider(
          targetProvider,
          content,
          (chunk) => {
            setTabs(prev => prev.map(tab => {
              if (tab.id === activeTabId) {
                const updatedMessages = tab.messages.map(msg => {
                  if (msg.id === assistantMessageId) {
                    return {
                      ...msg,
                      content: msg.content + chunk.content,
                      isStreaming: !chunk.done,
                    };
                  }
                  return msg;
                });
                return {
                  ...tab,
                  messages: updatedMessages,
                  isLoading: !chunk.done,
                  streamingMessageId: chunk.done ? undefined : assistantMessageId,
                };
              }
              return tab;
            }));

            if (chunk.done) {
              setIsStreaming(false);
            }
          }
        );
      } catch (error) {
        console.error('Streaming error:', error);
        setIsStreaming(false);
        updateStreamingMessage(activeTabId, assistantMessageId, `⚠ Błąd streamingu: ${error}`, true);
      }
    } else {
      // Non-streaming mode - use queue
      try {
        if (isTauri()) {
          await safeInvoke('send_prompt', {
            tabId: activeTabId,
            content,
            priority: 'normal',
          });
        } else {
          // Browser mode - simulate
          setTimeout(() => {
            handleResponse(activeTabId, getMockResponse(content));
          }, 2000 + Math.random() * 3000);
        }
      } catch (error) {
        console.error('Failed to send message:', error);
        setTabs(prev => prev.map(tab => {
          if (tab.id === activeTabId) {
            return {
              ...tab,
              messages: [...tab.messages.slice(0, -1), {
                ...tab.messages[tab.messages.length - 1],
                content: `⚠ Błąd: ${error}`,
                isStreaming: false,
              }],
              isLoading: false,
            };
          }
          return tab;
        }));
      }
    }
  }, [activeTabId, tabs, handleResponse, updateStreamingMessage]);

  const stopStreaming = useCallback(() => {
    streamingControllerRef.current.stop();
    setIsStreaming(false);

    // Mark streaming message as complete
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab?.streamingMessageId) {
      setTabs(prev => prev.map(tab => {
        if (tab.id === activeTabId) {
          const updatedMessages = tab.messages.map(msg => {
            if (msg.id === tab.streamingMessageId) {
              return {
                ...msg,
                content: msg.content + '\n\n⏹ [Streaming zatrzymany]',
                isStreaming: false,
              };
            }
            return msg;
          });
          return {
            ...tab,
            messages: updatedMessages,
            isLoading: false,
            streamingMessageId: undefined,
          };
        }
        return tab;
      }));
    }
  }, [activeTabId, tabs]);

  const cancelMessage = useCallback(async (promptId: string): Promise<boolean> => {
    if (!isTauri()) return false;
    try {
      return await safeInvoke<boolean>('cancel_prompt', { promptId });
    } catch {
      return false;
    }
  }, []);

  // ============================================================================
  // CONFLICT DETECTION
  // ============================================================================

  const registerFiles = useCallback(async (files: string[]) => {
    if (!activeTabId || !isTauri()) return;

    try {
      await safeInvoke('register_tab_files', { tabId: activeTabId, files });

      const tabConflicts = await safeInvoke<any[]>('get_tab_conflicts', { tabId: activeTabId });
      if (tabConflicts.length > 0) {
        setConflicts(tabConflicts.map(c => ({
          filePath: c.file_path,
          tabsInvolved: c.tabs_involved,
          conflictType: c.conflict_type,
          detectedAt: c.detected_at,
        })));

        setTabs(prev => prev.map(tab =>
          tab.id === activeTabId ? { ...tab, hasConflict: true } : tab
        ));
      }
    } catch (error) {
      console.error('Failed to register files:', error);
    }
  }, [activeTabId]);

  // ============================================================================
  // CONTEXT VALUE
  // ============================================================================

  const value: TabContextType = {
    tabs,
    activeTabId,
    createTab,
    closeTab,
    switchTab,
    renameTab,
    changeTabProvider,
    defaultProvider,
    setDefaultProvider,
    sendMessage,
    stopStreaming,
    cancelMessage,
    queueStats,
    isProcessing,
    conflicts,
    registerFiles,
    isConnected,
    isStreaming,
  };

  return (
    <TabContext.Provider value={value}>
      {children}
    </TabContext.Provider>
  );
};

// ============================================================================
// MOCK RESPONSES (Browser mode)
// ============================================================================

function getMockResponse(input: string): string {
  const lower = input.toLowerCase();

  if (lower.includes('hello') || lower.includes('cześć') || lower.includes('witaj')) {
    return '⚔ Witaj, Wiedźminie! ⚔\n\nJestem HYDRA - Multi-Tab Streaming Edition.\n\nCo mogę dla Ciebie zrobić?';
  }

  if (lower.includes('status') || lower.includes('health')) {
    return '📊 **STATUS SYSTEMU:**\n\n✅ Multi-Tab: Active\n✅ Streaming: Enabled\n✅ Queue: Ready\n✅ Conflict Detection: Active';
  }

  if (lower.includes('test') || lower.includes('demo')) {
    return '✅ **ZADANIE UKOŃCZONO!**\n\nTest demo zakończony sukcesem.';
  }

  return `🤔 Przetwarzam...\n\n**Otrzymano:** "${input}"\n\n*Tryb demonstracyjny (przeglądarka).*`;
}

export default TabContext;
