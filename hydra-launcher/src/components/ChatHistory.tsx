import React, { useState, useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useChatHistory, ChatSession } from '../hooks/useChatHistory';
import {
  History,
  Search,
  Trash2,
  MessageSquare,
  Clock,
  X,
  RotateCcw,
} from 'lucide-react';

interface ChatHistoryProps {
  onRestoreSession?: (session: ChatSession) => void;
  isOpen: boolean;
  onClose: () => void;
}

const ChatHistory: React.FC<ChatHistoryProps> = ({
  onRestoreSession,
  isOpen,
  onClose,
}) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const {
    sessions,
    isLoaded,
    deleteSession,
    clearAllSessions,
    searchSessions,
    getRecentSessions,
  } = useChatHistory();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  // Filter sessions based on search
  const filteredSessions = useMemo(() => {
    if (searchQuery.trim()) {
      return searchSessions(searchQuery);
    }
    return getRecentSessions(20);
  }, [searchQuery, searchSessions, getRecentSessions]);

  // Format relative time
  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Teraz';
    if (minutes < 60) return `${minutes}m temu`;
    if (hours < 24) return `${hours}h temu`;
    if (days < 7) return `${days}d temu`;
    return date.toLocaleDateString('pl-PL');
  };

  // Get provider icon
  const getProviderIcon = (provider: string) => {
    const icons: Record<string, string> = {
      claude: '🤖',
      gemini: '🔵',
      jules: '🟣',
      codex: '🟢',
      grok: '⚫',
      ollama: '🦙',
    };
    return icons[provider.toLowerCase()] || '💬';
  };

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-y-0 right-0 w-80 z-50 flex flex-col transition-transform duration-300 ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      } ${
        isLight
          ? 'bg-white/95 border-l border-gray-200'
          : 'bg-black/95 border-l border-gray-800'
      } backdrop-blur-lg`}
    >
      {/* Header */}
      <div className={`p-3 border-b ${isLight ? 'border-gray-200' : 'border-gray-800'}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <History size={16} className={isLight ? 'text-gray-700' : 'text-gray-300'} />
            <span className={`text-sm font-mono font-semibold tracking-wider ${
              isLight ? 'text-gray-800' : 'text-gray-200'
            }`}>
              HISTORIA
            </span>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded transition-colors ${
              isLight
                ? 'hover:bg-gray-100 text-gray-600'
                : 'hover:bg-gray-800 text-gray-400'
            }`}
          >
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className={`flex items-center gap-2 px-2 py-1.5 rounded ${
          isLight ? 'bg-gray-100' : 'bg-gray-900'
        }`}>
          <Search size={12} className={isLight ? 'text-gray-400' : 'text-gray-500'} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Szukaj w historii..."
            className={`flex-1 bg-transparent text-xs font-mono outline-none ${
              isLight
                ? 'text-gray-800 placeholder:text-gray-400'
                : 'text-gray-200 placeholder:text-gray-600'
            }`}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className={isLight ? 'text-gray-400 hover:text-gray-600' : 'text-gray-500 hover:text-gray-300'}
            >
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-auto p-2">
        {!isLoaded ? (
          <div className={`text-center py-8 text-xs font-mono ${
            isLight ? 'text-gray-400' : 'text-gray-600'
          }`}>
            Ładowanie...
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className={`text-center py-8 ${
            isLight ? 'text-gray-400' : 'text-gray-600'
          }`}>
            <MessageSquare size={24} className="mx-auto mb-2 opacity-50" />
            <p className="text-xs font-mono">
              {searchQuery ? 'Brak wyników' : 'Brak zapisanych sesji'}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredSessions.map((session) => (
              <div
                key={session.id}
                className={`group p-2 rounded cursor-pointer transition-all ${
                  selectedSession?.id === session.id
                    ? isLight
                      ? 'bg-gray-200'
                      : 'bg-gray-800'
                    : isLight
                      ? 'hover:bg-gray-100'
                      : 'hover:bg-gray-900'
                }`}
                onClick={() => setSelectedSession(
                  selectedSession?.id === session.id ? null : session
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm">{getProviderIcon(session.provider)}</span>
                    <span className={`text-[10px] font-mono font-medium truncate ${
                      isLight ? 'text-gray-800' : 'text-gray-200'
                    }`}>
                      {session.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {onRestoreSession && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRestoreSession(session);
                        }}
                        className={`p-1 rounded ${
                          isLight
                            ? 'hover:bg-gray-200 text-blue-600'
                            : 'hover:bg-gray-700 text-blue-400'
                        }`}
                        title="Przywróć sesję"
                      >
                        <RotateCcw size={10} />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSession(session.id);
                      }}
                      className={`p-1 rounded ${
                        isLight
                          ? 'hover:bg-red-100 text-red-600'
                          : 'hover:bg-red-900/30 text-red-400'
                      }`}
                      title="Usuń"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-1">
                  <Clock size={8} className={isLight ? 'text-gray-400' : 'text-gray-600'} />
                  <span className={`text-[8px] font-mono ${
                    isLight ? 'text-gray-500' : 'text-gray-500'
                  }`}>
                    {formatRelativeTime(session.updatedAt)}
                  </span>
                  <span className={`text-[8px] font-mono ${
                    isLight ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    • {session.messages.length} wiadomości
                  </span>
                </div>

                {/* Expanded preview */}
                {selectedSession?.id === session.id && session.messages.length > 0 && (
                  <div className={`mt-2 pt-2 border-t ${
                    isLight ? 'border-gray-200' : 'border-gray-700'
                  }`}>
                    <div className="space-y-1 max-h-32 overflow-auto">
                      {session.messages.slice(-3).map((msg, i) => (
                        <div key={i} className={`text-[9px] font-mono ${
                          msg.role === 'user'
                            ? isLight ? 'text-blue-700' : 'text-blue-400'
                            : isLight ? 'text-gray-600' : 'text-gray-400'
                        }`}>
                          <span className="font-semibold">
                            {msg.role === 'user' ? 'USER' : 'REGIS'}:
                          </span>{' '}
                          <span className="line-clamp-2">{msg.content}</span>
                        </div>
                      ))}
                    </div>
                    {onRestoreSession && (
                      <button
                        onClick={() => onRestoreSession(session)}
                        className={`mt-2 w-full py-1.5 rounded text-[9px] font-mono font-medium ${
                          isLight
                            ? 'bg-black text-white hover:bg-gray-800'
                            : 'bg-white text-black hover:bg-gray-200'
                        }`}
                      >
                        Przywróć tę sesję
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {sessions.length > 0 && (
        <div className={`p-2 border-t ${isLight ? 'border-gray-200' : 'border-gray-800'}`}>
          {confirmClear ? (
            <div className="flex items-center justify-between">
              <span className={`text-[9px] font-mono ${
                isLight ? 'text-red-600' : 'text-red-400'
              }`}>
                Na pewno?
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    clearAllSessions();
                    setConfirmClear(false);
                  }}
                  className={`px-2 py-1 rounded text-[9px] font-mono ${
                    isLight
                      ? 'bg-red-600 text-white'
                      : 'bg-red-500 text-white'
                  }`}
                >
                  Tak
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className={`px-2 py-1 rounded text-[9px] font-mono ${
                    isLight
                      ? 'bg-gray-200 text-gray-800'
                      : 'bg-gray-800 text-gray-200'
                  }`}
                >
                  Nie
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmClear(true)}
              className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-[9px] font-mono ${
                isLight
                  ? 'text-red-600 hover:bg-red-50'
                  : 'text-red-400 hover:bg-red-900/20'
              }`}
            >
              <Trash2 size={10} />
              Wyczyść historię ({sessions.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ChatHistory;
