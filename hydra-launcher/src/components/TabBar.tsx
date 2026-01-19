import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, X, AlertTriangle, Sparkles, ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useTabContext, CLIProvider, Tab } from '../contexts/TabContext';

// ============================================================================
// PROVIDER CONFIGURATION
// ============================================================================

interface ProviderConfig {
  icon: string;
  color: string;
  gradientFrom: string;
  gradientTo: string;
  glowColor: string;
  label: string;
}

const providerConfigs: Record<CLIProvider, ProviderConfig> = {
  claude: {
    icon: '🤖',
    color: '#f59e0b',
    gradientFrom: 'from-amber-500',
    gradientTo: 'to-orange-500',
    glowColor: 'rgba(245, 158, 11, 0.4)',
    label: 'CLAUDE',
  },
  gemini: {
    icon: '🔵',
    color: '#3b82f6',
    gradientFrom: 'from-blue-500',
    gradientTo: 'to-cyan-500',
    glowColor: 'rgba(59, 130, 246, 0.4)',
    label: 'GEMINI',
  },
  jules: {
    icon: '🟣',
    color: '#a855f7',
    gradientFrom: 'from-purple-500',
    gradientTo: 'to-pink-500',
    glowColor: 'rgba(168, 85, 247, 0.4)',
    label: 'JULES',
  },
  codex: {
    icon: '🟢',
    color: '#22c55e',
    gradientFrom: 'from-green-500',
    gradientTo: 'to-emerald-500',
    glowColor: 'rgba(34, 197, 94, 0.4)',
    label: 'CODEX',
  },
  grok: {
    icon: '⚫',
    color: '#6b7280',
    gradientFrom: 'from-gray-500',
    gradientTo: 'to-slate-500',
    glowColor: 'rgba(107, 114, 128, 0.4)',
    label: 'GROK',
  },
  ollama: {
    icon: '🦙',
    color: '#ec4899',
    gradientFrom: 'from-pink-500',
    gradientTo: 'to-rose-500',
    glowColor: 'rgba(236, 72, 153, 0.4)',
    label: 'OLLAMA',
  },
};

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

interface ProviderIconProps {
  provider: CLIProvider;
  isActive: boolean;
  messageCount?: number;
  isHovered: boolean;
}

const ProviderIcon: React.FC<ProviderIconProps> = ({ provider, isActive, messageCount, isHovered }) => {
  const config = providerConfigs[provider];

  return (
    <div className="relative shrink-0">
      {/* Animated icon container */}
      <div
        className={`
          relative text-sm transition-all duration-300 ease-out
          ${isHovered ? 'scale-125 rotate-12' : 'scale-100 rotate-0'}
          ${isActive ? 'animate-pulse' : ''}
        `}
        style={{
          filter: isHovered ? `drop-shadow(0 0 6px ${config.glowColor})` : 'none',
        }}
      >
        {config.icon}
      </div>

      {/* Message count badge */}
      {messageCount && messageCount > 0 && (
        <div
          className={`
            absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] px-1
            flex items-center justify-center
            text-[9px] font-bold text-white rounded-full
            bg-gradient-to-r ${config.gradientFrom} ${config.gradientTo}
            shadow-lg animate-bounce-subtle
          `}
        >
          {messageCount > 99 ? '99+' : messageCount}
        </div>
      )}
    </div>
  );
};

interface CloseButtonProps {
  onClick: (e: React.MouseEvent) => void;
  isLight: boolean;
}

const CloseButton: React.FC<CloseButtonProps> = ({ onClick, isLight }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`
        relative p-0.5 rounded-full transition-all duration-200
        opacity-0 group-hover:opacity-100
        ${isLight ? 'hover:bg-red-100' : 'hover:bg-red-900/50'}
      `}
    >
      <X
        size={12}
        className={`
          transition-all duration-200
          ${isHovered ? 'rotate-90 scale-110 text-red-500' : 'rotate-0 scale-100'}
          ${isLight ? 'text-gray-500' : 'text-gray-400'}
        `}
      />
    </button>
  );
};

// ============================================================================
// SCROLL INDICATORS
// ============================================================================

interface ScrollIndicatorProps {
  direction: 'left' | 'right';
  onClick: () => void;
  visible: boolean;
  isLight: boolean;
}

const ScrollIndicator: React.FC<ScrollIndicatorProps> = ({ direction, onClick, visible, isLight }) => {
  if (!visible) return null;

  const Icon = direction === 'left' ? ChevronLeft : ChevronRight;

  return (
    <button
      onClick={onClick}
      className={`
        absolute top-0 bottom-0 ${direction === 'left' ? 'left-0' : 'right-0'}
        w-8 flex items-center justify-center z-10
        transition-all duration-300
        ${isLight
          ? `bg-gradient-to-${direction === 'left' ? 'r' : 'l'} from-gray-50 via-gray-50/90 to-transparent`
          : `bg-gradient-to-${direction === 'left' ? 'r' : 'l'} from-gray-900 via-gray-900/90 to-transparent`
        }
      `}
    >
      <div
        className={`
          p-1 rounded-full transition-all duration-200
          ${isLight
            ? 'bg-gray-200/80 hover:bg-gray-300 text-gray-600'
            : 'bg-gray-700/80 hover:bg-gray-600 text-gray-300'
          }
          hover:scale-110 active:scale-95
        `}
      >
        <Icon size={14} />
      </div>
    </button>
  );
};

// ============================================================================
// TAB ITEM
// ============================================================================

interface TabItemProps {
  tab: Tab;
  isActive: boolean;
  isLight: boolean;
  isEditing: boolean;
  editValue: string;
  onEditValueChange: (value: string) => void;
  onStartEdit: () => void;
  onFinishEdit: () => void;
  onCancelEdit: () => void;
  onClick: () => void;
  onClose: () => void;
  canClose: boolean;
  unreadCount?: number;
}

const TabItem: React.FC<TabItemProps> = ({
  tab,
  isActive,
  isLight,
  isEditing,
  editValue,
  onEditValueChange,
  onStartEdit,
  onFinishEdit,
  onCancelEdit,
  onClick,
  onClose,
  canClose,
  unreadCount,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const config = providerConfigs[tab.provider];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onFinishEdit();
    } else if (e.key === 'Escape') {
      onCancelEdit();
    }
  };

  return (
    <div
      className={`
        group relative flex items-center gap-2 px-3 py-2 cursor-pointer
        transition-all duration-300 ease-out
        min-w-[130px] max-w-[220px]
        ${isActive
          ? isLight
            ? 'bg-white'
            : 'bg-gray-800'
          : isLight
            ? 'bg-gray-100/50 hover:bg-gray-100'
            : 'bg-gray-900/50 hover:bg-gray-800/70'
        }
        ${isActive ? 'z-10' : 'z-0'}
      `}
      style={{
        borderRadius: '8px 8px 0 0',
        boxShadow: isActive && isHovered
          ? `0 0 20px ${config.glowColor}`
          : 'none',
      }}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenu={(e) => {
        e.preventDefault();
        onStartEdit();
      }}
    >
      {/* Gradient underline for active tab */}
      {isActive && (
        <div
          className={`
            absolute bottom-0 left-0 right-0 h-[2px]
            bg-gradient-to-r ${config.gradientFrom} ${config.gradientTo}
            animate-gradient-x
          `}
          style={{
            boxShadow: `0 0 8px ${config.glowColor}`,
          }}
        />
      )}

      {/* Hover underline for inactive tabs */}
      {!isActive && (
        <div
          className={`
            absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] w-0
            bg-gradient-to-r ${config.gradientFrom} ${config.gradientTo}
            transition-all duration-300 ease-out
            ${isHovered ? 'w-3/4' : 'w-0'}
          `}
        />
      )}

      {/* Top border accent for active */}
      {isActive && (
        <div
          className={`
            absolute top-0 left-0 right-0 h-[1px]
            bg-gradient-to-r ${config.gradientFrom} via-transparent ${config.gradientTo}
            opacity-50
          `}
        />
      )}

      {/* Drag handle (visual placeholder for future drag-drop) */}
      <GripVertical
        size={12}
        className={`
          shrink-0 transition-all duration-200
          ${isLight ? 'text-gray-300' : 'text-gray-700'}
          opacity-0 group-hover:opacity-50 cursor-grab
        `}
      />

      {/* Provider icon with badge */}
      <ProviderIcon
        provider={tab.provider}
        isActive={isActive}
        messageCount={unreadCount}
        isHovered={isHovered}
      />

      {/* Tab name / edit input */}
      {isEditing ? (
        <input
          type="text"
          value={editValue}
          onChange={(e) => onEditValueChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={onFinishEdit}
          autoFocus
          className={`
            flex-1 min-w-0 px-1.5 py-0.5 text-xs font-medium
            bg-transparent outline-none rounded
            border-2 transition-colors duration-200
            ${isLight
              ? 'border-amber-400 focus:border-amber-500 text-gray-800'
              : 'border-amber-500 focus:border-amber-400 text-gray-200'
            }
          `}
        />
      ) : (
        <span
          className={`
            flex-1 truncate text-xs font-medium
            transition-colors duration-200
            ${isActive
              ? isLight ? 'text-gray-800' : 'text-white'
              : isLight ? 'text-gray-600' : 'text-gray-400'
            }
            ${isHovered && !isActive ? (isLight ? 'text-gray-700' : 'text-gray-300') : ''}
          `}
        >
          {tab.name}
        </span>
      )}

      {/* Status indicators */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Loading indicator */}
        {tab.isLoading && (
          <div className="relative">
            <Sparkles
              size={12}
              className="text-amber-500 animate-spin"
              style={{ animationDuration: '2s' }}
            />
            <div className="absolute inset-0 animate-ping">
              <Sparkles size={12} className="text-amber-500/50" />
            </div>
          </div>
        )}

        {/* Unread indicator (pulsing dot) */}
        {tab.hasUnread && !isActive && (
          <div className="relative">
            <div
              className={`
                w-2 h-2 rounded-full
                bg-gradient-to-r ${config.gradientFrom} ${config.gradientTo}
              `}
            />
            <div
              className={`
                absolute inset-0 w-2 h-2 rounded-full animate-ping
                bg-gradient-to-r ${config.gradientFrom} ${config.gradientTo}
                opacity-75
              `}
            />
          </div>
        )}

        {/* Conflict indicator */}
        {tab.hasConflict && (
          <AlertTriangle
            size={12}
            className="text-red-500 animate-pulse"
          />
        )}

        {/* Close button */}
        {canClose && (
          <CloseButton
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            isLight={isLight}
          />
        )}
      </div>
    </div>
  );
};

// ============================================================================
// NEW TAB BUTTON
// ============================================================================

interface NewTabButtonProps {
  isOpen: boolean;
  onToggle: () => void;
  onCreateTab: (provider: CLIProvider) => void;
  isLight: boolean;
}

const NewTabButton: React.FC<NewTabButtonProps> = ({ isOpen, onToggle, onCreateTab, isLight }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  const availableProviders: { provider: CLIProvider; badge?: string }[] = [
    { provider: 'claude', badge: 'MAIN' },
    { provider: 'gemini' },
    { provider: 'jules' },
    { provider: 'ollama' },
    { provider: 'codex', badge: 'SOON' },
    { provider: 'grok', badge: 'SOON' },
  ];

  return (
    <div className="relative">
      {/* Pulsing gradient border button */}
      <button
        onClick={onToggle}
        className={`
          relative p-2 rounded-lg transition-all duration-300
          ${isOpen ? 'scale-95' : 'hover:scale-105'}
        `}
        title="New tab"
      >
        {/* Gradient border effect */}
        <div
          className={`
            absolute inset-0 rounded-lg
            bg-gradient-to-r from-amber-500 via-purple-500 to-cyan-500
            animate-gradient-x opacity-50
            ${isOpen ? 'opacity-80' : 'group-hover:opacity-70'}
          `}
          style={{
            padding: '1px',
            WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
          }}
        />

        {/* Pulsing glow effect */}
        <div
          className={`
            absolute inset-0 rounded-lg animate-pulse-slow
            bg-gradient-to-r from-amber-500/20 via-purple-500/20 to-cyan-500/20
            blur-sm
          `}
        />

        {/* Button content */}
        <div
          className={`
            relative z-10 p-0.5 rounded-md
            ${isLight ? 'bg-gray-50' : 'bg-gray-900'}
          `}
        >
          <Plus
            size={16}
            className={`
              transition-all duration-300
              ${isOpen ? 'rotate-45' : 'rotate-0'}
              ${isLight ? 'text-gray-600' : 'text-gray-400'}
            `}
          />
        </div>
      </button>

      {/* Dropdown menu with animation */}
      <div
        ref={menuRef}
        className={`
          absolute top-full left-0 mt-2 py-2 rounded-xl shadow-2xl border z-50
          min-w-[200px] overflow-hidden
          transition-all duration-300 ease-out origin-top-left
          ${isOpen
            ? 'opacity-100 scale-100 translate-y-0'
            : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
          }
          ${isLight
            ? 'bg-white/95 backdrop-blur-xl border-gray-200/50'
            : 'bg-gray-900/95 backdrop-blur-xl border-gray-700/50'
          }
        `}
      >
        {/* Header */}
        <div
          className={`
            px-4 py-2 mb-1 text-[10px] font-bold tracking-widest
            ${isLight ? 'text-gray-400' : 'text-gray-500'}
          `}
        >
          SELECT PROVIDER
        </div>

        {/* Provider options */}
        {availableProviders.map(({ provider, badge }, index) => {
          const config = providerConfigs[provider];
          const isDisabled = badge === 'SOON';

          return (
            <button
              key={provider}
              onClick={() => {
                if (!isDisabled) {
                  onCreateTab(provider);
                }
              }}
              disabled={isDisabled}
              className={`
                w-full flex items-center gap-3 px-4 py-2.5
                transition-all duration-200
                ${isDisabled
                  ? 'opacity-40 cursor-not-allowed'
                  : 'hover:scale-[1.02]'
                }
                ${isLight
                  ? `hover:bg-gradient-to-r hover:${config.gradientFrom}/10 hover:${config.gradientTo}/10`
                  : `hover:bg-gradient-to-r hover:${config.gradientFrom}/20 hover:${config.gradientTo}/20`
                }
              `}
              style={{
                animationDelay: `${index * 50}ms`,
              }}
            >
              {/* Icon with hover effect */}
              <span
                className={`
                  text-lg transition-transform duration-200
                  ${!isDisabled ? 'group-hover:scale-110' : ''}
                `}
              >
                {config.icon}
              </span>

              {/* Provider name */}
              <span
                className={`
                  font-semibold text-sm
                  ${isLight ? 'text-gray-700' : 'text-gray-300'}
                `}
              >
                {config.label}
              </span>

              {/* Badge */}
              {badge && (
                <span
                  className={`
                    ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full
                    ${badge === 'MAIN'
                      ? `bg-gradient-to-r ${config.gradientFrom} ${config.gradientTo} text-white`
                      : isLight
                        ? 'bg-gray-200 text-gray-500'
                        : 'bg-gray-700 text-gray-400'
                    }
                  `}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Click outside overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={onToggle}
        />
      )}
    </div>
  );
};

// ============================================================================
// MAIN TABBAR COMPONENT
// ============================================================================

interface TabBarProps {
  onCreateTab: (provider: CLIProvider) => void;
}

const TabBar: React.FC<TabBarProps> = ({ onCreateTab }) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const { tabs, activeTabId, switchTab, closeTab, renameTab } = useTabContext();

  // State
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showNewTabMenu, setShowNewTabMenu] = useState(false);

  // Scroll state
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Check scroll state
  const updateScrollState = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    setCanScrollLeft(container.scrollLeft > 0);
    setCanScrollRight(
      container.scrollLeft < container.scrollWidth - container.clientWidth - 1
    );
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    updateScrollState();
    container.addEventListener('scroll', updateScrollState);
    window.addEventListener('resize', updateScrollState);

    return () => {
      container.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [updateScrollState, tabs.length]);

  // Scroll handlers
  const scrollLeft = () => {
    scrollContainerRef.current?.scrollBy({ left: -150, behavior: 'smooth' });
  };

  const scrollRight = () => {
    scrollContainerRef.current?.scrollBy({ left: 150, behavior: 'smooth' });
  };

  // Edit handlers
  const handleStartEdit = (tabId: string, currentName: string) => {
    setEditingTabId(tabId);
    setEditValue(currentName);
  };

  const handleFinishEdit = async (tabId: string) => {
    if (editValue.trim()) {
      await renameTab(tabId, editValue.trim());
    }
    setEditingTabId(null);
    setEditValue('');
  };

  const handleCancelEdit = () => {
    setEditingTabId(null);
    setEditValue('');
  };

  // Count unread messages per tab (placeholder - implement based on your needs)
  const getUnreadCount = (tab: Tab): number | undefined => {
    if (tab.hasUnread && tab.id !== activeTabId) {
      // Simple implementation - count messages since last activity
      return tab.messages.filter(m =>
        m.role === 'assistant' &&
        new Date(m.timestamp) > tab.lastActivity
      ).length || undefined;
    }
    return undefined;
  };

  return (
    <div
      className={`
        relative flex items-center gap-1 px-1 py-1.5 border-b
        ${isLight
          ? 'border-gray-200/80 bg-gradient-to-r from-gray-50 via-white to-gray-50'
          : 'border-gray-800/80 bg-gradient-to-r from-gray-900 via-gray-900/95 to-gray-900'
        }
      `}
    >
      {/* Scroll left indicator */}
      <ScrollIndicator
        direction="left"
        onClick={scrollLeft}
        visible={canScrollLeft}
        isLight={isLight}
      />

      {/* Tabs container with scroll */}
      <div
        ref={scrollContainerRef}
        className="flex items-end gap-1 overflow-x-auto scrollbar-hide flex-1 px-6"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {tabs.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            isLight={isLight}
            isEditing={editingTabId === tab.id}
            editValue={editValue}
            onEditValueChange={setEditValue}
            onStartEdit={() => handleStartEdit(tab.id, tab.name)}
            onFinishEdit={() => handleFinishEdit(tab.id)}
            onCancelEdit={handleCancelEdit}
            onClick={() => switchTab(tab.id)}
            onClose={() => closeTab(tab.id)}
            canClose={tabs.length > 1}
            unreadCount={getUnreadCount(tab)}
          />
        ))}
      </div>

      {/* Scroll right indicator */}
      <ScrollIndicator
        direction="right"
        onClick={scrollRight}
        visible={canScrollRight}
        isLight={isLight}
      />

      {/* New tab button */}
      <NewTabButton
        isOpen={showNewTabMenu}
        onToggle={() => setShowNewTabMenu(!showNewTabMenu)}
        onCreateTab={(provider) => {
          onCreateTab(provider);
          setShowNewTabMenu(false);
        }}
        isLight={isLight}
      />

      {/* Tab count indicator */}
      <div
        className={`
          flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-mono
          ${isLight
            ? 'bg-gray-100 text-gray-500'
            : 'bg-gray-800/50 text-gray-500'
          }
        `}
      >
        <span className="font-semibold">{tabs.length}</span>
        <span className="opacity-60">tab{tabs.length !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );
};

export default TabBar;
