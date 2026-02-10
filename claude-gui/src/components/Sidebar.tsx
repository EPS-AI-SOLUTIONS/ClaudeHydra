import {
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Edit2,
  Home,
  Menu,
  MessageSquare,
  MessagesSquare,
  Plus,
  Settings,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ChatSessionSummary, useChatHistory } from '../hooks/useChatHistory';
import { useClaudeStore } from '../stores/claudeStore';

interface NavItem {
  id: 'home' | 'terminal' | 'settings';
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { id: 'home', label: 'Start', icon: <Home size={18} /> },
  { id: 'terminal', label: 'Terminal', icon: <Terminal size={18} /> },
  { id: 'settings', label: 'Ustawienia', icon: <Settings size={18} /> },
];

function pluralizeMessages(count: number): string {
  if (count === 1) return '1 wiadomość';
  const lastTwo = count % 100;
  const lastOne = count % 10;
  if (lastTwo >= 12 && lastTwo <= 14) return `${count} wiadomości`;
  if (lastOne >= 2 && lastOne <= 4) return `${count} wiadomości`;
  return `${count} wiadomości`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'przed chwilą';
  if (minutes < 60) return `${minutes} min temu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h temu`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'wczoraj';
  return `${days} dni temu`;
}

interface SessionItemProps {
  session: ChatSessionSummary;
  isActive: boolean;
  collapsed: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
}

function SessionItem({
  session,
  isActive,
  collapsed,
  onSelect,
  onDelete,
  onRename,
}: SessionItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const handleSave = () => {
    if (editTitle.trim() && editTitle !== session.title) {
      onRename(editTitle.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditTitle(session.title);
    setIsEditing(false);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDelete) {
      onDelete();
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className={`w-full p-2 rounded flex items-center justify-center transition-colors ${
          isActive
            ? 'bg-matrix-accent/20 text-matrix-accent'
            : 'hover:bg-matrix-accent/10 text-matrix-text-dim'
        }`}
        title={session.title}
      >
        <MessageSquare size={16} />
      </button>
    );
  }

  if (isEditing) {
    return (
      <div className="flex items-center gap-1 p-1">
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') handleCancel();
          }}
          className="flex-1 glass-input text-xs py-1 px-2"
          ref={(el) => el?.focus()}
        />
        <button
          type="button"
          onClick={handleSave}
          className="p-1 hover:bg-matrix-accent/20 rounded text-matrix-accent"
        >
          <Check size={14} />
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className="p-1 hover:bg-red-500/20 rounded text-red-400"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`group relative flex items-center gap-2 p-2 rounded cursor-pointer transition-colors w-full text-left ${
        isActive
          ? 'bg-matrix-accent/20 text-matrix-accent'
          : 'hover:bg-matrix-accent/10 text-matrix-text-dim'
      }`}
      onClick={onSelect}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <MessageSquare size={14} className="flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs truncate">{session.title}</p>
        <p className="text-[10px] text-matrix-text-dim truncate">
          {pluralizeMessages(session.message_count)}
        </p>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing(true);
          }}
          className="p-1 hover:bg-matrix-accent/20 rounded"
          title="Zmień nazwę"
        >
          <Edit2 size={12} />
        </button>
        <button
          type="button"
          onClick={handleDeleteClick}
          className={`p-1 rounded transition-colors ${
            confirmDelete ? 'bg-red-500/30 text-red-300' : 'hover:bg-red-500/20 text-red-400'
          }`}
          title={confirmDelete ? 'Kliknij ponownie aby usunąć' : 'Usuń'}
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Tooltip with preview */}
      {showTooltip && session.preview && (
        <div
          className="absolute left-full top-0 ml-2 z-50 w-56 p-2.5 rounded-lg
          bg-matrix-bg-primary/95 border border-matrix-accent/30 shadow-lg shadow-black/40
          backdrop-blur-sm pointer-events-none animate-in fade-in duration-150"
        >
          <p className="text-[11px] text-matrix-text font-medium truncate mb-1">{session.title}</p>
          <p className="text-[10px] text-matrix-text-dim line-clamp-3 leading-relaxed">
            {session.preview}
          </p>
          <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-matrix-border">
            <span className="text-[9px] text-matrix-text-dim">
              {pluralizeMessages(session.message_count)}
            </span>
            <span className="text-[9px] text-matrix-accent">{timeAgo(session.updated_at)}</span>
          </div>
        </div>
      )}
    </button>
  );
}

/** Hook to detect narrow viewport (mobile-like) */
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);

  return isMobile;
}

export function Sidebar() {
  const {
    sidebarCollapsed,
    currentView,
    activeSessionId,
    setSidebarCollapsed,
    setCurrentView,
    setActiveSessionId,
  } = useClaudeStore();
  const {
    sessions,
    currentSession,
    loadSessions,
    createSession,
    deleteSession,
    updateTitle,
    loadSession,
  } = useChatHistory();

  const [showSessions, setShowSessions] = useState(true);
  const [copied, setCopied] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Auto-close mobile sidebar on view change
  // biome-ignore lint/correctness/useExhaustiveDependencies: currentView triggers intentional close on navigation
  useEffect(() => {
    if (isMobile) setMobileOpen(false);
  }, [currentView, isMobile]);

  // Sort sessions by updated_at descending
  const sortedSessions = useMemo(
    () =>
      [...sessions].sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      ),
    [sessions],
  );

  const handleCreateSession = async () => {
    const title = `Chat ${sessions.length + 1}`;
    const session = await createSession(title);
    if (session) {
      setActiveSessionId(session.id);
      setCurrentView('terminal');
    }
  };

  const handleSelectSession = async (sessionId: string) => {
    setActiveSessionId(sessionId);
    await loadSession(sessionId);
    setCurrentView('terminal');
  };

  const handleDeleteSession = async (sessionId: string) => {
    await deleteSession(sessionId);
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
    }
  };

  const handleRenameSession = async (sessionId: string, newTitle: string) => {
    await updateTitle(sessionId, newTitle);
  };

  const handleCopyChat = useCallback(async () => {
    if (!currentSession?.messages?.length) return;
    const text = currentSession.messages.map((msg) => `[${msg.role}]: ${msg.content}`).join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }, [currentSession]);

  // Mobile: render hamburger + overlay drawer
  if (isMobile) {
    return (
      <>
        {/* Mobile hamburger button */}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="fixed top-3 left-3 z-50 p-2 rounded-lg glass-panel hover:bg-matrix-accent/10 transition-colors"
          title="Menu"
        >
          <Menu size={20} className="text-matrix-accent" />
        </button>

        {/* Overlay backdrop */}
        {mobileOpen && (
          // biome-ignore lint/a11y/useKeyWithClickEvents: overlay backdrop, Escape key handled globally
          // biome-ignore lint/a11y/noStaticElementInteractions: overlay backdrop dismiss area
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Slide-in sidebar */}
        <aside
          className={`fixed top-0 left-0 h-full w-72 z-50 glass-panel flex flex-col
            transition-transform duration-300 ease-in-out ${
              mobileOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
        >
          {renderSidebarContent(false)}
        </aside>
      </>
    );
  }

  // Desktop: inline sidebar
  return (
    <aside
      className={`glass-panel flex flex-col transition-all duration-300 ${
        sidebarCollapsed ? 'w-16' : 'w-60'
      }`}
    >
      {renderSidebarContent(sidebarCollapsed)}
    </aside>
  );

  /** Shared sidebar content renderer */
  function renderSidebarContent(collapsed: boolean) {
    return (
      <>
        {/* Logo - click to go home */}
        <button
          type="button"
          onClick={() => setCurrentView('home')}
          className="flex flex-col items-center gap-3 p-4 border-b border-matrix-border hover:bg-matrix-accent/5 transition-colors cursor-pointer w-full"
        >
          <div
            className={`rounded-xl overflow-hidden flex-shrink-0 bg-matrix-accent/10 shadow-lg shadow-matrix-accent/20 ${
              collapsed ? 'w-12 h-12' : 'w-32 h-32'
            } transition-all duration-300`}
          >
            <img src="/logodark.webp" alt="Claude HYDRA" className="w-full h-full object-cover" />
          </div>
          {!collapsed && (
            <div className="flex flex-col items-center text-center">
              <span className="text-lg font-bold text-matrix-accent text-glow">Claude HYDRA</span>
              <span className="text-xs text-matrix-text-dim">AI Swarm Control Center</span>
            </div>
          )}
        </button>

        {/* Chat Manager */}
        <div className="flex-1 flex flex-col min-h-0 p-2 border-b border-matrix-border">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setShowSessions(!showSessions)}
              className="flex items-center gap-2 text-xs text-matrix-text hover:text-matrix-accent transition-colors"
            >
              <MessagesSquare size={14} />
              {!collapsed && <span>Czaty</span>}
              {!collapsed &&
                (showSessions ? (
                  <ChevronLeft size={12} className="rotate-90" />
                ) : (
                  <ChevronRight size={12} className="rotate-90" />
                ))}
            </button>
            <div className="flex items-center gap-1">
              {activeSessionId && !collapsed && (
                <button
                  type="button"
                  onClick={handleCopyChat}
                  className="p-1.5 hover:bg-matrix-accent/20 rounded text-matrix-text-dim hover:text-matrix-accent transition-colors"
                  title={copied ? 'Skopiowano!' : 'Kopiuj czat'}
                >
                  {copied ? <ClipboardCheck size={14} /> : <Copy size={14} />}
                </button>
              )}
              <button
                type="button"
                onClick={handleCreateSession}
                className="p-1.5 hover:bg-matrix-accent/20 rounded text-matrix-accent transition-colors"
                title="Nowy czat"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {showSessions && (
            <div className="flex-1 space-y-1 overflow-y-auto min-h-0">
              {sortedSessions.length === 0 ? (
                <p className="text-[10px] text-matrix-text-dim text-center py-2">
                  {collapsed ? '' : 'Brak czatów'}
                </p>
              ) : (
                sortedSessions.map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    isActive={session.id === activeSessionId}
                    collapsed={collapsed}
                    onSelect={() => handleSelectSession(session.id)}
                    onDelete={() => handleDeleteSession(session.id)}
                    onRename={(newTitle) => handleRenameSession(session.id, newTitle)}
                  />
                ))
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="p-2 space-y-1">
          {navItems.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => setCurrentView(item.id)}
              className={`nav-item w-full ${currentView === item.id ? 'active' : ''}`}
            >
              {item.icon}
              {!collapsed && <span className="text-sm">{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* Collapse Toggle (desktop only) */}
        {!isMobile && (
          <div className="p-2 border-t border-matrix-border">
            <button
              type="button"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="nav-item w-full justify-center"
            >
              {collapsed ? (
                <ChevronRight size={18} />
              ) : (
                <>
                  <ChevronLeft size={18} />
                  <span className="text-sm">Zwiń</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Mobile close button */}
        {isMobile && (
          <div className="p-2 border-t border-matrix-border">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="nav-item w-full justify-center text-matrix-text-dim hover:text-matrix-accent"
            >
              <X size={18} />
              <span className="text-sm">Zamknij</span>
            </button>
          </div>
        )}
      </>
    );
  }
}
