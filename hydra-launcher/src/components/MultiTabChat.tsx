import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Scroll, ChevronDown, ChevronUp, Sparkles, Copy, ClipboardPaste, AlertTriangle } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useTabContext, Message } from '../contexts/TabContext';
import ProgressBar from './ProgressBar';
import TheEndAnimation from './TheEndAnimation';
import { useSoundEffects } from '../hooks/useSoundEffects';
import { useChatHistory } from '../hooks/useChatHistory';

// ============================================================================
// CONTEXT MENU
// ============================================================================

interface ContextMenuProps {
  x: number;
  y: number;
  onCopy: () => void;
  onPaste: () => void;
  onClose: () => void;
  hasSelection: boolean;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, onCopy, onPaste, onClose, hasSelection }) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  useEffect(() => {
    const handleClick = () => onClose();
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [onClose]);

  return (
    <div
      className={`fixed z-50 py-1 rounded-lg shadow-lg border min-w-[120px] ${
        isLight ? 'bg-white border-gray-200' : 'bg-gray-900 border-gray-700'
      }`}
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => { onCopy(); onClose(); }}
        disabled={!hasSelection}
        className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
          hasSelection
            ? isLight
              ? 'hover:bg-gray-100 text-gray-700'
              : 'hover:bg-gray-800 text-gray-300'
            : isLight
              ? 'text-gray-300 cursor-not-allowed'
              : 'text-gray-600 cursor-not-allowed'
        }`}
      >
        <Copy size={14} />
        <span>Kopiuj</span>
        <span className="ml-auto text-xs opacity-50">Ctrl+C</span>
      </button>
      <button
        onClick={() => { onPaste(); onClose(); }}
        className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
          isLight
            ? 'hover:bg-gray-100 text-gray-700'
            : 'hover:bg-gray-800 text-gray-300'
        }`}
      >
        <ClipboardPaste size={14} />
        <span>Wklej</span>
        <span className="ml-auto text-xs opacity-50">Ctrl+V</span>
      </button>
    </div>
  );
};

// ============================================================================
// MESSAGE BUBBLE
// ============================================================================

interface MessageBubbleProps {
  message: Message;
  onContextMenu: (e: React.MouseEvent) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onContextMenu }) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const [expanded, setExpanded] = useState(true);
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
      onContextMenu={onContextMenu}
    >
      <div
        className={`max-w-[85%] rounded p-2 border transition-all duration-300 relative backdrop-blur-sm ${
          isUser
            ? isLight
              ? 'bg-gray-100/70 border-gray-300/50 text-gray-800'
              : 'bg-gray-800/50 border-gray-600/40 text-gray-100'
            : isSystem
              ? isLight
                ? 'bg-blue-50/70 border-blue-200/50 text-blue-800'
                : 'bg-blue-900/30 border-blue-700/30 text-blue-200'
              : isLight
                ? 'bg-white/70 border-gray-200/50 text-gray-800'
                : 'bg-black/40 border-gray-700/30 text-gray-100'
        }`}
      >
        {/* Header - kompaktowy */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            {isUser ? (
              <span className={`text-[9px] font-mono font-semibold tracking-wider ${
                isLight ? 'text-gray-600' : 'text-gray-400'
              }`}>
                USER
              </span>
            ) : isSystem ? (
              <span className={`text-[9px] font-mono font-semibold tracking-wider ${
                isLight ? 'text-blue-600' : 'text-blue-400'
              }`}>
                SYSTEM
              </span>
            ) : (
              <>
                <Sparkles size={10} className={isLight ? 'text-gray-600' : 'text-gray-400'} />
                <span className={`text-[9px] font-mono font-semibold tracking-wider ${
                  isLight ? 'text-gray-700' : 'text-gray-300'
                }`}>
                  REGIS
                </span>
              </>
            )}
          </div>

          <span className={`text-[8px] font-mono ${
            isLight ? 'text-gray-400' : 'text-gray-600'
          }`}>
            {message.timestamp.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* Content - mniejszy */}
        <div className={`text-xs font-mono leading-relaxed whitespace-pre-wrap ${
          !expanded && message.content.length > 500 ? 'line-clamp-5' : ''
        }`}>
          {message.content}
        </div>

        {/* Expand/Collapse */}
        {message.content.length > 500 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className={`mt-1 flex items-center gap-1 text-[8px] font-mono ${
              isLight ? 'text-gray-500 hover:text-gray-700' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {expanded ? (
              <>
                <ChevronUp size={10} />
                Zwiń
              </>
            ) : (
              <>
                <ChevronDown size={10} />
                Rozwiń
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface MultiTabChatProps {
  onConnectionChange?: (connected: boolean) => void;
}

const MultiTabChat: React.FC<MultiTabChatProps> = ({ onConnectionChange }) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const { playMessageSent, playMessageReceived, playError, playClick } = useSoundEffects();
  const { tabs, activeTabId, sendMessage, isConnected, conflicts, queueStats } = useTabContext();
  const { saveSession } = useChatHistory();

  const [input, setInput] = useState('');
  const [showTheEnd, setShowTheEnd] = useState(false);
  const [lastTaskSummary, setLastTaskSummary] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Get active tab
  const activeTab = tabs.find(t => t.id === activeTabId);
  const messages = activeTab?.messages || [];
  const isLoading = activeTab?.isLoading || false;

  // Save session to history when messages change
  useEffect(() => {
    if (activeTab && messages.length > 0) {
      saveSession({
        id: activeTab.id,
        name: activeTab.name,
        provider: activeTab.provider,
        messages: messages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
        })),
        createdAt: new Date(activeTab.createdAt),
        updatedAt: new Date(),
      });
    }
  }, [activeTab, messages, saveSession]);

  // Notify parent about connection status
  useEffect(() => {
    onConnectionChange?.(isConnected);
  }, [isConnected, onConnectionChange]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 150) + 'px';
    }
  }, [input]);

  // Check for task completion
  useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'assistant') {
        const lower = lastMsg.content.toLowerCase();
        if (lower.includes('ukończono') || lower.includes('done') || lower.includes('completed') ||
            lower.includes('gotowe') || lower.includes('zrobione') || lower.includes('sukces')) {
          const prevUserMsg = [...messages].reverse().find(m => m.role === 'user');
          setLastTaskSummary(prevUserMsg?.content || 'Zadanie ukończone');
          setTimeout(() => setShowTheEnd(true), 500);
        }
        playMessageReceived();
      }
    }
  }, [messages, playMessageReceived]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    playMessageSent();
    const content = input.trim();
    setInput('');

    try {
      await sendMessage(content);
    } catch (error) {
      playError();
    }
  }, [input, isLoading, sendMessage, playMessageSent, playError]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleCopy = () => {
    const selection = window.getSelection()?.toString();
    if (selection) {
      navigator.clipboard.writeText(selection);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInput(prev => prev + text);
      inputRef.current?.focus();
    } catch (error) {
      console.error('Failed to paste:', error);
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (!activeTab) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className={isLight ? 'text-gray-400' : 'text-gray-600'}>
          Brak aktywnej zakładki
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" onContextMenu={handleContextMenu}>
      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onCopy={handleCopy}
          onPaste={handlePaste}
          onClose={() => setContextMenu(null)}
          hasSelection={!!window.getSelection()?.toString()}
        />
      )}

      {/* THE END Animation */}
      <TheEndAnimation
        isVisible={showTheEnd}
        onDismiss={() => setShowTheEnd(false)}
        taskSummary={lastTaskSummary || 'Zadanie ukończone pomyślnie'}
      />

      {/* Conflict Warning */}
      {activeTab.hasConflict && conflicts.length > 0 && (
        <div className={`px-4 py-2 flex items-center gap-2 border-b ${
          isLight
            ? 'bg-red-50 border-red-200 text-red-700'
            : 'bg-red-900/20 border-red-800 text-red-400'
        }`}>
          <AlertTriangle size={16} />
          <span className="text-sm">
            Wykryto konflikt w {conflicts.length} plik{conflicts.length > 1 ? 'ach' : 'u'}:
            {' '}
            {conflicts.slice(0, 2).map(c => c.filePath.split('/').pop()).join(', ')}
            {conflicts.length > 2 && ` i ${conflicts.length - 2} więcej`}
          </span>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onContextMenu={handleContextMenu}
          />
        ))}

        {/* Progress Bar */}
        {isLoading && (
          <div className="px-2">
            <ProgressBar isActive={isLoading} estimatedDurationMs={8000} />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className={`p-4 border-t ${
        isLight ? 'border-amber-300/30 bg-amber-50/30' : 'border-amber-500/20 bg-black/20'
      }`}>
        {/* Status indicators */}
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-2 h-2 rounded-full ${
            isConnected ? 'bg-emerald-500' : 'bg-red-500'
          }`} />
          <span className={`text-[9px] font-cinzel tracking-wider ${
            isLight ? 'text-amber-600/60' : 'text-amber-500/50'
          }`}>
            {isConnected ? 'KODEKS AKTYWNY' : 'ROZŁĄCZONY'}
          </span>

          {/* Queue stats */}
          {queueStats && queueStats.totalQueued > 0 && (
            <span className={`text-[9px] ml-2 px-2 py-0.5 rounded ${
              isLight ? 'bg-blue-100 text-blue-600' : 'bg-blue-900/30 text-blue-400'
            }`}>
              W kolejce: {queueStats.totalQueued}
            </span>
          )}

          <span className={`text-[9px] ml-auto ${isLight ? 'text-amber-600/40' : 'text-amber-500/30'}`}>
            ᛊ ᛏ ᛒ
          </span>
        </div>

        {/* Input container */}
        <div className={`flex items-end gap-3 p-3 rounded-lg border-2 transition-all duration-300 relative ${
          isLight
            ? 'bg-white/60 border-amber-400/40 focus-within:border-amber-500'
            : 'bg-black/30 border-amber-500/30 focus-within:border-amber-400'
        }`}
        style={{
          boxShadow: isLight
            ? 'inset 0 0 20px rgba(245, 158, 11, 0.05)'
            : 'inset 0 0 30px rgba(0, 0, 0, 0.3)',
        }}
        >
          {/* Corner ornaments */}
          <span className={`absolute -top-2 left-4 text-[10px] px-1 ${
            isLight ? 'text-amber-500 bg-amber-50' : 'text-amber-500/60 bg-black'
          }`}>◆</span>
          <span className={`absolute -bottom-2 right-4 text-[10px] px-1 ${
            isLight ? 'text-amber-500 bg-amber-50' : 'text-amber-500/60 bg-black'
          }`}>◆</span>

          <Scroll className={`shrink-0 mb-2 ${isLight ? 'text-amber-600/50' : 'text-amber-500/40'}`} size={18} />

          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onContextMenu={(e) => {
              e.stopPropagation();
              handleContextMenu(e);
            }}
            placeholder="Wpisz polecenie dla REGIS..."
            disabled={isLoading}
            rows={1}
            className={`flex-1 bg-transparent resize-none outline-none font-cinzel text-sm ${
              isLight ? 'text-amber-900 placeholder:text-amber-400/50' : 'text-amber-100 placeholder:text-amber-500/40'
            }`}
            style={{ maxHeight: '150px' }}
          />

          <button
            onClick={() => { playClick(); handleSend(); }}
            disabled={!input.trim() || isLoading}
            className={`shrink-0 p-2.5 rounded-lg transition-all duration-300 border ${
              input.trim() && !isLoading
                ? isLight
                  ? 'bg-gradient-to-b from-amber-400 to-amber-500 text-white border-amber-500 hover:from-amber-500 hover:to-amber-600 shadow-lg shadow-amber-500/20'
                  : 'bg-gradient-to-b from-amber-600 to-amber-700 text-amber-100 border-amber-500 hover:from-amber-500 hover:to-amber-600 shadow-lg shadow-amber-500/10'
                : isLight
                  ? 'bg-slate-200 text-slate-400 border-slate-300 cursor-not-allowed'
                  : 'bg-slate-800 text-slate-600 border-slate-700 cursor-not-allowed'
            }`}
          >
            {isLoading ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <Send size={18} />
            )}
          </button>
        </div>

        {/* Hint */}
        <div className={`flex items-center justify-between mt-2 text-[8px] font-cinzel ${
          isLight ? 'text-amber-600/40' : 'text-amber-500/30'
        }`}>
          <span>Enter = wyślij • Shift+Enter = nowa linia • PPM = kopiuj/wklej</span>
          <span>◆ {activeTab.provider.toUpperCase()} ◆</span>
        </div>
      </div>
    </div>
  );
};

export default MultiTabChat;
