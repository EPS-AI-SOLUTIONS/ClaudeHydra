import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import {
  Pause,
  Square,
  ChevronDown,
  ChevronUp,
  Activity,
  Zap,
  Clock,
  Hash,
  CheckCircle2,
  XCircle,
  Loader2,
  Radio,
  Layers,
  MoreVertical,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export type StreamStatus = 'idle' | 'streaming' | 'completed' | 'error' | 'paused';

export type PanelStatus = 'idle' | 'streaming' | 'completed' | 'partial';

export interface StreamSource {
  id: string;
  name: string;
  provider: 'claude' | 'gemini' | 'grok' | 'codex' | 'jules' | 'ollama' | 'custom';
  status: StreamStatus;
  progress: number; // 0-100
  tokensReceived: number;
  tokensTotal?: number;
  elapsedMs: number;
  startedAt?: number;
  error?: string;
  isCollapsed: boolean;
}

export interface StreamPanelProps {
  streams: StreamSource[];
  onStopStream: (id: string) => void;
  onStopAll: () => void;
  onToggleCollapse: (id: string) => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  compact?: boolean;
}

// ============================================================================
// PROVIDER COLORS
// ============================================================================

const PROVIDER_COLORS: Record<StreamSource['provider'], { bg: string; text: string; border: string; icon: string }> = {
  claude: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', icon: 'text-orange-500' },
  gemini: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', icon: 'text-blue-500' },
  grok: { bg: 'bg-slate-500/20', text: 'text-slate-400', border: 'border-slate-500/30', icon: 'text-slate-500' },
  codex: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', icon: 'text-green-500' },
  jules: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30', icon: 'text-purple-500' },
  ollama: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30', icon: 'text-cyan-500' },
  custom: { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30', icon: 'text-gray-500' },
};

const PROVIDER_COLORS_LIGHT: Record<StreamSource['provider'], { bg: string; text: string; border: string; icon: string }> = {
  claude: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300', icon: 'text-orange-600' },
  gemini: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300', icon: 'text-blue-600' },
  grok: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300', icon: 'text-slate-600' },
  codex: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300', icon: 'text-green-600' },
  jules: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300', icon: 'text-purple-600' },
  ollama: { bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-300', icon: 'text-cyan-600' },
  custom: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300', icon: 'text-gray-600' },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const formatTime = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
};

const formatTokens = (tokens: number): string => {
  if (tokens < 1000) return tokens.toString();
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1000000).toFixed(2)}M`;
};

// ============================================================================
// SINGLE STREAM ITEM COMPONENT
// ============================================================================

interface StreamItemProps {
  stream: StreamSource;
  onStop: () => void;
  onToggleCollapse: () => void;
  isLight: boolean;
}

const StreamItem: React.FC<StreamItemProps> = ({ stream, onStop, onToggleCollapse, isLight }) => {
  const colors = isLight ? PROVIDER_COLORS_LIGHT[stream.provider] : PROVIDER_COLORS[stream.provider];

  const getStatusIcon = () => {
    switch (stream.status) {
      case 'streaming':
        return <Loader2 size={14} className="animate-spin text-amber-400" />;
      case 'completed':
        return <CheckCircle2 size={14} className="text-emerald-500" />;
      case 'error':
        return <XCircle size={14} className="text-red-500" />;
      case 'paused':
        return <Pause size={14} className={isLight ? 'text-gray-500' : 'text-gray-400'} />;
      default:
        return <Radio size={14} className={isLight ? 'text-gray-400' : 'text-gray-500'} />;
    }
  };

  const getStatusLabel = () => {
    switch (stream.status) {
      case 'streaming':
        return 'Streaming...';
      case 'completed':
        return 'Completed';
      case 'error':
        return 'Error';
      case 'paused':
        return 'Paused';
      default:
        return 'Idle';
    }
  };

  const progressPercent = stream.tokensTotal
    ? Math.min((stream.tokensReceived / stream.tokensTotal) * 100, 100)
    : stream.progress;

  return (
    <div
      className={`rounded-lg border transition-all duration-300 overflow-hidden ${
        isLight
          ? `bg-white/80 border-gray-200 ${stream.status === 'streaming' ? 'shadow-md' : ''}`
          : `bg-gray-900/60 border-gray-800 ${stream.status === 'streaming' ? 'shadow-lg shadow-black/20' : ''}`
      }`}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between p-3 cursor-pointer transition-colors ${
          isLight ? 'hover:bg-gray-50' : 'hover:bg-gray-800/50'
        }`}
        onClick={onToggleCollapse}
      >
        <div className="flex items-center gap-3">
          {/* Provider badge */}
          <div className={`px-2 py-1 rounded text-[10px] font-mono font-semibold uppercase ${colors.bg} ${colors.text} ${colors.border} border`}>
            {stream.provider}
          </div>

          {/* Stream name */}
          <span className={`text-sm font-medium ${isLight ? 'text-gray-800' : 'text-gray-200'}`}>
            {stream.name}
          </span>

          {/* Status icon */}
          {getStatusIcon()}
        </div>

        <div className="flex items-center gap-2">
          {/* Quick stats */}
          {!stream.isCollapsed && stream.status === 'streaming' && (
            <div className="flex items-center gap-3 mr-2">
              <div className="flex items-center gap-1">
                <Hash size={10} className={isLight ? 'text-gray-400' : 'text-gray-500'} />
                <span className={`text-[10px] font-mono ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>
                  {formatTokens(stream.tokensReceived)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Clock size={10} className={isLight ? 'text-gray-400' : 'text-gray-500'} />
                <span className={`text-[10px] font-mono ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>
                  {formatTime(stream.elapsedMs)}
                </span>
              </div>
            </div>
          )}

          {/* Stop button */}
          {stream.status === 'streaming' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStop();
              }}
              className={`p-1.5 rounded transition-colors ${
                isLight
                  ? 'hover:bg-red-100 text-red-600'
                  : 'hover:bg-red-900/30 text-red-400'
              }`}
              title="Stop stream"
            >
              <Square size={14} />
            </button>
          )}

          {/* Collapse toggle */}
          <button
            className={`p-1 rounded transition-colors ${
              isLight
                ? 'hover:bg-gray-100 text-gray-500'
                : 'hover:bg-gray-700 text-gray-400'
            }`}
          >
            {stream.isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {!stream.isCollapsed && (
        <div
          className={`px-3 pb-3 animate-in slide-in-from-top-2 duration-200 ${
            isLight ? 'border-t border-gray-100' : 'border-t border-gray-800'
          }`}
        >
          {/* Progress bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className={`text-[10px] font-mono ${isLight ? 'text-gray-500' : 'text-gray-500'}`}>
                {getStatusLabel()}
              </span>
              <span className={`text-[10px] font-mono font-semibold ${
                stream.status === 'completed'
                  ? 'text-emerald-500'
                  : stream.status === 'error'
                    ? 'text-red-500'
                    : isLight ? 'text-gray-700' : 'text-gray-300'
              }`}>
                {Math.round(progressPercent)}%
              </span>
            </div>

            <div className={`relative h-2 rounded-full overflow-hidden ${
              isLight ? 'bg-gray-200' : 'bg-gray-800'
            }`}>
              {/* Animated background for streaming */}
              {stream.status === 'streaming' && (
                <div
                  className="absolute inset-0 opacity-30"
                  style={{
                    backgroundImage: `repeating-linear-gradient(
                      90deg,
                      transparent,
                      transparent 8px,
                      rgba(255, 255, 255, 0.1) 8px,
                      rgba(255, 255, 255, 0.1) 16px
                    )`,
                    animation: 'slide 0.5s linear infinite',
                  }}
                />
              )}

              {/* Progress fill */}
              <div
                className={`absolute h-full transition-all duration-300 ${
                  stream.status === 'completed'
                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                    : stream.status === 'error'
                      ? 'bg-gradient-to-r from-red-500 to-red-400'
                      : `bg-gradient-to-r ${
                          stream.provider === 'claude' ? 'from-orange-500 to-orange-400' :
                          stream.provider === 'gemini' ? 'from-blue-500 to-blue-400' :
                          stream.provider === 'grok' ? 'from-slate-500 to-slate-400' :
                          stream.provider === 'codex' ? 'from-green-500 to-green-400' :
                          stream.provider === 'jules' ? 'from-purple-500 to-purple-400' :
                          stream.provider === 'ollama' ? 'from-cyan-500 to-cyan-400' :
                          'from-gray-500 to-gray-400'
                        }`
                }`}
                style={{
                  width: `${progressPercent}%`,
                  boxShadow: stream.status === 'streaming'
                    ? '0 0 10px rgba(251, 191, 36, 0.4)'
                    : undefined,
                }}
              />
            </div>
          </div>

          {/* Stats row */}
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-4">
              {/* Tokens */}
              <div className="flex items-center gap-1.5">
                <Zap size={12} className={colors.icon} />
                <div className="flex flex-col">
                  <span className={`text-[10px] ${isLight ? 'text-gray-400' : 'text-gray-500'}`}>
                    Tokens
                  </span>
                  <span className={`text-xs font-mono font-semibold ${isLight ? 'text-gray-700' : 'text-gray-300'}`}>
                    {formatTokens(stream.tokensReceived)}
                    {stream.tokensTotal && (
                      <span className={isLight ? 'text-gray-400' : 'text-gray-500'}>
                        /{formatTokens(stream.tokensTotal)}
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {/* Time elapsed */}
              <div className="flex items-center gap-1.5">
                <Clock size={12} className={colors.icon} />
                <div className="flex flex-col">
                  <span className={`text-[10px] ${isLight ? 'text-gray-400' : 'text-gray-500'}`}>
                    Elapsed
                  </span>
                  <span className={`text-xs font-mono font-semibold ${isLight ? 'text-gray-700' : 'text-gray-300'}`}>
                    {formatTime(stream.elapsedMs)}
                  </span>
                </div>
              </div>

              {/* Tokens per second */}
              {stream.elapsedMs > 0 && stream.tokensReceived > 0 && (
                <div className="flex items-center gap-1.5">
                  <Activity size={12} className={colors.icon} />
                  <div className="flex flex-col">
                    <span className={`text-[10px] ${isLight ? 'text-gray-400' : 'text-gray-500'}`}>
                      Speed
                    </span>
                    <span className={`text-xs font-mono font-semibold ${isLight ? 'text-gray-700' : 'text-gray-300'}`}>
                      {((stream.tokensReceived / stream.elapsedMs) * 1000).toFixed(1)} t/s
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Error message */}
          {stream.status === 'error' && stream.error && (
            <div className={`mt-3 p-2 rounded text-xs ${
              isLight
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-red-900/20 text-red-400 border border-red-800/30'
            }`}>
              {stream.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// MAIN STREAM PANEL COMPONENT
// ============================================================================

const StreamPanel: React.FC<StreamPanelProps> = ({
  streams,
  onStopStream,
  onStopAll,
  onToggleCollapse,
  onCollapseAll,
  onExpandAll,
  compact = false,
}) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Calculate panel status
  const getPanelStatus = useCallback((): PanelStatus => {
    if (streams.length === 0) return 'idle';

    const statuses = streams.map(s => s.status);
    const hasStreaming = statuses.includes('streaming');
    const allCompleted = statuses.every(s => s === 'completed' || s === 'error');
    const someCompleted = statuses.some(s => s === 'completed' || s === 'error');

    if (hasStreaming && someCompleted) return 'partial';
    if (hasStreaming) return 'streaming';
    if (allCompleted) return 'completed';
    return 'idle';
  }, [streams]);

  const panelStatus = getPanelStatus();

  // Stats
  const activeCount = streams.filter(s => s.status === 'streaming').length;
  const completedCount = streams.filter(s => s.status === 'completed').length;
  const errorCount = streams.filter(s => s.status === 'error').length;
  const totalTokens = streams.reduce((sum, s) => sum + s.tokensReceived, 0);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Idle state
  if (panelStatus === 'idle' && streams.length === 0) {
    return (
      <div className={`rounded-lg border p-6 text-center ${
        isLight
          ? 'bg-gray-50/80 border-gray-200'
          : 'bg-gray-900/40 border-gray-800'
      }`}>
        <Radio size={32} className={`mx-auto mb-3 ${isLight ? 'text-gray-300' : 'text-gray-600'}`} />
        <p className={`text-sm ${isLight ? 'text-gray-500' : 'text-gray-500'}`}>
          No active streams
        </p>
        <p className={`text-[10px] mt-1 ${isLight ? 'text-gray-400' : 'text-gray-600'}`}>
          Streams will appear here when you start a query
        </p>
      </div>
    );
  }

  // Compact mode
  if (compact) {
    return (
      <div className={`rounded-lg border p-3 ${
        isLight
          ? 'bg-white/80 border-gray-200'
          : 'bg-gray-900/60 border-gray-800'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers size={14} className={isLight ? 'text-gray-600' : 'text-gray-400'} />
            <span className={`text-xs font-mono font-semibold ${isLight ? 'text-gray-700' : 'text-gray-300'}`}>
              STREAMS
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Active indicator */}
            {activeCount > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-[10px] font-mono text-amber-500">
                  {activeCount} active
                </span>
              </div>
            )}

            {/* Completed */}
            {completedCount > 0 && (
              <div className="flex items-center gap-1">
                <CheckCircle2 size={10} className="text-emerald-500" />
                <span className="text-[10px] font-mono text-emerald-500">
                  {completedCount}
                </span>
              </div>
            )}

            {/* Errors */}
            {errorCount > 0 && (
              <div className="flex items-center gap-1">
                <XCircle size={10} className="text-red-500" />
                <span className="text-[10px] font-mono text-red-500">
                  {errorCount}
                </span>
              </div>
            )}

            {/* Total tokens */}
            <div className="flex items-center gap-1">
              <Zap size={10} className={isLight ? 'text-gray-400' : 'text-gray-500'} />
              <span className={`text-[10px] font-mono ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>
                {formatTokens(totalTokens)}
              </span>
            </div>
          </div>
        </div>

        {/* Mini progress bars */}
        <div className="flex gap-1 mt-2">
          {streams.map((stream) => (
            <div
              key={stream.id}
              className={`flex-1 h-1.5 rounded-full overflow-hidden ${
                isLight ? 'bg-gray-200' : 'bg-gray-800'
              }`}
              title={`${stream.name}: ${Math.round(stream.progress)}%`}
            >
              <div
                className={`h-full transition-all duration-300 ${
                  stream.status === 'completed'
                    ? 'bg-emerald-500'
                    : stream.status === 'error'
                      ? 'bg-red-500'
                      : stream.status === 'streaming'
                        ? 'bg-amber-500'
                        : isLight ? 'bg-gray-300' : 'bg-gray-700'
                }`}
                style={{ width: `${stream.progress}%` }}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Full mode
  return (
    <div className={`rounded-lg border overflow-hidden ${
      isLight
        ? 'bg-white/90 border-gray-200'
        : 'bg-gray-900/80 border-gray-800'
    }`}>
      {/* Header */}
      <div className={`flex items-center justify-between p-3 ${
        isLight ? 'bg-gray-50 border-b border-gray-200' : 'bg-gray-900/50 border-b border-gray-800'
      }`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Activity
              size={16}
              className={
                panelStatus === 'streaming'
                  ? 'text-amber-500 animate-pulse'
                  : panelStatus === 'completed'
                    ? 'text-emerald-500'
                    : panelStatus === 'partial'
                      ? 'text-blue-500'
                      : isLight ? 'text-gray-400' : 'text-gray-500'
              }
            />
            <span className={`text-xs font-mono font-semibold tracking-wider ${
              isLight ? 'text-gray-700' : 'text-gray-300'
            }`}>
              STREAM PANEL
            </span>
          </div>

          {/* Status badge */}
          <div className={`px-2 py-0.5 rounded text-[9px] font-mono uppercase ${
            panelStatus === 'streaming'
              ? isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-500/20 text-amber-400'
              : panelStatus === 'completed'
                ? isLight ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-500/20 text-emerald-400'
                : panelStatus === 'partial'
                  ? isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-400'
                  : isLight ? 'bg-gray-100 text-gray-600' : 'bg-gray-800 text-gray-500'
          }`}>
            {panelStatus}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Stats summary */}
          <div className="flex items-center gap-3 mr-2">
            <div className="flex items-center gap-1">
              <span className={`text-[10px] font-mono ${isLight ? 'text-gray-500' : 'text-gray-500'}`}>
                Active:
              </span>
              <span className={`text-[10px] font-mono font-semibold ${
                activeCount > 0
                  ? 'text-amber-500'
                  : isLight ? 'text-gray-600' : 'text-gray-400'
              }`}>
                {activeCount}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className={`text-[10px] font-mono ${isLight ? 'text-gray-500' : 'text-gray-500'}`}>
                Total:
              </span>
              <span className={`text-[10px] font-mono font-semibold ${isLight ? 'text-gray-700' : 'text-gray-300'}`}>
                {streams.length}
              </span>
            </div>
          </div>

          {/* Stop all button */}
          {activeCount > 0 && (
            <button
              onClick={onStopAll}
              className={`px-2 py-1 rounded text-[10px] font-mono font-semibold transition-colors flex items-center gap-1 ${
                isLight
                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                  : 'bg-red-900/30 text-red-400 hover:bg-red-900/50'
              }`}
            >
              <Square size={10} />
              STOP ALL
            </button>
          )}

          {/* Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className={`p-1.5 rounded transition-colors ${
                isLight
                  ? 'hover:bg-gray-200 text-gray-500'
                  : 'hover:bg-gray-700 text-gray-400'
              }`}
            >
              <MoreVertical size={14} />
            </button>

            {showMenu && (
              <div className={`absolute right-0 top-full mt-1 py-1 rounded-lg border shadow-lg z-10 min-w-[140px] animate-in fade-in slide-in-from-top-2 duration-150 ${
                isLight
                  ? 'bg-white border-gray-200'
                  : 'bg-gray-900 border-gray-700'
              }`}>
                <button
                  onClick={() => {
                    onCollapseAll();
                    setShowMenu(false);
                  }}
                  className={`w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 ${
                    isLight
                      ? 'hover:bg-gray-100 text-gray-700'
                      : 'hover:bg-gray-800 text-gray-300'
                  }`}
                >
                  <ChevronUp size={12} />
                  Collapse All
                </button>
                <button
                  onClick={() => {
                    onExpandAll();
                    setShowMenu(false);
                  }}
                  className={`w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 ${
                    isLight
                      ? 'hover:bg-gray-100 text-gray-700'
                      : 'hover:bg-gray-800 text-gray-300'
                  }`}
                >
                  <ChevronDown size={12} />
                  Expand All
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stream list */}
      <div className="p-3 space-y-2 max-h-[400px] overflow-y-auto">
        {streams.map((stream) => (
          <StreamItem
            key={stream.id}
            stream={stream}
            onStop={() => onStopStream(stream.id)}
            onToggleCollapse={() => onToggleCollapse(stream.id)}
            isLight={isLight}
          />
        ))}
      </div>

      {/* Footer stats */}
      <div className={`px-3 py-2 ${
        isLight ? 'bg-gray-50 border-t border-gray-200' : 'bg-gray-900/50 border-t border-gray-800'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Zap size={12} className={isLight ? 'text-gray-400' : 'text-gray-500'} />
              <span className={`text-[10px] font-mono ${isLight ? 'text-gray-500' : 'text-gray-500'}`}>
                Total tokens:
              </span>
              <span className={`text-[10px] font-mono font-semibold ${isLight ? 'text-gray-700' : 'text-gray-300'}`}>
                {formatTokens(totalTokens)}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <CheckCircle2 size={12} className="text-emerald-500" />
              <span className={`text-[10px] font-mono ${isLight ? 'text-gray-500' : 'text-gray-500'}`}>
                Completed:
              </span>
              <span className={`text-[10px] font-mono font-semibold text-emerald-500`}>
                {completedCount}/{streams.length}
              </span>
            </div>

            {errorCount > 0 && (
              <div className="flex items-center gap-1">
                <XCircle size={12} className="text-red-500" />
                <span className={`text-[10px] font-mono ${isLight ? 'text-gray-500' : 'text-gray-500'}`}>
                  Errors:
                </span>
                <span className={`text-[10px] font-mono font-semibold text-red-500`}>
                  {errorCount}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StreamPanel;
export { PROVIDER_COLORS, PROVIDER_COLORS_LIGHT, formatTime, formatTokens };
