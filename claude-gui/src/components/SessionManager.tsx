import {
  Check,
  Clock,
  Cpu,
  Edit2,
  MessageSquare,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { type ChatSession, useClaudeStore } from '../stores/claudeStore';

const PROVIDER_ICONS = {
  claude: Sparkles,
  ollama: Cpu,
};

const PROVIDER_COLORS = {
  claude: 'text-purple-400',
  ollama: 'text-green-400',
};

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

export function SessionManager() {
  const {
    chatSessions,
    currentChatSessionId,
    chatHistory,
    defaultProvider,
    createChatSession,
    deleteChatSession,
    selectChatSession,
    updateChatSessionTitle,
  } = useClaudeStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  // Filter sessions by search
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return chatSessions;
    const query = searchQuery.toLowerCase();
    return chatSessions.filter(
      (session: ChatSession) =>
        session.title.toLowerCase().includes(query) ||
        chatHistory[session.id]?.some((msg: { content: string }) =>
          msg.content.toLowerCase().includes(query),
        ),
    );
  }, [chatSessions, chatHistory, searchQuery]);

  // Start editing session title
  const startEditing = (session: ChatSession) => {
    setEditingId(session.id);
    setEditTitle(session.title);
  };

  // Save edited title
  const saveTitle = () => {
    if (editingId && editTitle.trim()) {
      updateChatSessionTitle(editingId, editTitle.trim());
    }
    setEditingId(null);
    setEditTitle('');
  };

  // Cancel editing
  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
  };

  // Handle new chat
  const handleNewChat = () => {
    createChatSession(defaultProvider);
  };

  return (
    <div className="flex flex-col h-full bg-matrix-bg-secondary/50 rounded-lg border border-matrix-border">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-matrix-border">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-matrix-accent" />
          <span className="text-sm font-semibold text-matrix-text">
            Sessions ({chatSessions.length})
          </span>
        </div>
        <button
          onClick={handleNewChat}
          className="flex items-center gap-1.5 px-2 py-1 text-xs bg-matrix-accent/20 text-matrix-accent rounded hover:bg-matrix-accent/30 transition-colors"
          title="New Chat"
        >
          <Plus size={12} />
          New
        </button>
      </div>

      {/* Search */}
      <div className="p-2 border-b border-matrix-border">
        <div className="relative">
          <Search
            size={12}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-matrix-text-dim"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sessions..."
            className="w-full bg-matrix-bg-primary text-matrix-text text-xs pl-7 pr-2 py-1.5 rounded border border-matrix-border focus:border-matrix-accent outline-none"
          />
        </div>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-auto p-2 space-y-1">
        {filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-matrix-text-dim">
            <MessageSquare size={32} className="mb-2 opacity-30" />
            <span className="text-xs">No sessions yet</span>
            <button
              onClick={handleNewChat}
              className="mt-2 text-xs text-matrix-accent hover:underline"
            >
              Start a new chat
            </button>
          </div>
        ) : (
          filteredSessions.map((session: ChatSession) => {
            const isActive = session.id === currentChatSessionId;
            const isEditing = session.id === editingId;
            const messageCount = chatHistory[session.id]?.length || 0;
            const ProviderIcon = PROVIDER_ICONS[session.provider as keyof typeof PROVIDER_ICONS];
            const providerColor = PROVIDER_COLORS[session.provider as keyof typeof PROVIDER_COLORS];

            return (
              <div
                key={session.id}
                onClick={() => !isEditing && selectChatSession(session.id)}
                className={`group relative p-2 rounded cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-matrix-accent/20 border border-matrix-accent/40'
                    : 'hover:bg-matrix-bg-primary border border-transparent'
                }`}
              >
                {/* Provider icon */}
                <div className="flex items-start gap-2">
                  <ProviderIcon size={14} className={`mt-0.5 ${providerColor}`} />

                  <div className="flex-1 min-w-0">
                    {/* Title (editable) */}
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveTitle();
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          className="flex-1 bg-matrix-bg-primary text-matrix-text text-xs px-1.5 py-0.5 rounded border border-matrix-accent outline-none"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            saveTitle();
                          }}
                          className="p-0.5 text-green-400 hover:bg-green-400/20 rounded"
                        >
                          <Check size={12} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelEdit();
                          }}
                          className="p-0.5 text-red-400 hover:bg-red-400/20 rounded"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs font-medium text-matrix-text truncate">
                        {session.title}
                      </div>
                    )}

                    {/* Metadata */}
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-matrix-text-dim">
                      <span className="flex items-center gap-0.5">
                        <Clock size={10} />
                        {formatRelativeTime(session.updatedAt)}
                      </span>
                      <span>{messageCount} msgs</span>
                    </div>
                  </div>

                  {/* Action buttons (visible on hover or active) */}
                  {!isEditing && (
                    <div
                      className={`flex items-center gap-0.5 ${
                        isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      } transition-opacity`}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditing(session);
                        }}
                        className="p-1 text-matrix-text-dim hover:text-matrix-accent hover:bg-matrix-accent/20 rounded transition-colors"
                        title="Rename"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('Delete this session?')) {
                            deleteChatSession(session.id);
                          }
                        }}
                        className="p-1 text-matrix-text-dim hover:text-red-400 hover:bg-red-400/20 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer with provider selector */}
      <div className="px-3 py-2 border-t border-matrix-border text-[10px] text-matrix-text-dim">
        Default:{' '}
        <span className={PROVIDER_COLORS[defaultProvider as keyof typeof PROVIDER_COLORS]}>
          {defaultProvider}
        </span>
      </div>
    </div>
  );
}
