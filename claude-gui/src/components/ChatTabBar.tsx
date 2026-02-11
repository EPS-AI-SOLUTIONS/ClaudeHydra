import { MessageSquare, Plus, X } from 'lucide-react';
import { useCallback } from 'react';
import { useChatHistory } from '../hooks/useChatHistory';
import { useClaudeStore } from '../stores/claudeStore';

export function ChatTabBar() {
  const {
    openTabs,
    chatSessions,
    currentChatSessionId,
    switchTab,
    closeTab,
    setCurrentView,
    setActiveSessionId,
  } = useClaudeStore();
  const { createSession } = useChatHistory();

  const handleNewTab = useCallback(async () => {
    const sessions = useClaudeStore.getState().chatSessions;
    const title = `Chat ${sessions.length + 1}`;
    const session = await createSession(title);
    if (session) {
      setActiveSessionId(session.id);
      // openTab is called by createChatSession via store
      setCurrentView('terminal');
    }
  }, [createSession, setActiveSessionId, setCurrentView]);

  const handleSwitchTab = useCallback(
    (sessionId: string) => {
      setActiveSessionId(sessionId);
      switchTab(sessionId);
    },
    [setActiveSessionId, switchTab],
  );

  const handleCloseTab = useCallback(
    (e: React.MouseEvent, sessionId: string) => {
      e.stopPropagation();
      closeTab(sessionId);
    },
    [closeTab],
  );

  if (openTabs.length === 0) return null;

  return (
    <div className="flex items-center gap-1 px-1 py-1 glass-panel rounded-t-lg rounded-b-none border-b-0 overflow-x-auto scrollbar-hide">
      {openTabs.map((tabId) => {
        const session = chatSessions.find((s) => s.id === tabId);
        if (!session) return null;
        const isActive = tabId === currentChatSessionId;

        return (
          <button
            key={tabId}
            type="button"
            onClick={() => handleSwitchTab(tabId)}
            className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all max-w-[180px] ${
              isActive
                ? 'bg-matrix-accent/20 text-matrix-accent border border-matrix-accent/30'
                : 'text-matrix-text-dim hover:bg-matrix-accent/10 hover:text-matrix-text border border-transparent'
            }`}
          >
            <MessageSquare size={12} className="flex-shrink-0" />
            <span className="truncate">{session.title}</span>
            <button
              type="button"
              onClick={(e) => handleCloseTab(e, tabId)}
              className="flex-shrink-0 p-0.5 rounded hover:bg-red-500/30 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Zamknij zakładkę"
            >
              <X size={10} />
            </button>
          </button>
        );
      })}

      {/* New tab button */}
      <button
        type="button"
        onClick={handleNewTab}
        className="flex-shrink-0 p-1.5 rounded-lg text-matrix-text-dim hover:text-matrix-accent hover:bg-matrix-accent/10 transition-colors"
        title="Nowa zakładka"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
