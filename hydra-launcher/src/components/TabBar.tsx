import React, { useState } from 'react';
import { Plus, X, AlertTriangle, Sparkles } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useTabContext, CLIProvider } from '../contexts/TabContext';

const providerIcons: Record<CLIProvider, string> = {
  claude: '🤖',
  gemini: '🔵',
  jules: '🟣',
  codex: '🟢',
  grok: '⚫',
  ollama: '🦙',
};

interface TabBarProps {
  onCreateTab: (provider: CLIProvider) => void;
}

const TabBar: React.FC<TabBarProps> = ({ onCreateTab }) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const { tabs, activeTabId, switchTab, closeTab, renameTab } = useTabContext();

  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showNewTabMenu, setShowNewTabMenu] = useState(false);

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

  const handleKeyDown = (e: React.KeyboardEvent, tabId: string) => {
    if (e.key === 'Enter') {
      handleFinishEdit(tabId);
    } else if (e.key === 'Escape') {
      setEditingTabId(null);
      setEditValue('');
    }
  };

  return (
    <div className={`flex items-center gap-1 px-2 py-1 border-b overflow-x-auto ${
      isLight ? 'border-gray-200 bg-gray-50' : 'border-gray-800 bg-gray-900/50'
    }`}>
      {/* Tabs */}
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`group flex items-center gap-2 px-3 py-1.5 rounded-t-lg cursor-pointer transition-all duration-200 min-w-[120px] max-w-[200px] ${
            tab.id === activeTabId
              ? isLight
                ? 'bg-white border-t border-l border-r border-gray-200 -mb-px'
                : 'bg-gray-800 border-t border-l border-r border-gray-700 -mb-px'
              : isLight
                ? 'bg-gray-100 hover:bg-gray-200'
                : 'bg-gray-900 hover:bg-gray-800'
          }`}
          onClick={() => switchTab(tab.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            handleStartEdit(tab.id, tab.name);
          }}
        >
          {/* Provider icon */}
          <span className="text-sm shrink-0">{providerIcons[tab.provider]}</span>

          {/* Tab name / edit input */}
          {editingTabId === tab.id ? (
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, tab.id)}
              onBlur={() => handleFinishEdit(tab.id)}
              autoFocus
              className={`flex-1 min-w-0 px-1 text-xs font-medium bg-transparent outline-none border-b ${
                isLight ? 'border-amber-500' : 'border-amber-400'
              }`}
            />
          ) : (
            <span className={`flex-1 truncate text-xs font-medium ${
              isLight ? 'text-gray-700' : 'text-gray-300'
            }`}>
              {tab.name}
            </span>
          )}

          {/* Indicators */}
          <div className="flex items-center gap-1">
            {/* Loading indicator */}
            {tab.isLoading && (
              <Sparkles size={12} className="animate-pulse text-amber-500" />
            )}

            {/* Unread indicator */}
            {tab.hasUnread && tab.id !== activeTabId && (
              <div className="w-2 h-2 rounded-full bg-blue-500" />
            )}

            {/* Conflict indicator */}
            {tab.hasConflict && (
              <AlertTriangle size={12} className="text-red-500" />
            )}

            {/* Close button */}
            {tabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className={`opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity ${
                  isLight ? 'hover:bg-gray-200' : 'hover:bg-gray-700'
                }`}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      ))}

      {/* New tab button */}
      <div className="relative">
        <button
          onClick={() => setShowNewTabMenu(!showNewTabMenu)}
          className={`p-1.5 rounded transition-colors ${
            isLight
              ? 'hover:bg-gray-200 text-gray-600'
              : 'hover:bg-gray-800 text-gray-400'
          }`}
          title="Nowa zakładka"
        >
          <Plus size={16} />
        </button>

        {/* New tab menu */}
        {showNewTabMenu && (
          <div
            className={`absolute top-full left-0 mt-1 py-1 rounded-lg shadow-lg border z-50 min-w-[180px] ${
              isLight
                ? 'bg-white border-gray-200'
                : 'bg-gray-900 border-gray-700'
            }`}
          >
            <div className={`px-3 py-1 text-[10px] font-semibold tracking-wider ${
              isLight ? 'text-gray-400' : 'text-gray-500'
            }`}>
              WYBIERZ PROVIDER
            </div>
            {(['claude', 'gemini', 'jules', 'ollama'] as CLIProvider[]).map((provider) => (
              <button
                key={provider}
                onClick={() => {
                  onCreateTab(provider);
                  setShowNewTabMenu(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                  isLight
                    ? 'hover:bg-gray-100 text-gray-700'
                    : 'hover:bg-gray-800 text-gray-300'
                }`}
              >
                <span>{providerIcons[provider]}</span>
                <span className="font-medium">{provider.toUpperCase()}</span>
                {provider === 'claude' && (
                  <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded ${
                    isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-900/30 text-amber-400'
                  }`}>
                    GŁÓWNY
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Queue stats indicator */}
      <div className={`ml-auto flex items-center gap-2 text-[10px] font-mono ${
        isLight ? 'text-gray-400' : 'text-gray-600'
      }`}>
        <span>{tabs.length} tab{tabs.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Click outside to close menu */}
      {showNewTabMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowNewTabMenu(false)}
        />
      )}
    </div>
  );
};

export default TabBar;
