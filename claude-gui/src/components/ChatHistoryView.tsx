import {
  Brain,
  Check,
  Download,
  Edit2,
  FileJson,
  FileSearch,
  FileText,
  Link2,
  Loader2,
  MessageSquare,
  Plus,
  Search,
  Sparkles,
  Tag,
  Trash2,
  Wand2,
  X,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { type ChatSession, type ChatSessionSummary, useChatHistory } from '../hooks/useChatHistory';
import { type EnhancedSession, type SessionAIMetadata, useSessionAI } from '../hooks/useSessionAI';
import { formatSimilarity } from '../utils/format';
import { CodeBlock, InlineCode } from './CodeBlock';

// Local storage key for AI metadata
const AI_METADATA_KEY = 'claude-gui-session-ai-metadata';

// Load AI metadata from localStorage
function loadAIMetadata(): Map<string, SessionAIMetadata> {
  try {
    const stored = localStorage.getItem(AI_METADATA_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return new Map(Object.entries(parsed));
    }
  } catch (e) {
    console.error('Failed to load AI metadata:', e);
  }
  return new Map();
}

// Save AI metadata to localStorage
function saveAIMetadata(metadata: Map<string, SessionAIMetadata>) {
  try {
    const obj = Object.fromEntries(metadata);
    localStorage.setItem(AI_METADATA_KEY, JSON.stringify(obj));
  } catch (e) {
    console.error('Failed to save AI metadata:', e);
  }
}

// Export helpers
function exportToJson(session: ChatSession): string {
  const exportData = {
    id: session.id,
    title: session.title,
    created_at: session.created_at,
    updated_at: session.updated_at,
    model: session.model,
    message_count: session.message_count,
    messages: session.messages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      model: msg.model,
      tokens: msg.tokens,
    })),
  };
  return JSON.stringify(exportData, null, 2);
}

function exportToMarkdown(session: ChatSession): string {
  const lines: string[] = [
    `# ${session.title}`,
    '',
    `**Session ID:** ${session.id}`,
    `**Created:** ${new Date(session.created_at).toLocaleString('pl-PL')}`,
    `**Updated:** ${new Date(session.updated_at).toLocaleString('pl-PL')}`,
    session.model ? `**Model:** ${session.model}` : '',
    `**Messages:** ${session.message_count}`,
    '',
    '---',
    '',
  ];

  session.messages.forEach((msg) => {
    const timestamp = new Date(msg.timestamp).toLocaleString('pl-PL');
    const roleEmoji = msg.role === 'user' ? '👤' : msg.role === 'assistant' ? '🤖' : '⚙️';
    const roleLabel = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);

    lines.push(`### ${roleEmoji} ${roleLabel}`);
    lines.push(`*${timestamp}*${msg.model ? ` • ${msg.model}` : ''}`);
    lines.push('');
    lines.push(msg.content);
    lines.push('');
    lines.push('---');
    lines.push('');
  });

  return lines.join('\n');
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
}

// Tag component
function TagBadge({ tag, onRemove }: { tag: string; onRemove?: () => void }) {
  const colors: Record<string, string> = {
    coding: 'bg-blue-500/20 text-blue-400',
    debugging: 'bg-red-500/20 text-red-400',
    architecture: 'bg-purple-500/20 text-purple-400',
    documentation: 'bg-green-500/20 text-green-400',
    refactoring: 'bg-yellow-500/20 text-yellow-400',
    testing: 'bg-cyan-500/20 text-cyan-400',
    devops: 'bg-orange-500/20 text-orange-400',
    database: 'bg-pink-500/20 text-pink-400',
    api: 'bg-indigo-500/20 text-indigo-400',
    frontend: 'bg-emerald-500/20 text-emerald-400',
    backend: 'bg-violet-500/20 text-violet-400',
    security: 'bg-rose-500/20 text-rose-400',
    performance: 'bg-amber-500/20 text-amber-400',
    learning: 'bg-teal-500/20 text-teal-400',
    brainstorming: 'bg-lime-500/20 text-lime-400',
    review: 'bg-fuchsia-500/20 text-fuchsia-400',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${
        colors[tag] || 'bg-gray-500/20 text-gray-400'
      }`}
    >
      <Tag size={10} />
      {tag}
      {onRemove && (
        <button type="button" onClick={onRemove} className="hover:text-white">
          <X size={10} />
        </button>
      )}
    </span>
  );
}

export function ChatHistoryView() {
  const {
    sessions,
    currentSession,
    loading,
    loadSessions,
    loadSession,
    createSession,
    deleteSession,
    updateTitle,
    clearAll,
    setCurrentSession,
  } = useChatHistory();

  const {
    isProcessing,
    processingTask,
    checkOllama,
    generateSmartTitle,
    generateSummary,
    generateTags,
    processSession,
    findRelatedSessions,
  } = useSessionAI();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [aiMetadata, setAiMetadata] = useState<Map<string, SessionAIMetadata>>(loadAIMetadata);
  const [ollamaAvailable, setOllamaAvailable] = useState(false);
  const [relatedSessions, setRelatedSessions] = useState<EnhancedSession[]>([]);
  const [showRelated, setShowRelated] = useState(false);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
    checkOllama().then(setOllamaAvailable);
  }, [loadSessions, checkOllama]);

  // Find related sessions when current session changes
  useEffect(() => {
    if (currentSession && sessions.length > 1) {
      findRelatedSessions(currentSession, sessions).then(setRelatedSessions);
    } else {
      setRelatedSessions([]);
    }
  }, [currentSession, sessions, findRelatedSessions]);

  // Get AI metadata for a session
  const getSessionAI = (sessionId: string): SessionAIMetadata | undefined => {
    return aiMetadata.get(sessionId);
  };

  // Update AI metadata for a session
  const updateSessionAI = (sessionId: string, data: Partial<SessionAIMetadata>) => {
    setAiMetadata((prev) => {
      const updated = new Map(prev);
      const existing = updated.get(sessionId) || {};
      updated.set(sessionId, { ...existing, ...data, lastProcessed: new Date().toISOString() });
      saveAIMetadata(updated);
      return updated;
    });
  };

  // Filter sessions based on search query (including AI metadata)
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;

    const query = searchQuery.toLowerCase().trim();
    return sessions.filter((session) => {
      // Basic search
      if (session.title.toLowerCase().includes(query)) return true;
      if (session.preview?.toLowerCase().includes(query)) return true;
      if (session.model?.toLowerCase().includes(query)) return true;

      // AI metadata search
      const ai = aiMetadata.get(session.id);
      if (ai) {
        if (ai.smartTitle?.toLowerCase().includes(query)) return true;
        if (ai.summary?.toLowerCase().includes(query)) return true;
        if (ai.tags?.some((t) => t.toLowerCase().includes(query))) return true;
      }

      return false;
    });
  }, [sessions, searchQuery, aiMetadata]);

  const handleNewChat = async () => {
    const title = `Chat ${new Date().toLocaleString('pl-PL')}`;
    await createSession(title);
  };

  const _handleSelect = async (session: ChatSessionSummary) => {
    await loadSession(session.id);
  };

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (confirm('Delete this chat session?')) {
      await deleteSession(sessionId);
      // Also remove AI metadata
      setAiMetadata((prev) => {
        const updated = new Map(prev);
        updated.delete(sessionId);
        saveAIMetadata(updated);
        return updated;
      });
    }
  };

  const handleStartEdit = (e: React.MouseEvent, session: ChatSessionSummary) => {
    e.stopPropagation();
    setEditingId(session.id);
    setEditTitle(session.title);
  };

  const handleSaveEdit = async (sessionId: string) => {
    if (editTitle.trim()) {
      await updateTitle(sessionId, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
  };

  // AI Actions
  const handleGenerateTitle = async () => {
    if (!currentSession || !ollamaAvailable) return;
    try {
      const title = await generateSmartTitle(currentSession);
      updateSessionAI(currentSession.id, { smartTitle: title });
      // Optionally update the actual title
      await updateTitle(currentSession.id, title);
    } catch (e) {
      console.error('Failed to generate title:', e);
    }
  };

  const handleGenerateSummary = async () => {
    if (!currentSession || !ollamaAvailable) return;
    try {
      const summary = await generateSummary(currentSession);
      updateSessionAI(currentSession.id, { summary });
    } catch (e) {
      console.error('Failed to generate summary:', e);
    }
  };

  const handleGenerateTags = async () => {
    if (!currentSession || !ollamaAvailable) return;
    try {
      const tags = await generateTags(currentSession);
      updateSessionAI(currentSession.id, { tags });
    } catch (e) {
      console.error('Failed to generate tags:', e);
    }
  };

  const handleProcessAll = async () => {
    if (!currentSession || !ollamaAvailable) return;
    try {
      const metadata = await processSession(currentSession);
      updateSessionAI(currentSession.id, metadata);
      if (metadata.smartTitle) {
        await updateTitle(currentSession.id, metadata.smartTitle);
      }
    } catch (e) {
      console.error('Failed to process session:', e);
    }
  };

  // Export handlers
  const handleExportJson = () => {
    if (!currentSession) return;
    const content = exportToJson(currentSession);
    const filename = `${sanitizeFilename(currentSession.title)}_${currentSession.id.slice(0, 8)}.json`;
    downloadFile(content, filename, 'application/json');
  };

  const handleExportMarkdown = () => {
    if (!currentSession) return;
    const content = exportToMarkdown(currentSession);
    const filename = `${sanitizeFilename(currentSession.title)}_${currentSession.id.slice(0, 8)}.md`;
    downloadFile(content, filename, 'text/markdown');
  };

  const handleExportAllJson = () => {
    if (sessions.length === 0) return;
    const exportData = {
      exported_at: new Date().toISOString(),
      session_count: sessions.length,
      sessions: sessions,
    };
    const content = JSON.stringify(exportData, null, 2);
    const filename = `chat_history_${new Date().toISOString().slice(0, 10)}.json`;
    downloadFile(content, filename, 'application/json');
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return `${days} days ago`;
    } else {
      return date.toLocaleDateString('pl-PL');
    }
  };

  const currentAI = currentSession ? getSessionAI(currentSession.id) : undefined;

  return (
    <div className="h-full flex gap-4">
      {/* Sessions List */}
      <div className="w-80 flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-semibold text-matrix-accent">Chat History</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleNewChat}
              className="glass-button flex items-center gap-1.5 text-sm px-3 py-1.5"
              title="New Chat"
            >
              <Plus size={14} />
              New
            </button>
            <button
              onClick={handleExportAllJson}
              disabled={sessions.length === 0}
              className="glass-button flex items-center gap-1.5 text-sm px-2 py-1.5"
              title="Export all sessions to JSON"
            >
              <Download size={14} />
            </button>
            <button
              onClick={() => clearAll()}
              disabled={sessions.length === 0}
              className="glass-button flex items-center gap-1.5 text-sm px-2 py-1.5 hover:text-red-400"
              title="Clear all chats"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative mb-3">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-matrix-text-dim"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sessions, tags, summaries..."
            className="w-full glass-input pl-9 pr-8 py-2 text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-matrix-text-dim hover:text-matrix-accent transition-colors"
            >
              <XCircle size={16} />
            </button>
          )}
        </div>

        {/* Ollama Status */}
        <div className="flex items-center gap-2 mb-2 text-xs">
          <div
            className={`w-2 h-2 rounded-full ${
              ollamaAvailable ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <span className="text-matrix-text-dim">
            AI: {ollamaAvailable ? 'Available' : 'Offline'}
          </span>
        </div>

        {/* Search Results Count */}
        {searchQuery && (
          <div className="text-xs text-matrix-text-dim mb-2">
            Found {filteredSessions.length} of {sessions.length} sessions
          </div>
        )}

        {/* Sessions List */}
        <div className="flex-1 glass-panel p-2 overflow-y-auto">
          {loading && sessions.length === 0 ? (
            <div className="text-center py-8 text-matrix-text-dim">
              <div className="animate-pulse">Loading...</div>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="text-center py-8 text-matrix-text-dim">
              <MessageSquare size={32} className="mx-auto mb-2 opacity-50" />
              {searchQuery ? (
                <>
                  <p className="text-sm">No sessions match "{searchQuery}"</p>
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-xs mt-2 text-matrix-accent hover:underline"
                  >
                    Clear search
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm">No chat sessions yet.</p>
                  <p className="text-xs mt-1">Click "New" to start a chat.</p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredSessions.map((session) => {
                const _sessionAI = getSessionAI(session.id);
                return (
                  {/* biome-ignore lint/a11y/useKeyWithClickEvents: interactive list item */}
                  <div
                    role="button"
                    tabIndex={0}
                    key={session.id}
                    onClick={() => handleSelect(session)}
                    onKeyDown={(_e) => { if (e.key === 'Enter' || e.key === ' ') handleSelect(session); }}
                    className={`p-3 rounded-lg cursor-pointer transition-all duration-200 group ${
                      currentSession?.id === session.id
                        ? 'bg-matrix-accent/20 border border-matrix-accent/40'
                        : 'hover:bg-matrix-accent/10 border border-transparent'
                    }`}
                  >
                    {editingId === session.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(session.id);
                            if (e.key === 'Escape') handleCancelEdit();
                          }}
                          className="flex-1 bg-matrix-bg-primary/50 border border-matrix-accent/30 rounded px-2 py-1 text-sm text-matrix-text-primary focus:outline-none focus:border-matrix-accent"
                          {/* biome-ignore lint/a11y/noAutofocus: inline edit requires focus */}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSaveEdit(session.id);
                          }}
                          className="text-matrix-accent hover:text-matrix-accent-light"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancelEdit();
                          }}
                          className="text-matrix-text-dim hover:text-red-400"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-matrix-text-primary truncate flex-1">
                            {session.title}
                          </span>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => handleStartEdit(e, session)}
                              className="p-1 hover:text-matrix-accent"
                              title="Rename"
                            >
                              <Edit2 size={12} />
                            </button>
                            <button
                              onClick={(e) => handleDelete(e, session.id)}
                              className="p-1 hover:text-red-400"
                              title="Delete"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-1.5 text-xs text-matrix-text-dim">
                          <span>{session.message_count} messages</span>
                          <span>{formatDate(session.updated_at)}</span>
                        </div>

                        {/* AI Tags */}
                        {sessionAI?.tags && sessionAI.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {sessionAI.tags.slice(0, 3).map((tag) => (
                              <TagBadge key={tag} tag={tag} />
                            ))}
                          </div>
                        )}

                        {session.preview && !sessionAI?.summary && (
                          <p className="text-xs text-matrix-text-dim mt-1.5 truncate opacity-70">
                            {session.preview}
                          </p>
                        )}

                        {/* AI Summary preview */}
                        {sessionAI?.summary && (
                          <p className="text-xs text-cyan-400/70 mt-1.5 truncate">
                            <Sparkles size={10} className="inline mr-1" />
                            {sessionAI.summary}
                          </p>
                        )}

                        {session.model && (
                          <span className="inline-block mt-1.5 text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400">
                            {session.model}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 flex flex-col">
        {currentSession ? (
          <>
            {/* Chat Header */}
            <_div _className="flex items-center justify-between mb-4">
              <_div>
                <_h3 _className="text-lg font-semibold text-matrix-accent flex items-center gap-2">
                  <_MessageSquare _size={20} />
                  {currentSession.title}
                </_h3>
                <_p _className="text-xs text-matrix-text-dim mt-0.5">
                  {currentSession.message_count} messagescurrentSession.model && ` • ${currentSession.model}`` • Created ${new Date(currentSession.created_at).toLocaleDateString('pl-PL')}`
                </p>
              </div>
              <div className="flex items-center gap-2">ollamaAvailable && (
                  <div className="flex items-center gap-1 mr-2 border-r border-matrix-border pr-2">
                    <button
                      onClick={handleProcessAll}
                      disabled={isProcessing}
                      className="glass-button flex items-center gap-1.5 text-xs px-2 py-1.5 text-purple-400 hover:text-purple-300"
                      title="Process all with AI"
                    >
                      {isProcessing ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Wand2 size={14} />
                      )}
                      AI
                    </button>
                  </div>
                )
                <div className="flex items-center gap-1 mr-2">
                  <button
                    onClick={handleExportJson}
                    className="glass-button flex items-center gap-1.5 text-xs px-2 py-1.5"
                    title="Export to JSON"
                  >
                    <FileJson size={14} />
                    JSON
                  </button>
                  <button
                    onClick={handleExportMarkdown}
                    className="glass-button flex items-center gap-1.5 text-xs px-2 py-1.5"
                    title="Export to Markdown"
                  >
                    <FileText size={14} />
                    MD
                  </button>
                </div>
                <button
                  onClick={() => setCurrentSession(null)}
                  className="glass-button text-sm px-3 py-1.5"
                >
                  Close
                </button>
              </div>
            </div>isProcessing && processingTask && (
              <div className="mb-3 flex items-center gap-2 text-xs text-purple-400 bg-purple-500/10 px-3 py-2 rounded">
                <Loader2 size={14} className="animate-spin" />
                {processingTask}
              </div>
            )currentAI && (
              <div className="mb-4 glass-card p-3 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-purple-400">
                  <Brain size={16} />
                  AI Insights
                </div>

                {/* Summary */}
                {currentAI.summary && (
                  <div>
                    <div className="text-xs text-matrix-text-dim mb-1 flex items-center gap-1">
                      <FileSearch size={12} />
                      Summary
                    </div>
                    <p className="text-sm text-matrix-text-primary">{currentAI.summary}</p>
                  </div>
                )}

                {/* Tags */}
                {currentAI.tags && currentAI.tags.length > 0 && (
                  <div>
                    <div className="text-xs text-matrix-text-dim mb-1 flex items-center gap-1">
                      <Tag size={12} />
                      Tags
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {currentAI.tags.map((tag) => (
                        <TagBadge key={tag} tag={tag} />
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Actions */}
                {ollamaAvailable && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-matrix-border">
                    <button
                      onClick={handleGenerateTitle}
                      disabled={isProcessing}
                      className="text-xs text-matrix-text-dim hover:text-matrix-accent flex items-center gap-1"
                    >
                      <Sparkles size={12} />
                      Regenerate Title
                    </button>
                    <button
                      onClick={handleGenerateSummary}
                      disabled={isProcessing}
                      className="text-xs text-matrix-text-dim hover:text-matrix-accent flex items-center gap-1"
                    >
                      <FileSearch size={12} />
                      Update Summary
                    </button>
                    <button
                      onClick={handleGenerateTags}
                      disabled={isProcessing}
                      className="text-xs text-matrix-text-dim hover:text-matrix-accent flex items-center gap-1"
                    >
                      <Tag size={12} />
                      Update Tags
                    </button>
                  </div>
                )}
              </div>
            )!currentAI && ollamaAvailable && (
              <div className="mb-4">
                <button
                  onClick={handleProcessAll}
                  disabled={isProcessing}
                  className="glass-button flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300"
                >
                  {isProcessing ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Wand2 size={16} />
                  )}
                  Generate AI Summary & Tags
                </button>
              </div>
            )relatedSessions.length > 0 && (
              <div className="mb-4">
                <button
                  onClick={() => setShowRelated(!showRelated)}
                  className="flex items-center gap-2 text-xs text-matrix-text-dim hover:text-matrix-accent"
                >
                  <Link2 size={14} />
                  {showRelated ? 'Hide' : 'Show'} {relatedSessions.length} related sessions
                </button>

                {showRelated && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {relatedSessions.filter(Boolean).map((session) => (
                      <button
                        key={session.id}
                        onClick={() => loadSession(session.id)}
                        className="glass-card px-3 py-2 text-xs hover:bg-matrix-accent/10 flex items-center gap-2"
                      >
                        <MessageSquare size={12} />
                        <span className="truncate max-w-[150px]">{session.title}</span>
                        <span className="text-matrix-text-dim">
                          ({formatSimilarity(session.similarity)}% match)
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
            <div className="flex-1 glass-panel p-4 overflow-y-auto">
              {currentSession.messages.length === 0 ? (
                <div className="text-center py-8 text-matrix-text-dim">
                  <p>No messages in this session.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {currentSession.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] p-3 rounded-xl shadow-lg ${
                          message.role === 'user'
                            ? 'bg-white/10 border border-white/25 backdrop-blur-sm'
                            : message.role === 'system'
                              ? 'bg-yellow-500/10 border border-yellow-500/20 backdrop-blur-sm'
                              : 'bg-black/30 border border-white/10 backdrop-blur-sm'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`text-xs font-semibold ${
                              message.role === 'user'
                                ? 'text-white'
                                : message.role === 'system'
                                  ? 'text-yellow-400'
                                  : 'text-white/70'
                            }`}
                          >
                            {message.role.charAt(0).toUpperCase() + message.role.slice(1)}
                          </span>
                          <span className="text-[10px] text-matrix-text-dim">
                            {new Date(message.timestamp).toLocaleTimeString('pl-PL')}
                          </span>
                          {message.model && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60">
                              {message.model}
                            </span>
                          )}
                        </div>
                        <div className="prose prose-invert prose-sm max-w-none text-matrix-text-primary">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeHighlight]}
                            components={{
                              code({ className, children, node }) {
                                const match = /language-(\w+)/.exec(className || '');
                                const isInline = !node?.position ||
                                  (node.position.start.line === node.position.end.line && !match);
                                const codeContent = String(children).replace(/\n$/, '');

                                if (isInline) {
                                  return <InlineCode>{children}</InlineCode>;
                                }

                                return (
                                  <CodeBlock
                                    code={codeContent}
                                    language={match ? match[1] : undefined}
                                    className={className}
                                  />
                                );
                              },
                              pre({ children }) {
                                return <>{children}</>;
                              },
                              p({ children }) {
                                return <p className="mb-2 last:mb-0">{children}</p>;
                              },
                              ul({ children }) {
                                return <ul className="list-disc list-inside mb-2">{children}</ul>;
                              },
                              ol({ children }) {
                                return <ol className="list-decimal list-inside mb-2">{children}</ol>;
                              },
                              a({ href, children }) {
                                return (
                                  <a
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-matrix-accent hover:underline"
                                  >
                                    {children}
                                  </a>
                                );
                              },
                              blockquote({ children }) {
                                return (
                                  <blockquote className="border-l-2 border-matrix-accent/50 pl-3 italic text-matrix-text-dim">
                                    {children}
                                  </blockquote>
                                );
                              },
                              h1({ children }) {
                                return <h1 className="text-xl font-bold text-matrix-accent mb-2">{children}</h1>;
                              },
                              h2({ children }) {
                                return <h2 className="text-lg font-bold text-matrix-accent mb-2">{children}</h2>;
                              },
                              h3({ children }) {
                                return <h3 className="text-base font-semibold text-matrix-accent mb-1">{children}</h3>;
                              },
                              table({ children }) {
                                return (
                                  <div className="overflow-x-auto my-2">
                                    <table className="min-w-full border border-matrix-accent/30 rounded">
                                      {children}
                                    </table>
                                  </div>
                                );
                              },
                              th({ children }) {
                                return (
                                  <th className="px-3 py-1.5 bg-matrix-accent/10 border-b border-matrix-accent/30 text-left text-xs font-semibold">
                                    {children}
                                  </th>
                                );
                              },
                              td({ children }) {
                                return (
                                  <td className="px-3 py-1.5 border-b border-matrix-accent/10 text-xs">
                                    {children}
                                  </td>
                                );
                              },
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 glass-panel flex items-center justify-center">
            <div className="text-center text-matrix-text-dim">
              <ChevronRight size=48className="mx-auto mb-4 opacity-30" />
              <p>Select a chat session to view its contents</p>
              <p className="text-xs mt-2">or create a new one</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
