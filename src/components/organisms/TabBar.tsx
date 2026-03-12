/**
 * TabBar — Browser-style chat tabs for ClaudeHydra v4.
 * Ported from GeminiHydra TabBar.tsx with store API adaptations.
 *
 * Supports: switching, closing, pinning, middle-click close, new tab button,
 * message count badges, scroll on overflow, context menu, glass-panel background.
 */

import { useViewTheme } from '@jaskier/chat-module';
import { cn } from '@jaskier/ui';
import { Pin, Plus, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSessionSync } from '@/features/chat/hooks/useSessionSync';
import { type ChatTab, useViewStore } from '@/stores/viewStore';

// ============================================================================
// TAB ITEM
// ============================================================================

interface TabItemProps {
  tab: ChatTab;
  tabIndex_: number;
  isActive: boolean;
  onSwitch: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onTogglePin: (tabId: string) => void;
  onContextMenu?: (x: number, y: number, tabId: string) => void;
  onArrowNav?: (tabId: string, direction: 'left' | 'right') => void;
  messageCount: number;
  // #14 - Drag & drop reorder
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (index: number) => void;
  onDragEnd: () => void;
  isDragOver: boolean;
  isDragging: boolean;
}

const TabItem = memo<TabItemProps>(
  ({
    tab,
    tabIndex_,
    isActive,
    onSwitch,
    onClose,
    onTogglePin,
    onContextMenu,
    onArrowNav,
    messageCount,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    isDragOver,
    isDragging,
  }) => {
    const { t } = useTranslation();
    const theme = useViewTheme();
    const [isHovering, setIsHovering] = useState(false);

    const handleMouseDown = useCallback(
      (e: React.MouseEvent) => {
        if (e.button === 1) {
          e.preventDefault();
          if (!tab.isPinned) onClose(tab.id);
        }
      },
      [tab.id, tab.isPinned, onClose],
    );

    const handleClose = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onClose(tab.id);
      },
      [tab.id, onClose],
    );

    const handleContextMenu = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        if (onContextMenu) {
          onContextMenu(e.clientX, e.clientY, tab.id);
        } else {
          onTogglePin(tab.id);
        }
      },
      [tab.id, onTogglePin, onContextMenu],
    );

    return (
      <motion.div
        layout
        layoutId={`tab-${tab.id}`}
        data-tab-id={tab.id}
        role="tab"
        aria-selected={isActive}
        aria-label={tab.isPinned ? `Pinned tab: ${tab.title || 'New Chat'}` : tab.title || 'New Chat'}
        tabIndex={isActive ? 0 : -1}
        onClick={() => onSwitch(tab.id)}
        onMouseDown={handleMouseDown}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => {
          setIsHovering(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSwitch(tab.id);
          }
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            onArrowNav?.(tab.id, 'left');
          }
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            onArrowNav?.(tab.id, 'right');
          }
        }}
        // #14 - Drag & drop reorder
        draggable={!tab.isPinned}
        onDragStart={(e) => {
          if (tab.isPinned) return;
          (e as unknown as React.DragEvent).dataTransfer?.setData('text/plain', String(tabIndex_));
          onDragStart(tabIndex_);
        }}
        onDragOver={(e) => {
          const de = e as unknown as React.DragEvent;
          de.preventDefault?.();
          onDragOver(de, tabIndex_);
        }}
        onDrop={() => onDrop(tabIndex_)}
        onDragEnd={() => onDragEnd()}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: isDragging ? 0.5 : 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className={cn(
          'group relative flex items-center gap-2 px-4 py-2.5 cursor-pointer select-none text-sm font-semibold rounded-t-xl transition-all duration-200',
          tab.isPinned ? 'min-w-[48px] max-w-[48px] justify-center' : 'min-w-[140px] max-w-[220px]',
          isActive
            ? theme.isLight
              ? 'bg-white/80 text-black border-b-[3px] border-emerald-500 shadow-md backdrop-blur-sm'
              : 'bg-white/15 text-white border-b-[3px] border-white shadow-lg shadow-white/5 backdrop-blur-sm'
            : theme.isLight
              ? 'bg-white/30 text-gray-700 hover:bg-white/55 hover:text-black border-b-[3px] border-transparent'
              : 'bg-white/[0.06] text-white/50 hover:bg-white/15 hover:text-white border-b-[3px] border-transparent',
          // #14 - Drop target highlight
          isDragOver && (theme.isLight ? 'ring-2 ring-emerald-400/60' : 'ring-2 ring-white/40'),
        )}
      >
        {tab.isPinned && (
          <Pin size={13} className={cn('shrink-0', theme.isLight ? 'text-emerald-600' : 'text-white/70')} />
        )}

        {!tab.isPinned && <span className="flex-1 truncate">{tab.title || 'New Chat'}</span>}

        {messageCount > 0 && !tab.isPinned && (
          <span
            className={cn(
              'text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 min-w-[20px] text-center',
              isActive
                ? theme.isLight
                  ? 'bg-emerald-500/25 text-emerald-800'
                  : 'bg-white/20 text-white'
                : theme.isLight
                  ? 'bg-slate-500/15 text-gray-600'
                  : 'bg-white/10 text-white/50',
            )}
          >
            {messageCount}
          </span>
        )}

        {!tab.isPinned && (isHovering || isActive) && (
          <button
            type="button"
            onClick={handleClose}
            className={cn(
              'shrink-0 p-1 rounded-md transition-colors',
              theme.isLight
                ? 'text-gray-400 hover:bg-red-500/25 hover:text-red-600'
                : 'text-white/40 hover:bg-red-500/30 hover:text-red-400',
            )}
            title={t('tabs.closeTab', 'Close tab')}
          >
            <X size={14} />
          </button>
        )}
      </motion.div>
    );
  },
);

TabItem.displayName = 'TabItem';

// ============================================================================
// TAB BAR
// ============================================================================

export const TabBar = memo(() => {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const scrollRef = useRef<HTMLDivElement>(null);

  const tabs = useViewStore((s) => s.tabs);
  const activeTabId = useViewStore((s) => s.activeTabId);
  const chatSessions = useViewStore((s) => s.chatSessions);
  const switchTab = useViewStore((s) => s.switchTab);
  const closeTab = useViewStore((s) => s.closeTab);
  const togglePinTab = useViewStore((s) => s.togglePinTab);
  const { createSessionWithSync } = useSessionSync();
  const reorderTabs = useViewStore((s) => s.reorderTabs);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);

  // #14 - Drag & drop state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback(
    (toIndex: number) => {
      if (dragIndex !== null && dragIndex !== toIndex) {
        reorderTabs(dragIndex, toIndex);
      }
      setDragIndex(null);
      setDragOverIndex(null);
    },
    [dragIndex, reorderTabs],
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  const handleContextMenuOpen = useCallback((x: number, y: number, tabId: string) => {
    setContextMenu({ x, y, tabId });
  }, []);

  const handleCloseOtherTabs = useCallback(
    (tabId: string) => {
      const otherTabs = tabs.filter((t) => t.id !== tabId && !t.isPinned);
      for (const tab of otherTabs) {
        closeTab(tab.id);
      }
      setContextMenu(null);
    },
    [tabs, closeTab],
  );

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft += e.deltaY;
    }
  }, []);

  const getMessageCount = useCallback(
    (sessionId: string) => chatSessions.find((s) => s.id === sessionId)?.messageCount ?? 0,
    [chatSessions],
  );

  const handleArrowNav = useCallback(
    (tabId: string, direction: 'left' | 'right') => {
      const currentIndex = tabs.findIndex((t) => t.id === tabId);
      if (currentIndex === -1) return;
      const nextIndex =
        direction === 'left' ? (currentIndex - 1 + tabs.length) % tabs.length : (currentIndex + 1) % tabs.length;
      const nextTab = tabs[nextIndex];
      if (!nextTab) return;
      switchTab(nextTab.id);
      // Focus the newly active tab element
      requestAnimationFrame(() => {
        const el = scrollRef.current?.querySelector<HTMLElement>(`[data-tab-id="${nextTab.id}"]`);
        el?.focus();
      });
    },
    [tabs, switchTab],
  );

  if (tabs.length === 0) return null;

  return (
    <div
      className={cn(
        'flex items-end gap-1 px-3 pt-2 shrink-0 overflow-hidden border-b-2',
        theme.isLight
          ? 'border-slate-300/50 bg-slate-100/50 backdrop-blur-sm'
          : 'border-white/10 bg-black/40 backdrop-blur-sm',
      )}
      role="tablist"
    >
      <div
        ref={scrollRef}
        onWheel={handleWheel}
        className="flex items-end gap-1 overflow-x-auto scrollbar-hide flex-1 min-w-0"
      >
        <AnimatePresence mode="popLayout">
          {tabs.map((tab, index) => (
            <TabItem
              key={tab.id}
              tab={tab}
              tabIndex_={index}
              isActive={tab.id === activeTabId}
              onSwitch={switchTab}
              onClose={closeTab}
              onTogglePin={togglePinTab}
              onContextMenu={handleContextMenuOpen}
              onArrowNav={handleArrowNav}
              messageCount={getMessageCount(tab.sessionId)}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              isDragOver={dragOverIndex === index && dragIndex !== index}
              isDragging={dragIndex === index}
            />
          ))}
        </AnimatePresence>
      </div>

      <button
        type="button"
        onClick={() => createSessionWithSync()}
        className={cn(
          'shrink-0 p-2 mb-1 rounded-xl transition-all',
          theme.isLight
            ? 'text-gray-500 hover:bg-emerald-500/15 hover:text-emerald-700 active:bg-emerald-500/25'
            : 'text-white/50 hover:bg-white/15 hover:text-white active:bg-white/25',
        )}
        title={`${t('tabs.newTab', 'New tab')} (Ctrl+T)`}
        aria-label={t('tabs.newTab', 'New tab')}
      >
        <Plus size={18} strokeWidth={2.5} />
      </button>

      <AnimatePresence>
        {contextMenu &&
          (() => {
            const targetTab = tabs.find((t) => t.id === contextMenu.tabId);
            if (!targetTab) return null;
            return (
              <>
                {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop overlay — click dismisses context menu */}
                <div
                  className="fixed inset-0 z-50"
                  onClick={() => setContextMenu(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setContextMenu(null);
                  }}
                  role="presentation"
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.1 }}
                  className={cn(
                    'fixed z-50 min-w-[180px] rounded-xl border backdrop-blur-xl shadow-2xl overflow-hidden py-1',
                    theme.isLight ? 'bg-white/95 border-slate-200/50' : 'bg-black/90 border-white/15',
                  )}
                  style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      togglePinTab(contextMenu.tabId);
                      setContextMenu(null);
                    }}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-sm font-mono transition-colors',
                      theme.isLight
                        ? 'text-slate-700 hover:bg-emerald-500/10 hover:text-emerald-800'
                        : 'text-white/80 hover:bg-white/10 hover:text-white',
                    )}
                  >
                    <Pin size={14} />
                    {targetTab.isPinned ? t('tabs.unpinTab', 'Unpin tab') : t('tabs.pinTab', 'Pin tab')}
                  </button>

                  {!targetTab.isPinned && (
                    <button
                      type="button"
                      onClick={() => {
                        closeTab(contextMenu.tabId);
                        setContextMenu(null);
                      }}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 text-sm font-mono transition-colors',
                        theme.isLight
                          ? 'text-slate-700 hover:bg-red-500/10 hover:text-red-600'
                          : 'text-white/80 hover:bg-red-500/15 hover:text-red-400',
                      )}
                    >
                      <X size={14} />
                      {t('tabs.closeTab', 'Close tab')}
                    </button>
                  )}

                  {tabs.filter((t) => t.id !== contextMenu.tabId && !t.isPinned).length > 0 && (
                    <>
                      <div
                        className={cn('mx-2 my-1 border-t', theme.isLight ? 'border-slate-200/50' : 'border-white/10')}
                      />
                      <button
                        type="button"
                        onClick={() => handleCloseOtherTabs(contextMenu.tabId)}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 text-sm font-mono transition-colors',
                          theme.isLight
                            ? 'text-slate-700 hover:bg-slate-500/10 hover:text-slate-900'
                            : 'text-white/80 hover:bg-white/10 hover:text-white',
                        )}
                      >
                        <X size={14} />
                        {t('tabs.closeOtherTabs', 'Close other tabs')}
                      </button>
                    </>
                  )}
                </motion.div>
              </>
            );
          })()}
      </AnimatePresence>
    </div>
  );
});

TabBar.displayName = 'TabBar';
