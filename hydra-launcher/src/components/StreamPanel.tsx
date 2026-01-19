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
  MoreVertical,
  Play,
  Sparkles,
  TrendingUp,
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
  // For mini throughput chart
  throughputHistory?: number[];
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
// PROVIDER COLORS WITH GRADIENTS
// ============================================================================

const PROVIDER_COLORS: Record<StreamSource['provider'], {
  bg: string;
  text: string;
  border: string;
  icon: string;
  gradient: string;
  glow: string;
}> = {
  claude: {
    bg: 'bg-orange-500/20',
    text: 'text-orange-400',
    border: 'border-orange-500/30',
    icon: 'text-orange-500',
    gradient: 'from-orange-500 via-amber-400 to-orange-500',
    glow: 'shadow-orange-500/50',
  },
  gemini: {
    bg: 'bg-blue-500/20',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
    icon: 'text-blue-500',
    gradient: 'from-blue-500 via-cyan-400 to-blue-500',
    glow: 'shadow-blue-500/50',
  },
  grok: {
    bg: 'bg-slate-500/20',
    text: 'text-slate-400',
    border: 'border-slate-500/30',
    icon: 'text-slate-500',
    gradient: 'from-slate-500 via-gray-400 to-slate-500',
    glow: 'shadow-slate-500/50',
  },
  codex: {
    bg: 'bg-green-500/20',
    text: 'text-green-400',
    border: 'border-green-500/30',
    icon: 'text-green-500',
    gradient: 'from-green-500 via-emerald-400 to-green-500',
    glow: 'shadow-green-500/50',
  },
  jules: {
    bg: 'bg-purple-500/20',
    text: 'text-purple-400',
    border: 'border-purple-500/30',
    icon: 'text-purple-500',
    gradient: 'from-purple-500 via-violet-400 to-purple-500',
    glow: 'shadow-purple-500/50',
  },
  ollama: {
    bg: 'bg-cyan-500/20',
    text: 'text-cyan-400',
    border: 'border-cyan-500/30',
    icon: 'text-cyan-500',
    gradient: 'from-cyan-500 via-teal-400 to-cyan-500',
    glow: 'shadow-cyan-500/50',
  },
  custom: {
    bg: 'bg-gray-500/20',
    text: 'text-gray-400',
    border: 'border-gray-500/30',
    icon: 'text-gray-500',
    gradient: 'from-gray-500 via-gray-400 to-gray-500',
    glow: 'shadow-gray-500/50',
  },
};

const PROVIDER_COLORS_LIGHT: Record<StreamSource['provider'], {
  bg: string;
  text: string;
  border: string;
  icon: string;
  gradient: string;
  glow: string;
}> = {
  claude: {
    bg: 'bg-orange-100',
    text: 'text-orange-700',
    border: 'border-orange-300',
    icon: 'text-orange-600',
    gradient: 'from-orange-500 via-amber-400 to-orange-500',
    glow: 'shadow-orange-400/40',
  },
  gemini: {
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    border: 'border-blue-300',
    icon: 'text-blue-600',
    gradient: 'from-blue-500 via-cyan-400 to-blue-500',
    glow: 'shadow-blue-400/40',
  },
  grok: {
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-300',
    icon: 'text-slate-600',
    gradient: 'from-slate-500 via-gray-400 to-slate-500',
    glow: 'shadow-slate-400/40',
  },
  codex: {
    bg: 'bg-green-100',
    text: 'text-green-700',
    border: 'border-green-300',
    icon: 'text-green-600',
    gradient: 'from-green-500 via-emerald-400 to-green-500',
    glow: 'shadow-green-400/40',
  },
  jules: {
    bg: 'bg-purple-100',
    text: 'text-purple-700',
    border: 'border-purple-300',
    icon: 'text-purple-600',
    gradient: 'from-purple-500 via-violet-400 to-purple-500',
    glow: 'shadow-purple-400/40',
  },
  ollama: {
    bg: 'bg-cyan-100',
    text: 'text-cyan-700',
    border: 'border-cyan-300',
    icon: 'text-cyan-600',
    gradient: 'from-cyan-500 via-teal-400 to-cyan-500',
    glow: 'shadow-cyan-400/40',
  },
  custom: {
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    border: 'border-gray-300',
    icon: 'text-gray-600',
    gradient: 'from-gray-500 via-gray-400 to-gray-500',
    glow: 'shadow-gray-400/40',
  },
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
// ANIMATED GRADIENT PROGRESS BAR
// ============================================================================

interface GradientProgressBarProps {
  progress: number;
  status: StreamStatus;
  provider: StreamSource['provider'];
  isLight: boolean;
}

const GradientProgressBar: React.FC<GradientProgressBarProps> = ({
  progress,
  status,
  provider,
  isLight,
}) => {
  const colors = isLight ? PROVIDER_COLORS_LIGHT[provider] : PROVIDER_COLORS[provider];
  const isComplete = progress >= 100 || status === 'completed';
  const isStreaming = status === 'streaming';
  const isError = status === 'error';

  return (
    <div className={`relative h-2.5 rounded-full overflow-hidden ${
      isLight ? 'bg-gray-200' : 'bg-gray-800'
    }`}>
      {/* Shimmer effect background for streaming */}
      {isStreaming && (
        <div
          className="absolute inset-0 opacity-40"
          style={{
            background: `linear-gradient(
              90deg,
              transparent 0%,
              rgba(255, 255, 255, 0.3) 50%,
              transparent 100%
            )`,
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s ease-in-out infinite',
          }}
        />
      )}

      {/* Animated stripes for streaming */}
      {isStreaming && (
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `repeating-linear-gradient(
              -45deg,
              transparent,
              transparent 6px,
              rgba(255, 255, 255, 0.15) 6px,
              rgba(255, 255, 255, 0.15) 12px
            )`,
            backgroundSize: '200% 100%',
            animation: 'stripe-move 1s linear infinite',
          }}
        />
      )}

      {/* Progress fill with gradient */}
      <div
        className={`absolute h-full transition-all duration-500 ease-out rounded-full ${
          isError
            ? 'bg-gradient-to-r from-red-600 via-red-500 to-red-400'
            : isComplete
              ? 'bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-400'
              : `bg-gradient-to-r ${colors.gradient}`
        }`}
        style={{
          width: `${progress}%`,
          boxShadow: isComplete
            ? '0 0 20px rgba(52, 211, 153, 0.6), 0 0 40px rgba(52, 211, 153, 0.3)'
            : isStreaming
              ? `0 0 15px rgba(251, 191, 36, 0.5)`
              : undefined,
        }}
      >
        {/* Glow pulse at the end for streaming */}
        {isStreaming && progress > 5 && (
          <div
            className="absolute right-0 top-0 bottom-0 w-8"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4))',
              animation: 'pulse-glow 1s ease-in-out infinite',
            }}
          />
        )}
      </div>

      {/* Completion glow effect */}
      {isComplete && (
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(52, 211, 153, 0.3), transparent)',
            animation: 'complete-shine 2s ease-in-out infinite',
          }}
        />
      )}
    </div>
  );
};

// ============================================================================
// MINI THROUGHPUT CHART
// ============================================================================

interface MiniThroughputChartProps {
  history: number[];
  isLight: boolean;
  provider: StreamSource['provider'];
}

const MiniThroughputChart: React.FC<MiniThroughputChartProps> = ({ history, isLight, provider }) => {
  const colors = isLight ? PROVIDER_COLORS_LIGHT[provider] : PROVIDER_COLORS[provider];
  const maxVal = Math.max(...history, 1);
  const normalized = history.map(v => (v / maxVal) * 100);

  return (
    <div className="flex items-end gap-[2px] h-4">
      {normalized.slice(-8).map((val, i) => (
        <div
          key={i}
          className={`w-1 rounded-t transition-all duration-300 ${
            i === normalized.length - 1
              ? `bg-gradient-to-t ${colors.gradient}`
              : isLight ? 'bg-gray-300' : 'bg-gray-600'
          }`}
          style={{
            height: `${Math.max(val, 10)}%`,
            opacity: 0.5 + (i / normalized.length) * 0.5,
          }}
        />
      ))}
    </div>
  );
};

// ============================================================================
// ANIMATED STATUS ICON
// ============================================================================

interface AnimatedStatusIconProps {
  status: StreamStatus;
  isLight: boolean;
  size?: number;
}

const AnimatedStatusIcon: React.FC<AnimatedStatusIconProps> = ({ status, isLight, size = 14 }) => {
  const baseClass = 'transition-all duration-300';

  switch (status) {
    case 'streaming':
      return (
        <div className="relative">
          <Loader2
            size={size}
            className={`${baseClass} text-amber-400 animate-spin`}
          />
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(251, 191, 36, 0.4) 0%, transparent 70%)',
              animation: 'pulse-soft 1.5s ease-in-out infinite',
            }}
          />
        </div>
      );
    case 'completed':
      return (
        <div className="relative">
          <CheckCircle2
            size={size}
            className={`${baseClass} text-emerald-500`}
            style={{
              animation: 'pop-in 0.3s ease-out',
              filter: 'drop-shadow(0 0 4px rgba(52, 211, 153, 0.5))',
            }}
          />
        </div>
      );
    case 'error':
      return (
        <div className="relative">
          <XCircle
            size={size}
            className={`${baseClass} text-red-500`}
            style={{
              animation: 'shake 0.5s ease-out',
              filter: 'drop-shadow(0 0 4px rgba(239, 68, 68, 0.5))',
            }}
          />
        </div>
      );
    case 'paused':
      return (
        <Pause
          size={size}
          className={`${baseClass} ${isLight ? 'text-gray-500' : 'text-gray-400'}`}
          style={{ animation: 'pulse-soft 2s ease-in-out infinite' }}
        />
      );
    default:
      return (
        <Radio
          size={size}
          className={`${baseClass} ${isLight ? 'text-gray-400' : 'text-gray-500'}`}
        />
      );
  }
};

// ============================================================================
// PROVIDER BADGE WITH ANIMATION
// ============================================================================

interface ProviderBadgeProps {
  provider: StreamSource['provider'];
  isLight: boolean;
  isActive?: boolean;
}

const ProviderBadge: React.FC<ProviderBadgeProps> = ({ provider, isLight, isActive }) => {
  const colors = isLight ? PROVIDER_COLORS_LIGHT[provider] : PROVIDER_COLORS[provider];

  return (
    <div
      className={`
        relative px-2.5 py-1 rounded text-[10px] font-mono font-bold uppercase
        transition-all duration-300 overflow-hidden
        ${colors.bg} ${colors.text}
        ${isActive ? `shadow-lg ${colors.glow}` : ''}
      `}
      style={{
        border: `1px solid`,
        borderImage: isActive
          ? `linear-gradient(90deg, ${
              provider === 'claude' ? '#f97316, #fbbf24' :
              provider === 'gemini' ? '#3b82f6, #06b6d4' :
              provider === 'codex' ? '#22c55e, #10b981' :
              provider === 'jules' ? '#a855f7, #8b5cf6' :
              provider === 'ollama' ? '#06b6d4, #14b8a6' :
              provider === 'grok' ? '#64748b, #94a3b8' :
              '#6b7280, #9ca3af'
            }) 1`
          : undefined,
        borderColor: isActive ? 'transparent' : undefined,
      }}
    >
      {/* Animated shine effect for active */}
      {isActive && (
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
            animation: 'badge-shine 2s ease-in-out infinite',
          }}
        />
      )}
      <span className="relative z-10">{provider}</span>
    </div>
  );
};

// ============================================================================
// STOP BUTTON WITH GLOW
// ============================================================================

interface StopButtonProps {
  onClick: () => void;
  isLight: boolean;
  size?: 'sm' | 'md';
}

const StopButton: React.FC<StopButtonProps> = ({ onClick, isLight, size = 'sm' }) => {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`
        relative group rounded transition-all duration-300
        ${size === 'sm' ? 'p-1.5' : 'px-3 py-1.5'}
        ${isLight
          ? 'hover:bg-red-100 text-red-600'
          : 'hover:bg-red-900/30 text-red-400'
        }
      `}
      title="Stop stream"
    >
      {/* Hover glow effect */}
      <div
        className={`
          absolute inset-0 rounded opacity-0 group-hover:opacity-100
          transition-opacity duration-300
          ${isLight ? 'bg-red-200/50' : 'bg-red-500/20'}
        `}
        style={{
          boxShadow: isLight
            ? '0 0 20px rgba(239, 68, 68, 0.3)'
            : '0 0 20px rgba(239, 68, 68, 0.4)',
        }}
      />
      <div className="relative flex items-center gap-1.5">
        <Square size={size === 'sm' ? 14 : 12} className="transition-transform group-hover:scale-110" />
        {size === 'md' && <span className="text-[10px] font-mono font-semibold">STOP ALL</span>}
      </div>
    </button>
  );
};

// ============================================================================
// SINGLE STREAM ITEM COMPONENT
// ============================================================================

interface StreamItemProps {
  stream: StreamSource;
  onStop: () => void;
  onToggleCollapse: () => void;
  isLight: boolean;
  isNew?: boolean;
}

const StreamItem: React.FC<StreamItemProps> = ({ stream, onStop, onToggleCollapse, isLight, isNew }) => {
  const colors = isLight ? PROVIDER_COLORS_LIGHT[stream.provider] : PROVIDER_COLORS[stream.provider];

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

  const tokensPerSecond = stream.elapsedMs > 0
    ? (stream.tokensReceived / stream.elapsedMs) * 1000
    : 0;

  // Generate mock throughput history if not provided
  const throughputHistory = stream.throughputHistory || Array.from({ length: 8 }, () =>
    Math.random() * tokensPerSecond * 1.2
  );

  return (
    <div
      className={`
        relative rounded-xl overflow-hidden transition-all duration-500
        ${isNew ? 'animate-slide-in-up' : ''}
        ${isLight
          ? `bg-white/90 ${stream.status === 'streaming' ? 'shadow-lg' : 'shadow-md'}`
          : `bg-gray-900/70 ${stream.status === 'streaming' ? 'shadow-xl shadow-black/30' : ''}`
        }
      `}
      style={{
        // Gradient border effect
        border: '1px solid transparent',
        backgroundImage: stream.status === 'streaming'
          ? `linear-gradient(${isLight ? 'white' : '#111827'}, ${isLight ? 'white' : '#111827'}), linear-gradient(135deg, ${
              stream.provider === 'claude' ? '#f97316, #fbbf24, #f97316' :
              stream.provider === 'gemini' ? '#3b82f6, #06b6d4, #3b82f6' :
              stream.provider === 'codex' ? '#22c55e, #10b981, #22c55e' :
              stream.provider === 'jules' ? '#a855f7, #8b5cf6, #a855f7' :
              stream.provider === 'ollama' ? '#06b6d4, #14b8a6, #06b6d4' :
              stream.provider === 'grok' ? '#64748b, #94a3b8, #64748b' :
              '#6b7280, #9ca3af, #6b7280'
            })`
          : undefined,
        backgroundOrigin: 'border-box',
        backgroundClip: 'padding-box, border-box',
        borderColor: stream.status !== 'streaming'
          ? (isLight ? 'rgb(229 231 235)' : 'rgb(31 41 55)')
          : undefined,
      }}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between p-3 cursor-pointer transition-colors ${
          isLight ? 'hover:bg-gray-50/80' : 'hover:bg-gray-800/50'
        }`}
        onClick={onToggleCollapse}
      >
        <div className="flex items-center gap-3">
          {/* Provider badge */}
          <ProviderBadge
            provider={stream.provider}
            isLight={isLight}
            isActive={stream.status === 'streaming'}
          />

          {/* Stream name */}
          <span className={`text-sm font-medium ${isLight ? 'text-gray-800' : 'text-gray-200'}`}>
            {stream.name}
          </span>

          {/* Status icon */}
          <AnimatedStatusIcon status={stream.status} isLight={isLight} />
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
            <StopButton onClick={onStop} isLight={isLight} />
          )}

          {/* Collapse toggle */}
          <button
            className={`p-1 rounded transition-all duration-300 ${
              isLight
                ? 'hover:bg-gray-100 text-gray-500'
                : 'hover:bg-gray-700 text-gray-400'
            }`}
          >
            <div className={`transition-transform duration-300 ${stream.isCollapsed ? '' : 'rotate-180'}`}>
              <ChevronDown size={16} />
            </div>
          </button>
        </div>
      </div>

      {/* Expanded content with smooth animation */}
      <div
        className={`overflow-hidden transition-all duration-500 ease-out ${
          stream.isCollapsed ? 'max-h-0 opacity-0' : 'max-h-96 opacity-100'
        }`}
      >
        <div
          className={`px-3 pb-3 ${
            isLight ? 'border-t border-gray-100' : 'border-t border-gray-800'
          }`}
        >
          {/* Progress bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className={`text-[10px] font-mono ${isLight ? 'text-gray-500' : 'text-gray-500'}`}>
                {getStatusLabel()}
              </span>
              <span className={`text-[10px] font-mono font-bold ${
                stream.status === 'completed'
                  ? 'text-emerald-500'
                  : stream.status === 'error'
                    ? 'text-red-500'
                    : isLight ? 'text-gray-700' : 'text-gray-300'
              }`}>
                {Math.round(progressPercent)}%
              </span>
            </div>

            <GradientProgressBar
              progress={progressPercent}
              status={stream.status}
              provider={stream.provider}
              isLight={isLight}
            />
          </div>

          {/* Stats row */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-5">
              {/* Tokens */}
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${colors.bg}`}>
                  <Zap size={12} className={colors.icon} />
                </div>
                <div className="flex flex-col">
                  <span className={`text-[9px] uppercase tracking-wider ${isLight ? 'text-gray-400' : 'text-gray-500'}`}>
                    Tokens
                  </span>
                  <span className={`text-xs font-mono font-bold ${isLight ? 'text-gray-700' : 'text-gray-300'}`}>
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
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${colors.bg}`}>
                  <Clock size={12} className={colors.icon} />
                </div>
                <div className="flex flex-col">
                  <span className={`text-[9px] uppercase tracking-wider ${isLight ? 'text-gray-400' : 'text-gray-500'}`}>
                    Elapsed
                  </span>
                  <span className={`text-xs font-mono font-bold ${isLight ? 'text-gray-700' : 'text-gray-300'}`}>
                    {formatTime(stream.elapsedMs)}
                  </span>
                </div>
              </div>

              {/* Tokens per second with mini chart */}
              {stream.elapsedMs > 0 && stream.tokensReceived > 0 && (
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${colors.bg}`}>
                    <TrendingUp size={12} className={colors.icon} />
                  </div>
                  <div className="flex flex-col">
                    <span className={`text-[9px] uppercase tracking-wider ${isLight ? 'text-gray-400' : 'text-gray-500'}`}>
                      Speed
                    </span>
                    <span className={`text-xs font-mono font-bold ${isLight ? 'text-gray-700' : 'text-gray-300'}`}>
                      {tokensPerSecond.toFixed(1)} t/s
                    </span>
                  </div>
                  {/* Mini throughput chart */}
                  <MiniThroughputChart
                    history={throughputHistory}
                    isLight={isLight}
                    provider={stream.provider}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Error message */}
          {stream.status === 'error' && stream.error && (
            <div
              className={`mt-3 p-3 rounded-lg text-xs ${
                isLight
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-red-900/20 text-red-400 border border-red-800/30'
              }`}
              style={{ animation: 'shake 0.5s ease-out' }}
            >
              <div className="flex items-center gap-2">
                <XCircle size={14} className="flex-shrink-0" />
                <span>{stream.error}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// ANIMATED EMPTY STATE
// ============================================================================

interface EmptyStateProps {
  isLight: boolean;
  onStartDemo?: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({ isLight, onStartDemo }) => {
  return (
    <div
      className={`
        relative rounded-xl border p-8 text-center overflow-hidden
        ${isLight
          ? 'bg-gradient-to-br from-gray-50 to-white border-gray-200'
          : 'bg-gradient-to-br from-gray-900/60 to-gray-900/40 border-gray-800'
        }
      `}
    >
      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className={`
              absolute w-2 h-2 rounded-full
              ${isLight ? 'bg-gray-300/50' : 'bg-gray-700/50'}
            `}
            style={{
              left: `${20 + i * 15}%`,
              top: `${30 + (i % 3) * 20}%`,
              animation: `float ${3 + i * 0.5}s ease-in-out infinite`,
              animationDelay: `${i * 0.3}s`,
            }}
          />
        ))}
      </div>

      {/* Animated icon */}
      <div className="relative mx-auto mb-4 w-16 h-16">
        <div
          className={`
            absolute inset-0 rounded-full
            ${isLight ? 'bg-gray-100' : 'bg-gray-800'}
          `}
          style={{
            animation: 'pulse-ring 2s ease-out infinite',
          }}
        />
        <div
          className={`
            relative flex items-center justify-center w-full h-full rounded-full
            ${isLight ? 'bg-gray-100' : 'bg-gray-800'}
          `}
        >
          <Radio
            size={28}
            className={`${isLight ? 'text-gray-400' : 'text-gray-600'}`}
            style={{ animation: 'pulse-soft 2s ease-in-out infinite' }}
          />
        </div>
      </div>

      {/* Gradient text */}
      <h3
        className={`
          text-lg font-bold mb-2 bg-clip-text text-transparent
          ${isLight
            ? 'bg-gradient-to-r from-gray-600 via-gray-800 to-gray-600'
            : 'bg-gradient-to-r from-gray-400 via-gray-200 to-gray-400'
          }
        `}
        style={{
          backgroundSize: '200% 100%',
          animation: 'gradient-shift 3s ease-in-out infinite',
        }}
      >
        No Active Streams
      </h3>
      <p className={`text-sm mb-6 ${isLight ? 'text-gray-500' : 'text-gray-500'}`}>
        Streams will appear here when you start a query
      </p>

      {/* CTA button with hover effect */}
      {onStartDemo && (
        <button
          onClick={onStartDemo}
          className={`
            group relative px-5 py-2.5 rounded-lg font-medium text-sm
            transition-all duration-300 overflow-hidden
            ${isLight
              ? 'bg-gray-900 text-white hover:bg-gray-800'
              : 'bg-white text-gray-900 hover:bg-gray-100'
            }
          `}
        >
          {/* Hover glow */}
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{
              background: isLight
                ? 'radial-gradient(circle at center, rgba(255,255,255,0.2) 0%, transparent 70%)'
                : 'radial-gradient(circle at center, rgba(0,0,0,0.2) 0%, transparent 70%)',
            }}
          />
          <span className="relative flex items-center gap-2">
            <Play size={14} />
            Start Demo Stream
          </span>
        </button>
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
  const [newStreamIds, setNewStreamIds] = useState<Set<string>>(new Set());
  const menuRef = useRef<HTMLDivElement>(null);
  const prevStreamsRef = useRef<string[]>([]);

  // Track new streams for animation
  useEffect(() => {
    const currentIds = streams.map(s => s.id);
    const prevIds = prevStreamsRef.current;
    const addedIds = currentIds.filter(id => !prevIds.includes(id));

    if (addedIds.length > 0) {
      setNewStreamIds(new Set(addedIds));
      // Clear new status after animation
      const timer = setTimeout(() => setNewStreamIds(new Set()), 600);
      return () => clearTimeout(timer);
    }

    prevStreamsRef.current = currentIds;
  }, [streams]);

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
    return <EmptyState isLight={isLight} />;
  }

  // Compact mode
  if (compact) {
    return (
      <div className={`rounded-xl border p-3 transition-all duration-300 ${
        isLight
          ? 'bg-white/90 border-gray-200 shadow-sm'
          : 'bg-gray-900/70 border-gray-800'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity
              size={14}
              className={`
                ${panelStatus === 'streaming' ? 'text-amber-500 animate-pulse' : ''}
                ${panelStatus === 'completed' ? 'text-emerald-500' : ''}
                ${panelStatus === 'partial' ? 'text-blue-500' : ''}
                ${panelStatus === 'idle' ? (isLight ? 'text-gray-400' : 'text-gray-500') : ''}
              `}
            />
            <span className={`text-xs font-mono font-semibold ${isLight ? 'text-gray-700' : 'text-gray-300'}`}>
              STREAMS
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Active indicator */}
            {activeCount > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="relative">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <div
                    className="absolute inset-0 w-2 h-2 rounded-full bg-amber-500"
                    style={{ animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite' }}
                  />
                </div>
                <span className="text-[10px] font-mono font-semibold text-amber-500">
                  {activeCount} active
                </span>
              </div>
            )}

            {/* Completed */}
            {completedCount > 0 && (
              <div className="flex items-center gap-1">
                <CheckCircle2 size={10} className="text-emerald-500" />
                <span className="text-[10px] font-mono font-semibold text-emerald-500">
                  {completedCount}
                </span>
              </div>
            )}

            {/* Errors */}
            {errorCount > 0 && (
              <div className="flex items-center gap-1">
                <XCircle size={10} className="text-red-500" />
                <span className="text-[10px] font-mono font-semibold text-red-500">
                  {errorCount}
                </span>
              </div>
            )}

            {/* Total tokens */}
            <div className="flex items-center gap-1">
              <Zap size={10} className={isLight ? 'text-gray-400' : 'text-gray-500'} />
              <span className={`text-[10px] font-mono font-semibold ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>
                {formatTokens(totalTokens)}
              </span>
            </div>
          </div>
        </div>

        {/* Mini progress bars with gradient */}
        <div className="flex gap-1 mt-2">
          {streams.map((stream) => {
            const colors = isLight ? PROVIDER_COLORS_LIGHT[stream.provider] : PROVIDER_COLORS[stream.provider];
            return (
              <div
                key={stream.id}
                className={`flex-1 h-1.5 rounded-full overflow-hidden ${
                  isLight ? 'bg-gray-200' : 'bg-gray-800'
                }`}
                title={`${stream.name}: ${Math.round(stream.progress)}%`}
              >
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    stream.status === 'completed'
                      ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                      : stream.status === 'error'
                        ? 'bg-gradient-to-r from-red-500 to-red-400'
                        : stream.status === 'streaming'
                          ? `bg-gradient-to-r ${colors.gradient}`
                          : isLight ? 'bg-gray-300' : 'bg-gray-700'
                  }`}
                  style={{
                    width: `${stream.progress}%`,
                    boxShadow: stream.status === 'streaming'
                      ? '0 0 8px rgba(251, 191, 36, 0.4)'
                      : undefined,
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Full mode
  return (
    <div className={`rounded-xl border overflow-hidden transition-all duration-300 ${
      isLight
        ? 'bg-white/95 border-gray-200 shadow-lg'
        : 'bg-gray-900/90 border-gray-800'
    }`}>
      {/* Header */}
      <div className={`flex items-center justify-between p-3 ${
        isLight ? 'bg-gray-50/80 border-b border-gray-200' : 'bg-gray-900/60 border-b border-gray-800'
      }`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Activity
                size={16}
                className={`
                  transition-all duration-300
                  ${panelStatus === 'streaming' ? 'text-amber-500' : ''}
                  ${panelStatus === 'completed' ? 'text-emerald-500' : ''}
                  ${panelStatus === 'partial' ? 'text-blue-500' : ''}
                  ${panelStatus === 'idle' ? (isLight ? 'text-gray-400' : 'text-gray-500') : ''}
                `}
              />
              {panelStatus === 'streaming' && (
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: 'radial-gradient(circle, rgba(251, 191, 36, 0.4) 0%, transparent 70%)',
                    animation: 'pulse-soft 1.5s ease-in-out infinite',
                  }}
                />
              )}
            </div>
            <span className={`text-xs font-mono font-bold tracking-wider ${
              isLight ? 'text-gray-700' : 'text-gray-300'
            }`}>
              STREAM PANEL
            </span>
          </div>

          {/* Status badge with gradient */}
          <div
            className={`
              px-2.5 py-1 rounded-lg text-[9px] font-mono font-bold uppercase
              transition-all duration-300
              ${panelStatus === 'streaming'
                ? isLight
                  ? 'bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700'
                  : 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-400'
                : panelStatus === 'completed'
                  ? isLight
                    ? 'bg-gradient-to-r from-emerald-100 to-green-100 text-emerald-700'
                    : 'bg-gradient-to-r from-emerald-500/20 to-green-500/20 text-emerald-400'
                  : panelStatus === 'partial'
                    ? isLight
                      ? 'bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700'
                      : 'bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-blue-400'
                    : isLight
                      ? 'bg-gray-100 text-gray-600'
                      : 'bg-gray-800 text-gray-500'
              }
            `}
          >
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
              <span className={`text-[10px] font-mono font-bold ${
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
              <span className={`text-[10px] font-mono font-bold ${isLight ? 'text-gray-700' : 'text-gray-300'}`}>
                {streams.length}
              </span>
            </div>
          </div>

          {/* Stop all button with animation */}
          {activeCount > 0 && (
            <StopButton onClick={onStopAll} isLight={isLight} size="md" />
          )}

          {/* Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className={`p-1.5 rounded-lg transition-all duration-300 ${
                isLight
                  ? 'hover:bg-gray-200 text-gray-500'
                  : 'hover:bg-gray-700 text-gray-400'
              } ${showMenu ? (isLight ? 'bg-gray-200' : 'bg-gray-700') : ''}`}
            >
              <MoreVertical size={14} />
            </button>

            {showMenu && (
              <div className={`
                absolute right-0 top-full mt-1 py-1 rounded-lg border shadow-xl z-10 min-w-[160px]
                animate-in fade-in slide-in-from-top-2 duration-200
                ${isLight
                  ? 'bg-white border-gray-200'
                  : 'bg-gray-900 border-gray-700'
                }
              `}>
                <button
                  onClick={() => {
                    onCollapseAll();
                    setShowMenu(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2 transition-colors ${
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
                  className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2 transition-colors ${
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
      <div className="p-3 space-y-3 max-h-[500px] overflow-y-auto">
        {streams.map((stream) => (
          <StreamItem
            key={stream.id}
            stream={stream}
            onStop={() => onStopStream(stream.id)}
            onToggleCollapse={() => onToggleCollapse(stream.id)}
            isLight={isLight}
            isNew={newStreamIds.has(stream.id)}
          />
        ))}
      </div>

      {/* Footer stats */}
      <div className={`px-3 py-2.5 ${
        isLight ? 'bg-gray-50/80 border-t border-gray-200' : 'bg-gray-900/60 border-t border-gray-800'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-1.5">
              <Sparkles size={12} className={isLight ? 'text-gray-400' : 'text-gray-500'} />
              <span className={`text-[10px] font-mono ${isLight ? 'text-gray-500' : 'text-gray-500'}`}>
                Total tokens:
              </span>
              <span className={`text-[10px] font-mono font-bold ${isLight ? 'text-gray-700' : 'text-gray-300'}`}>
                {formatTokens(totalTokens)}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={12} className="text-emerald-500" />
              <span className={`text-[10px] font-mono ${isLight ? 'text-gray-500' : 'text-gray-500'}`}>
                Completed:
              </span>
              <span className="text-[10px] font-mono font-bold text-emerald-500">
                {completedCount}/{streams.length}
              </span>
            </div>

            {errorCount > 0 && (
              <div className="flex items-center gap-1.5">
                <XCircle size={12} className="text-red-500" />
                <span className={`text-[10px] font-mono ${isLight ? 'text-gray-500' : 'text-gray-500'}`}>
                  Errors:
                </span>
                <span className="text-[10px] font-mono font-bold text-red-500">
                  {errorCount}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        @keyframes stripe-move {
          0% { background-position: 0 0; }
          100% { background-position: 24px 0; }
        }

        @keyframes pulse-glow {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }

        @keyframes complete-shine {
          0% { transform: translateX(-100%); }
          50%, 100% { transform: translateX(100%); }
        }

        @keyframes pop-in {
          0% { transform: scale(0.5); opacity: 0; }
          70% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-3px); }
          40%, 80% { transform: translateX(3px); }
        }

        @keyframes badge-shine {
          0% { transform: translateX(-100%); }
          50%, 100% { transform: translateX(100%); }
        }

        @keyframes slide-in-up {
          0% {
            opacity: 0;
            transform: translateY(10px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }

        @keyframes pulse-ring {
          0% {
            transform: scale(1);
            opacity: 0.3;
          }
          50% {
            transform: scale(1.2);
            opacity: 0;
          }
          100% {
            transform: scale(1);
            opacity: 0.3;
          }
        }

        @keyframes gradient-shift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }

        @keyframes ping {
          75%, 100% {
            transform: scale(2);
            opacity: 0;
          }
        }

        @keyframes pulse-soft {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }

        .animate-slide-in-up {
          animation: slide-in-up 0.5s ease-out;
        }
      `}</style>
    </div>
  );
};

export default StreamPanel;
export { PROVIDER_COLORS, PROVIDER_COLORS_LIGHT, formatTime, formatTokens };
