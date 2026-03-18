/**
 * Sidebar — ClaudeHydra collapsible navigation sidebar (Tissaia style).
 * Ported from ClaudeHydra v3 `web/src/components/Sidebar.tsx`.
 *
 * Layout: EPS AI Solutions logo + nav items + session manager + theme toggle + version.
 * States: expanded (w-60) / collapsed (w-16) with smooth animation.
 * Mobile: overlay drawer on small screens.
 *
 * Neutral white accent (#ffffff) for active states, hovers, borders, glows.
 */

import { useIsMobile } from '@jaskier/core';
import {
  Activity,
  BarChart3,
  Brain,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  type LucideIcon,
  Menu,
  MessageSquare,
  MessagesSquare,
  Network,
  Plus,
  ScrollText,
  Settings,
  Sparkles,
  Users,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  lazy,
  type PointerEvent as ReactPointerEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { usePartnerSessions } from '@/features/chat/hooks/usePartnerSessions';

const PartnerChatModal = lazy(() => import('@/features/chat/components/PartnerChatModal'));

import { useViewTheme } from '@jaskier/chat-module';
import { FooterControls, LogoButton } from '@jaskier/hydra-app/components/organisms';
import { cn } from '@jaskier/ui';
import { SessionSearch } from '@/components/molecules/SessionSearch';
import { TagChip } from '@/components/molecules/TagChip';
import { usePredictivePrefetch } from '@/shared/hooks/usePredictivePrefetch';
import { useViewStore, type ViewId } from '@/stores/viewStore';
import { SessionItem } from './sidebar/SessionItem';
import { useSidebarLogic } from './sidebar/useSidebarLogic';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: { id: ViewId; label: string; icon: LucideIcon }[];
}

// ---------------------------------------------------------------------------
// Sidebar Content (shared between desktop & mobile)
// ---------------------------------------------------------------------------

interface SidebarContentProps {
  collapsed: boolean;
  onClose?: () => void;
  isMobile?: boolean;
}

function SidebarContent({ collapsed, onClose, isMobile = false }: SidebarContentProps) {
  const { t } = useTranslation();

  // Business logic from extracted hook
  const {
    currentView,
    currentSessionId,
    sessions,
    sortedSessions,
    sessionSearchQuery,
    focusedSessionIndex,
    showSessions,
    setShowSessions,
    handleSessionSearch,
    handleSessionListKeyDown,
    handleSelectSession: selectSessionBase,
    handleNewChat: newChatBase,
    handleDeleteSession,
    handleRenameSession,
    handleNavClick: navClickBase,
    // Tags
    activeSessionTags,
    allTagsList,
    handleAddTags,
    handleRemoveTag,
    // Search & filter
    searchQuery: _searchQuery,
    setSearchQuery: _setSearchQuery,
    filterTags,
    handleTagFilterToggle,
    handleClearFilters,
  } = useSidebarLogic();

  const theme = useViewTheme();
  const isLight = theme.isLight;
  const isDark = !isLight;

  // Predictive UI pre-fetching (Task 34)
  const { prefetchOnHover, cancelHoverPrefetch } = usePredictivePrefetch();

  // Wrap base handlers with mobile drawer close
  const navigateTo = useCallback(
    (view: ViewId) => {
      navClickBase(view);
      if (isMobile && onClose) onClose();
    },
    [navClickBase, isMobile, onClose],
  );

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      selectSessionBase(sessionId);
      if (isMobile && onClose) onClose();
    },
    [selectSessionBase, isMobile, onClose],
  );

  const handleNewChat = useCallback(() => {
    newChatBase();
    if (isMobile && onClose) onClose();
  }, [newChatBase, isMobile, onClose]);

  // Partner sessions (GeminiHydra)
  const { data: partnerSessions, isLoading: partnerLoading, isError: partnerError } = usePartnerSessions();
  const [showPartnerSessions, setShowPartnerSessions] = useState(true);
  const [partnerModalSessionId, setPartnerModalSessionId] = useState<string | null>(null);
  const sortedPartnerSessions = useMemo(
    () =>
      [...(partnerSessions ?? [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [partnerSessions],
  );

  // Navigation groups (Tissaia style — uses i18n)
  const navGroups: NavGroup[] = [
    {
      id: 'main',
      label: t('sidebar.groups.main', 'MAIN'),
      icon: Sparkles,
      items: [
        { id: 'home', label: t('nav.home', 'Home'), icon: Zap },
        { id: 'chat', label: t('nav.chat', 'Chat'), icon: MessageSquare },
        { id: 'logs' as ViewId, label: t('nav.logs', 'Logs'), icon: ScrollText },
        { id: 'delegations' as ViewId, label: t('nav.delegations', 'Delegations'), icon: Network },
        { id: 'analytics' as ViewId, label: t('nav.analytics', 'Analytics'), icon: BarChart3 },
        { id: 'swarm' as ViewId, label: t('nav.swarm', 'Swarm Dashboard'), icon: Activity },
        { id: 'semantic-cache' as ViewId, label: t('nav.semanticCache', 'Semantic Cache'), icon: Brain },
        { id: 'collab' as ViewId, label: t('nav.collab', 'Collaboration'), icon: Users },
        { id: 'settings', label: t('nav.settings', 'Settings'), icon: Settings },
      ],
    },
  ];

  // Grouped navigation - expandable sections (Tissaia style)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('claudehydra_expanded_groups');
      const defaults = { main: true };
      return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
    } catch {
      return { main: true };
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('claudehydra_expanded_groups', JSON.stringify(expandedGroups));
    } catch {
      /* ignore */
    }
  }, [expandedGroups]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  return (
    <>
      {/* ---- Logo ---- */}
      <LogoButton collapsed={collapsed} onClick={() => navigateTo('home')} />

      {/* ---- Grouped Navigation (Tissaia style) ---- */}
      <nav className="flex flex-col gap-2 flex-shrink-0 px-2">
        {navGroups.map((group) => {
          const isExpanded = expandedGroups[group.id];
          const hasActiveItem = group.items.some((item) => item.id === currentView);
          const GroupIcon = group.icon;

          return (
            <div key={group.id} className={cn(isLight ? 'glass-panel-light' : 'glass-panel-dark', 'overflow-hidden')}>
              {/* Group Header */}
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${group.label} group`}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2.5 transition-all group',
                    hasActiveItem
                      ? isLight
                        ? 'text-emerald-600 bg-emerald-500/5'
                        : 'text-white bg-white/5'
                      : cn(
                          theme.textMuted,
                          isLight ? 'hover:text-black hover:bg-black/5' : 'hover:text-white hover:bg-white/5',
                        ),
                  )}
                >
                  <div className="flex items-center gap-2">
                    <GroupIcon size={14} />
                    <span className="text-sm font-bold tracking-[0.12em] uppercase">{group.label}</span>
                  </div>
                  <ChevronDown
                    size={14}
                    className={cn('transition-transform duration-200', isExpanded ? '' : '-rotate-90')}
                  />
                </button>
              )}

              {/* Group Items */}
              <div
                className={cn(
                  'px-1.5 pb-1.5 space-y-0.5 overflow-hidden transition-all duration-200',
                  !collapsed && !isExpanded ? 'max-h-0 opacity-0 pb-0' : 'max-h-96 opacity-100',
                  collapsed ? 'py-1.5' : '',
                )}
              >
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentView === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-testid={`nav-${item.id}`}
                      onClick={() => navigateTo(item.id)}
                      onPointerEnter={() => prefetchOnHover(item.id)}
                      onPointerLeave={cancelHoverPrefetch}
                      className={cn(
                        'relative w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group',
                        collapsed ? 'justify-center' : '',
                        isActive
                          ? isLight
                            ? 'bg-emerald-500/15 text-emerald-600'
                            : 'bg-white/10 text-white'
                          : cn(
                              theme.textMuted,
                              isLight ? 'hover:bg-black/5 hover:text-black' : 'hover:bg-white/5 hover:text-white',
                            ),
                      )}
                      title={collapsed ? item.label : undefined}
                      aria-label={`Navigate to ${item.label}`}
                    >
                      <Icon
                        size={16}
                        className={cn(
                          'transition-colors flex-shrink-0',
                          isActive
                            ? isLight
                              ? 'text-emerald-600'
                              : 'text-white'
                            : cn(theme.iconMuted, isLight ? 'group-hover:text-black' : 'group-hover:text-white'),
                        )}
                      />
                      {!collapsed && <span className="font-medium text-base tracking-wide truncate">{item.label}</span>}
                      {isActive && (
                        <div
                          className={cn(
                            'absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full',
                            isLight
                              ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                              : 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.4)]',
                          )}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* ---- Session Manager (Tissaia style) ---- */}
      <div
        className={cn(
          isLight ? 'glass-panel-light' : 'glass-panel-dark',
          'flex-1 flex flex-col min-h-0 p-2 mx-2 overflow-hidden',
        )}
      >
        <div className="flex items-center justify-between px-1 py-1.5">
          <button
            type="button"
            data-testid="sidebar-chats-toggle"
            onClick={() => setShowSessions(!showSessions)}
            aria-expanded={showSessions}
            aria-label={`${showSessions ? 'Collapse' : 'Expand'} chat sessions`}
            className={cn(
              'flex items-center gap-2 transition-colors',
              isLight ? `${theme.textMuted} hover:text-black` : `${theme.textMuted} hover:text-white`,
            )}
          >
            <MessagesSquare size={14} />
            {!collapsed && (
              <span className="text-sm font-bold tracking-[0.12em] uppercase">{t('sidebar.chats', 'CHATS')}</span>
            )}
            {!collapsed && (
              <ChevronDown
                size={14}
                className={cn('transition-transform duration-200', showSessions ? '' : '-rotate-90')}
              />
            )}
          </button>
          <button
            type="button"
            data-testid="sidebar-new-chat-btn"
            onClick={handleNewChat}
            className={cn(
              'p-1.5 rounded text-[var(--matrix-accent)] transition-colors',
              isDark ? 'hover:bg-white/15' : 'hover:bg-black/5',
            )}
            title={t('sidebar.newChat', 'New chat')}
            aria-label={t('sidebar.newChat', 'New chat')}
          >
            <Plus size={14} />
          </button>
        </div>

        {/* #19 - Session search input (only when expanded and sessions visible) */}
        {!collapsed && showSessions && sessions.length > 0 && (
          <>
            <SessionSearch onSearch={handleSessionSearch} className="px-1 pb-1" />
            {/* Tag filter chips */}
            {allTagsList.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap px-1 pb-1.5">
                {allTagsList.slice(0, 8).map((tag) => (
                  <TagChip
                    key={tag}
                    tag={tag}
                    isDark={isDark}
                    size="xs"
                    onClick={() => handleTagFilterToggle(tag)}
                    className={cn(
                      filterTags.includes(tag) && (isDark ? 'ring-1 ring-white/40' : 'ring-1 ring-black/30'),
                    )}
                  />
                ))}
                {filterTags.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="text-[9px] text-[var(--matrix-text-secondary)] hover:text-[var(--matrix-text-primary)] transition-colors"
                    aria-label={t('tags.clearFilters', 'Clear filters')}
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
            )}
          </>
        )}

        <AnimatePresence>
          {showSessions && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              role="listbox"
              aria-label={t('sidebar.chats', 'Chat sessions')}
              onKeyDown={handleSessionListKeyDown}
              data-testid="sidebar-session-list"
              className="flex-1 space-y-1 overflow-y-auto min-h-0"
            >
              {sortedSessions.length === 0 ? (
                <p className="text-[10px] text-[var(--matrix-text-secondary)] text-center py-2">
                  {collapsed
                    ? ''
                    : sessionSearchQuery
                      ? t('sidebar.noSearchResults', 'No matching chats')
                      : t('sidebar.noChats', 'No chats yet')}
                </p>
              ) : (
                sortedSessions.map((session, idx) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    isActive={session.id === currentSessionId}
                    isFocused={focusedSessionIndex === idx}
                    collapsed={collapsed}
                    isDark={isDark}
                    onSelect={() => handleSelectSession(session.id)}
                    onDelete={() => handleDeleteSession(session.id)}
                    onRename={(newTitle) => handleRenameSession(session.id, newTitle)}
                    tags={session.id === currentSessionId ? activeSessionTags : []}
                    suggestedTags={allTagsList}
                    onAddTags={(tags) => handleAddTags(session.id, tags)}
                    onRemoveTag={(tag) => handleRemoveTag(session.id, tag)}
                    onTagClick={handleTagFilterToggle}
                  />
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ---- Partner Sessions — GeminiHydra ---- */}
      <div
        className={cn(
          isLight ? 'glass-panel-light' : 'glass-panel-dark',
          'flex flex-col min-h-0 p-2 mx-2 overflow-hidden',
        )}
      >
        <div className="flex items-center justify-between px-1 py-1.5">
          <button
            type="button"
            onClick={() => setShowPartnerSessions(!showPartnerSessions)}
            aria-expanded={showPartnerSessions}
            aria-label={`${showPartnerSessions ? 'Collapse' : 'Expand'} GeminiHydra partner sessions`}
            className={cn(
              'flex items-center gap-2 transition-colors',
              isLight ? `${theme.textMuted} hover:text-black` : `${theme.textMuted} hover:text-white`,
            )}
          >
            <div
              className={cn(
                'w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold flex-shrink-0',
                isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-400',
              )}
            >
              GH
            </div>
            {!collapsed && (
              <span className="text-sm font-bold tracking-[0.12em] uppercase">
                {t('sidebar.partnerApp', 'GeminiHydra')}
              </span>
            )}
            {!collapsed && (
              <ChevronDown
                size={14}
                className={cn('transition-transform duration-200', showPartnerSessions ? '' : '-rotate-90')}
              />
            )}
          </button>
          <div className="flex items-center gap-1">
            {partnerLoading && <Loader2 size={12} className="animate-spin text-blue-400" />}
            {partnerError && <WifiOff size={12} className={cn(theme.iconMuted)} />}
            {!partnerLoading && !partnerError && (
              <span className={cn('text-xs', theme.textMuted)}>{sortedPartnerSessions.length}</span>
            )}
          </div>
        </div>

        <AnimatePresence>
          {showPartnerSessions && !collapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="flex-1 space-y-1 overflow-y-auto min-h-0"
            >
              {partnerError && (
                <p className="text-[10px] text-[var(--matrix-text-secondary)] text-center py-2">Offline</p>
              )}
              {!partnerError && sortedPartnerSessions.length === 0 && !partnerLoading && (
                <p className="text-[10px] text-[var(--matrix-text-secondary)] text-center py-2">
                  {t('sidebar.noSessions', 'No sessions')}
                </p>
              )}
              {sortedPartnerSessions.map((ps) => (
                <button
                  type="button"
                  key={ps.id}
                  onClick={() => setPartnerModalSessionId(ps.id)}
                  className={cn(
                    'group relative flex items-center gap-2 p-2 rounded cursor-pointer transition-colors w-full text-left',
                    isDark
                      ? 'hover:bg-white/[0.08] text-[var(--matrix-text-secondary)]'
                      : 'hover:bg-black/5 text-[var(--matrix-text-secondary)]',
                  )}
                  title={ps.title}
                >
                  <MessageSquare
                    size={14}
                    className={cn('flex-shrink-0', isLight ? 'text-blue-500' : 'text-blue-400/60')}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{ps.title}</p>
                    <p className="text-xs text-[var(--matrix-text-secondary)] truncate">
                      {ps.message_count} {ps.message_count === 1 ? 'message' : 'messages'}
                    </p>
                  </div>
                  <ExternalLink
                    size={10}
                    className="opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0 text-[var(--matrix-text-secondary)]"
                  />
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Partner session modal (lazy-loaded) */}
      <Suspense fallback={null}>
        <PartnerChatModal sessionId={partnerModalSessionId} onClose={() => setPartnerModalSessionId(null)} />
      </Suspense>

      {/* ---- Bottom: Theme & Language + Version ---- */}
      <FooterControls collapsed={collapsed} version="ClaudeHydra v4.0.0" tagline={t('footer.tagline', 'AI Swarm')} />

      {/* ---- Mobile close button ---- */}
      {isMobile && (
        <div className="p-2 border-t border-[var(--matrix-border)]">
          <button
            type="button"
            data-testid="mobile-close-btn"
            onClick={onClose}
            className="nav-item w-full justify-center text-[var(--matrix-text-secondary)] hover:text-[var(--matrix-accent)]"
          >
            <X size={18} />
            <span className="text-sm">{t('common.close', 'Close')}</span>
          </button>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main Sidebar component
// ---------------------------------------------------------------------------

export function Sidebar() {
  const { t } = useTranslation();
  const { sidebarCollapsed, setSidebarCollapsed, toggleSidebar, currentView } = useViewStore();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const isMobile = useIsMobile();

  // #29 — Auto-collapse sidebar on mobile (<768px)
  useEffect(() => {
    if (isMobile) {
      setSidebarCollapsed(true);
    }
  }, [isMobile, setSidebarCollapsed]);

  // Auto-close mobile drawer on view change (currentView is intentional trigger)
  useEffect(() => {
    if (isMobile) setMobileDrawerOpen(false);
  }, [currentView, isMobile, setMobileDrawerOpen]);

  // #29 — Swipe gesture for mobile drawer
  const swipeStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const handlePointerDown = useCallback((e: ReactPointerEvent) => {
    swipeStartRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
  }, []);

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent) => {
      if (!swipeStartRef.current) return;
      const dx = e.clientX - swipeStartRef.current.x;
      const dy = Math.abs(e.clientY - swipeStartRef.current.y);
      const dt = Date.now() - swipeStartRef.current.time;
      swipeStartRef.current = null;

      // Swipe must be mostly horizontal, fast enough, and long enough
      if (dt < 500 && dy < 80) {
        if (dx < -60 && mobileDrawerOpen) {
          // Swipe left: close drawer
          setMobileDrawerOpen(false);
        } else if (dx > 60 && !mobileDrawerOpen && e.clientX - dx < 40) {
          // Swipe right from left edge: open drawer
          setMobileDrawerOpen(true);
        }
      }
    },
    [mobileDrawerOpen],
  );

  // Global swipe-from-left-edge to open
  useEffect(() => {
    if (!isMobile) return;
    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch && touch.clientX < 30) {
        swipeStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
      }
    };
    const handleTouchEnd = (e: TouchEvent) => {
      if (!swipeStartRef.current) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - swipeStartRef.current.x;
      const dy = Math.abs(touch.clientY - swipeStartRef.current.y);
      const dt = Date.now() - swipeStartRef.current.time;
      swipeStartRef.current = null;
      if (dt < 500 && dy < 80 && dx > 60 && !mobileDrawerOpen) {
        setMobileDrawerOpen(true);
      }
    };
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isMobile, mobileDrawerOpen]);

  // Mobile: hamburger + overlay drawer with swipe + backdrop
  if (isMobile) {
    return (
      <>
        {/* Hamburger trigger */}
        <button
          type="button"
          data-testid="mobile-hamburger"
          onClick={() => setMobileDrawerOpen(true)}
          className={cn(
            'fixed top-3 left-3 z-50 p-2 rounded-lg',
            'glass-panel transition-colors',
            isDark ? 'hover:bg-white/[0.08]' : 'hover:bg-black/5',
          )}
          title={t('common.menu', 'Menu')}
          aria-label={t('sidebar.openSidebar', 'Open sidebar')}
        >
          <Menu size={20} className="text-[var(--matrix-accent)]" />
        </button>

        {/* Backdrop (#29 overlay) */}
        <AnimatePresence>
          {mobileDrawerOpen && (
            <motion.div
              key="sidebar-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              data-testid="mobile-backdrop"
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
              onClick={() => setMobileDrawerOpen(false)}
              role="presentation"
            />
          )}
        </AnimatePresence>

        {/* Drawer with swipe gesture support */}
        <motion.aside
          initial={{ x: '-100%' }}
          animate={{ x: mobileDrawerOpen ? 0 : '-100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          data-testid="mobile-drawer"
          className={cn(
            'fixed top-0 left-0 h-full w-72 z-50 flex flex-col touch-pan-y',
            isDark ? 'glass-panel-dark' : 'glass-panel-light',
          )}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
        >
          <SidebarContent collapsed={false} onClose={() => setMobileDrawerOpen(false)} isMobile />
        </motion.aside>
      </>
    );
  }

  // Desktop: inline sidebar
  return (
    <motion.aside
      data-testid="sidebar"
      initial={false}
      animate={{ width: sidebarCollapsed ? 64 : 240 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className={cn(isDark ? 'glass-panel-dark' : 'glass-panel-light', 'flex flex-col h-full overflow-hidden relative')}
    >
      <SidebarContent collapsed={sidebarCollapsed} />

      {/* Collapse toggle (desktop only) */}
      <button
        type="button"
        data-testid="sidebar-collapse-toggle"
        onClick={toggleSidebar}
        className={cn(
          'absolute top-1/2 -translate-y-1/2 -right-4 z-20',
          'w-9 h-9 rounded-full flex items-center justify-center',
          'bg-[var(--matrix-bg-secondary)] border border-[var(--matrix-border)]',
          'text-[var(--matrix-text-secondary)] hover:text-[var(--matrix-accent)]',
          isDark
            ? 'hover:border-[var(--matrix-accent)] hover:shadow-[0_0_12px_rgba(255,255,255,0.15)]'
            : 'hover:border-[var(--matrix-accent)] hover:shadow-[0_0_12px_rgba(5,150,105,0.3)]',
          'backdrop-blur-sm transition-all duration-200 hover:scale-110 active:scale-95',
          'shadow-lg',
        )}
        title={
          sidebarCollapsed
            ? t('sidebar.expandSidebar', 'Expand sidebar')
            : t('sidebar.collapseSidebar', 'Collapse sidebar')
        }
        aria-label={
          sidebarCollapsed
            ? t('sidebar.expandSidebar', 'Expand sidebar')
            : t('sidebar.collapseSidebar', 'Collapse sidebar')
        }
      >
        {sidebarCollapsed ? <ChevronRight size={18} strokeWidth={2.5} /> : <ChevronLeft size={18} strokeWidth={2.5} />}
      </button>
    </motion.aside>
  );
}
