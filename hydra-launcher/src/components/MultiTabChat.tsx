import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Scroll, ChevronDown, ChevronUp, Sparkles, Copy, ClipboardPaste, AlertTriangle } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useTabContext, Message } from '../contexts/TabContext';
import ProgressBar from './ProgressBar';
import TheEndAnimation from './TheEndAnimation';
import { useSoundEffects } from '../hooks/useSoundEffects';
import { useChatHistory } from '../hooks/useChatHistory';

// ============================================================================
// CUSTOM STYLES
// ============================================================================

const customScrollStyles = `
  .chat-scroll-area::-webkit-scrollbar {
    width: 6px;
  }
  .chat-scroll-area::-webkit-scrollbar-track {
    background: transparent;
  }
  .chat-scroll-area::-webkit-scrollbar-thumb {
    background: linear-gradient(180deg, rgba(245, 158, 11, 0.3) 0%, rgba(245, 158, 11, 0.1) 100%);
    border-radius: 3px;
  }
  .chat-scroll-area::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(180deg, rgba(245, 158, 11, 0.5) 0%, rgba(245, 158, 11, 0.2) 100%);
  }

  @keyframes messageSlideIn {
    0% {
      opacity: 0;
      transform: translateY(10px) scale(0.98);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes messageSlideInLeft {
    0% {
      opacity: 0;
      transform: translateX(-10px) scale(0.98);
    }
    100% {
      opacity: 1;
      transform: translateX(0) scale(1);
    }
  }

  @keyframes messageSlideInRight {
    0% {
      opacity: 0;
      transform: translateX(10px) scale(0.98);
    }
    100% {
      opacity: 1;
      transform: translateX(0) scale(1);
    }
  }

  .message-bubble-user {
    animation: messageSlideInRight 0.3s ease-out forwards;
  }

  .message-bubble-assistant {
    animation: messageSlideInLeft 0.3s ease-out forwards;
  }

  @keyframes inputGlow {
    0%, 100% {
      box-shadow: 0 0 5px rgba(245, 158, 11, 0.2);
    }
    50% {
      box-shadow: 0 0 15px rgba(245, 158, 11, 0.4);
    }
  }

  .input-focused {
    animation: inputGlow 2s ease-in-out infinite;
  }

  @keyframes sendButtonPulse {
    0% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.05);
    }
    100% {
      transform: scale(1);
    }
  }

  .send-button-ready:hover {
    animation: sendButtonPulse 0.3s ease-in-out;
  }

  @keyframes spinnerRotate {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  .custom-spinner {
    animation: spinnerRotate 1s linear infinite;
  }
`;

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

  // Dynamic gradient backgrounds
  const getBackgroundStyle = () => {
    if (isUser) {
      return isLight
        ? 'linear-gradient(135deg, rgba(245, 245, 245, 0.9) 0%, rgba(229, 231, 235, 0.8) 100%)'
        : 'linear-gradient(135deg, rgba(55, 65, 81, 0.7) 0%, rgba(31, 41, 55, 0.8) 100%)';
    }
    if (isSystem) {
      return isLight
        ? 'linear-gradient(135deg, rgba(239, 246, 255, 0.9) 0%, rgba(219, 234, 254, 0.8) 100%)'
        : 'linear-gradient(135deg, rgba(30, 58, 138, 0.4) 0%, rgba(23, 37, 84, 0.5) 100%)';
    }
    // Assistant - more elaborate gradient
    return isLight
      ? 'linear-gradient(145deg, rgba(255, 255, 255, 0.95) 0%, rgba(254, 243, 199, 0.3) 50%, rgba(255, 255, 255, 0.9) 100%)'
      : 'linear-gradient(145deg, rgba(0, 0, 0, 0.6) 0%, rgba(120, 53, 15, 0.15) 50%, rgba(0, 0, 0, 0.5) 100%)';
  };

  const getShadowStyle = () => {
    if (isUser) {
      return isLight
        ? '0 2px 8px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.08)'
        : '0 2px 8px rgba(0, 0, 0, 0.3), 0 1px 3px rgba(0, 0, 0, 0.2)';
    }
    if (isSystem) {
      return isLight
        ? '0 2px 10px rgba(59, 130, 246, 0.1), 0 1px 3px rgba(59, 130, 246, 0.08)'
        : '0 2px 10px rgba(59, 130, 246, 0.15), 0 1px 3px rgba(0, 0, 0, 0.3)';
    }
    // Assistant - subtle glow
    return isLight
      ? '0 4px 15px rgba(245, 158, 11, 0.08), 0 2px 6px rgba(0, 0, 0, 0.05)'
      : '0 4px 15px rgba(245, 158, 11, 0.1), 0 2px 6px rgba(0, 0, 0, 0.4)';
  };

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} ${
        isUser ? 'message-bubble-user' : 'message-bubble-assistant'
      }`}
      onContextMenu={onContextMenu}
    >
      <div
        className={`max-w-[85%] rounded-xl p-3 border transition-all duration-300 relative backdrop-blur-sm ${
          isUser
            ? isLight
              ? 'border-gray-200/60 text-gray-800'
              : 'border-gray-600/40 text-gray-100'
            : isSystem
              ? isLight
                ? 'border-blue-200/60 text-blue-800'
                : 'border-blue-700/40 text-blue-200'
              : isLight
                ? 'border-amber-200/50 text-gray-800'
                : 'border-amber-500/20 text-gray-100'
        }`}
        style={{
          background: getBackgroundStyle(),
          boxShadow: getShadowStyle(),
        }}
      >
        {/* Header - kompaktowy */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            {isUser ? (
              <span className={`text-[9px] font-mono font-semibold tracking-wider uppercase ${
                isLight ? 'text-gray-600' : 'text-gray-400'
              }`}>
                USER
              </span>
            ) : isSystem ? (
              <span className={`text-[9px] font-mono font-semibold tracking-wider uppercase ${
                isLight ? 'text-blue-600' : 'text-blue-400'
              }`}>
                SYSTEM
              </span>
            ) : (
              <>
                <Sparkles size={10} className={isLight ? 'text-amber-600' : 'text-amber-400'} />
                <span className={`text-[9px] font-mono font-semibold tracking-wider ${
                  isLight ? 'text-amber-700' : 'text-amber-300'
                }`}>
                  REGIS
                </span>
              </>
            )}
          </div>

          <span className={`text-[8px] font-mono ${
            isLight ? 'text-gray-400' : 'text-gray-500'
          }`}>
            {message.timestamp.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* Content - improved typography */}
        <div className={`text-[13px] font-mono leading-[1.6] whitespace-pre-wrap tracking-wide ${
          !expanded && message.content.length > 500 ? 'line-clamp-5' : ''
        }`}>
          {message.content}
        </div>

        {/* Expand/Collapse */}
        {message.content.length > 500 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className={`mt-2 flex items-center gap-1 text-[9px] font-mono transition-colors ${
              isLight
                ? 'text-gray-500 hover:text-amber-600'
                : 'text-gray-500 hover:text-amber-400'
            }`}
          >
            {expanded ? (
              <>
                <ChevronUp size={12} />
                Zwiń
              </>
            ) : (
              <>
                <ChevronDown size={12} />
                Rozwiń ({Math.round(message.content.length / 100) * 100}+ znaków)
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
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [showScrollFadeTop, setShowScrollFadeTop] = useState(false);
  const [showScrollFadeBottom, setShowScrollFadeBottom] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
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

  // Handle scroll fade effects
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (container) {
      const { scrollTop, scrollHeight, clientHeight } = container;
      setShowScrollFadeTop(scrollTop > 20);
      setShowScrollFadeBottom(scrollTop < scrollHeight - clientHeight - 20);
    }
  }, []);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      handleScroll(); // Initial check
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll, messages]);

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
      {/* Inject custom styles */}
      <style>{customScrollStyles}</style>

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

      {/* Messages Area with fade effects */}
      <div className="relative flex-1">
        {/* Top fade */}
        <div
          className={`absolute top-0 left-0 right-0 h-8 z-10 pointer-events-none transition-opacity duration-300 ${
            showScrollFadeTop ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            background: isLight
              ? 'linear-gradient(to bottom, rgba(255, 251, 235, 0.95) 0%, transparent 100%)'
              : 'linear-gradient(to bottom, rgba(0, 0, 0, 0.8) 0%, transparent 100%)',
          }}
        />

        {/* Scrollable container */}
        <div
          ref={messagesContainerRef}
          className="chat-scroll-area h-full overflow-auto p-4 space-y-4"
        >
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onContextMenu={handleContextMenu}
            />
          ))}

          {/* Progress Bar */}
          {isLoading && (
            <div className="px-2 message-bubble-assistant">
              <ProgressBar isActive={isLoading} estimatedDurationMs={8000} />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Bottom fade */}
        <div
          className={`absolute bottom-0 left-0 right-0 h-8 z-10 pointer-events-none transition-opacity duration-300 ${
            showScrollFadeBottom ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            background: isLight
              ? 'linear-gradient(to top, rgba(255, 251, 235, 0.95) 0%, transparent 100%)'
              : 'linear-gradient(to top, rgba(0, 0, 0, 0.8) 0%, transparent 100%)',
          }}
        />
      </div>

      {/* Input Area */}
      <div className={`p-4 border-t ${
        isLight ? 'border-amber-300/30 bg-amber-50/30' : 'border-amber-500/20 bg-black/20'
      }`}>
        {/* Status indicators */}
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-2 h-2 rounded-full transition-all duration-300 ${
            isConnected
              ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50'
              : 'bg-red-500 shadow-lg shadow-red-500/50'
          }`} />
          <span className={`text-[9px] font-cinzel tracking-wider ${
            isLight ? 'text-amber-600/60' : 'text-amber-500/50'
          }`}>
            {isConnected ? 'KODEKS AKTYWNY' : 'ROZLACZONY'}
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
            * * *
          </span>
        </div>

        {/* Input container with gradient border */}
        <div
          className={`relative rounded-xl p-[2px] transition-all duration-500 ${
            isInputFocused ? 'input-focused' : ''
          }`}
          style={{
            background: isInputFocused
              ? isLight
                ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.6) 0%, rgba(217, 119, 6, 0.4) 50%, rgba(245, 158, 11, 0.6) 100%)'
                : 'linear-gradient(135deg, rgba(245, 158, 11, 0.5) 0%, rgba(120, 53, 15, 0.3) 50%, rgba(245, 158, 11, 0.5) 100%)'
              : isLight
                ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.3) 0%, rgba(217, 119, 6, 0.2) 100%)'
                : 'linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(120, 53, 15, 0.15) 100%)',
          }}
        >
          <div
            className={`flex items-end gap-3 p-3 rounded-[10px] transition-all duration-300 relative ${
              isLight ? 'bg-white/90' : 'bg-black/80'
            }`}
            style={{
              boxShadow: isInputFocused
                ? isLight
                  ? 'inset 0 0 25px rgba(245, 158, 11, 0.1), 0 4px 20px rgba(245, 158, 11, 0.15)'
                  : 'inset 0 0 30px rgba(0, 0, 0, 0.4), 0 4px 20px rgba(245, 158, 11, 0.1)'
                : isLight
                  ? 'inset 0 0 15px rgba(245, 158, 11, 0.03)'
                  : 'inset 0 0 20px rgba(0, 0, 0, 0.3)',
            }}
          >
            {/* Corner ornaments with animation */}
            <span className={`absolute -top-2 left-4 text-[10px] px-1 transition-all duration-300 ${
              isLight ? 'text-amber-500 bg-amber-50' : 'text-amber-500/60 bg-black'
            } ${isInputFocused ? 'scale-110' : ''}`}>*</span>
            <span className={`absolute -bottom-2 right-4 text-[10px] px-1 transition-all duration-300 ${
              isLight ? 'text-amber-500 bg-amber-50' : 'text-amber-500/60 bg-black'
            } ${isInputFocused ? 'scale-110' : ''}`}>*</span>

            {/* Scroll icon */}
            <Scroll className={`shrink-0 mb-2 transition-all duration-300 ${
              isInputFocused
                ? isLight ? 'text-amber-600' : 'text-amber-400'
                : isLight ? 'text-amber-600/50' : 'text-amber-500/40'
            }`} size={18} />

            {/* Floating label container */}
            <div className="flex-1 relative">
              {/* Floating label */}
              <span
                className={`absolute left-0 transition-all duration-300 pointer-events-none font-cinzel ${
                  isInputFocused || input
                    ? '-top-5 text-[9px] opacity-100'
                    : 'top-1.5 text-sm opacity-0'
                } ${
                  isLight ? 'text-amber-600' : 'text-amber-400'
                }`}
              >
                Polecenie
              </span>

              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                onContextMenu={(e) => {
                  e.stopPropagation();
                  handleContextMenu(e);
                }}
                placeholder={isInputFocused ? '' : 'Wpisz polecenie dla REGIS...'}
                disabled={isLoading}
                rows={1}
                className={`w-full bg-transparent resize-none outline-none font-cinzel text-sm transition-all duration-300 ${
                  isLight
                    ? 'text-amber-900 placeholder:text-amber-400/40'
                    : 'text-amber-100 placeholder:text-amber-500/30'
                }`}
                style={{ maxHeight: '150px' }}
              />
            </div>

            {/* Enhanced Send button */}
            <button
              onClick={() => { playClick(); handleSend(); }}
              disabled={!input.trim() || isLoading}
              className={`shrink-0 p-3 rounded-xl transition-all duration-300 relative overflow-hidden ${
                input.trim() && !isLoading
                  ? `send-button-ready ${
                      isLight
                        ? 'text-white shadow-lg shadow-amber-500/30 hover:shadow-xl hover:shadow-amber-500/40 hover:scale-105'
                        : 'text-amber-100 shadow-lg shadow-amber-500/20 hover:shadow-xl hover:shadow-amber-500/30 hover:scale-105'
                    }`
                  : isLight
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-slate-800 text-slate-600 cursor-not-allowed'
              }`}
              style={input.trim() && !isLoading ? {
                background: isLight
                  ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #b45309 100%)'
                  : 'linear-gradient(135deg, #d97706 0%, #b45309 50%, #78350f 100%)',
              } : {}}
            >
              {/* Button glow effect */}
              {input.trim() && !isLoading && (
                <span
                  className="absolute inset-0 opacity-0 hover:opacity-30 transition-opacity duration-300"
                  style={{
                    background: 'radial-gradient(circle at center, white 0%, transparent 70%)',
                  }}
                />
              )}

              {isLoading ? (
                <div className="relative">
                  <Loader2 className="custom-spinner" size={18} />
                  {/* Loading ring */}
                  <span
                    className="absolute inset-0 rounded-full border-2 border-amber-400/30"
                    style={{
                      animation: 'spinnerRotate 2s linear infinite reverse',
                    }}
                  />
                </div>
              ) : (
                <Send size={18} className="relative z-10" />
              )}
            </button>
          </div>
        </div>

        {/* Hint with improved styling */}
        <div className={`flex items-center justify-between mt-3 text-[8px] font-cinzel tracking-wide ${
          isLight ? 'text-amber-600/50' : 'text-amber-500/40'
        }`}>
          <span className="flex items-center gap-2">
            <span className={`px-1.5 py-0.5 rounded ${isLight ? 'bg-amber-100/50' : 'bg-amber-900/20'}`}>Enter</span>
            <span>wyslij</span>
            <span className="opacity-50">|</span>
            <span className={`px-1.5 py-0.5 rounded ${isLight ? 'bg-amber-100/50' : 'bg-amber-900/20'}`}>Shift+Enter</span>
            <span>nowa linia</span>
          </span>
          <span className={`px-2 py-1 rounded-full ${
            isLight ? 'bg-amber-100/50 text-amber-700' : 'bg-amber-900/30 text-amber-400'
          }`}>
            {activeTab.provider.toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  );
};

export default MultiTabChat;
