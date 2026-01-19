import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Send,
  Loader2,
  Check,
  X,
  Clock,
  Zap,
  BarChart3,
  Columns,
  Layers,
  Copy,
  ChevronUp,
  RefreshCw,
  GripVertical,
  ArrowLeftRight,
  CheckCircle2,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { PROVIDERS, getProvider, CLIProvider, ProviderConfig } from '../providers/index';

// ============================================================================
// TYPES
// ============================================================================

interface ProviderResponse {
  provider: CLIProvider;
  content: string;
  isLoading: boolean;
  error?: string;
  metrics: {
    startTime: number;
    endTime?: number;
    latencyMs?: number;
    tokensEstimate?: number;
  };
}

type ViewMode = 'columns' | 'tabs';

// ============================================================================
// ANIMATED CHECKBOX
// ============================================================================

interface AnimatedCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  isLight: boolean;
}

const AnimatedCheckbox: React.FC<AnimatedCheckboxProps> = ({
  checked,
  onChange,
  disabled,
  isLight,
}) => {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`
        relative w-5 h-5 rounded-md transition-all duration-300 ease-out
        flex items-center justify-center shrink-0
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${checked
          ? 'bg-gradient-to-br from-gray-600 via-gray-700 to-gray-800 shadow-[0_0_12px_rgba(100,100,100,0.4)]'
          : isLight
            ? 'bg-white border-2 border-gray-300 hover:border-gray-400'
            : 'bg-gray-900 border-2 border-gray-600 hover:border-gray-500'
        }
      `}
      style={{
        transform: checked ? 'scale(1.05)' : 'scale(1)',
      }}
    >
      {/* Animated checkmark */}
      <svg
        viewBox="0 0 24 24"
        className={`w-3 h-3 transition-all duration-300 ease-out ${
          checked ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
        }`}
        style={{
          strokeDasharray: 24,
          strokeDashoffset: checked ? 0 : 24,
          transition: 'stroke-dashoffset 0.3s ease-out, opacity 0.2s, transform 0.2s',
        }}
      >
        <path
          d="M5 12l5 5L19 7"
          fill="none"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
};

// ============================================================================
// PROVIDER CHECKBOX (with gradient and glow)
// ============================================================================

interface ProviderCheckboxProps {
  provider: ProviderConfig;
  checked: boolean;
  onChange: (checked: boolean) => void;
  isLight: boolean;
  disabled?: boolean;
}

const ProviderCheckbox: React.FC<ProviderCheckboxProps> = ({
  provider,
  checked,
  onChange,
  isLight,
  disabled,
}) => {
  return (
    <label
      className={`
        group relative flex items-center gap-3 p-3 rounded-xl border-2
        transition-all duration-300 ease-out cursor-pointer overflow-hidden
        ${checked
          ? isLight
            ? 'bg-gradient-to-br from-gray-50 via-white to-gray-100 border-gray-400 shadow-[0_0_20px_rgba(100,100,100,0.15)]'
            : 'bg-gradient-to-br from-gray-800 via-gray-850 to-gray-900 border-gray-500 shadow-[0_0_20px_rgba(150,150,150,0.1)]'
          : isLight
            ? 'bg-white/60 border-gray-200 hover:border-gray-300 hover:bg-white/80'
            : 'bg-black/30 border-gray-700 hover:border-gray-600 hover:bg-black/50'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
      style={{
        transform: checked ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'transform 0.3s ease-out, box-shadow 0.3s ease-out, border-color 0.3s ease-out, background 0.3s ease-out',
      }}
    >
      {/* Glow effect when selected */}
      {checked && (
        <div
          className={`
            absolute inset-0 rounded-xl opacity-30 pointer-events-none
            ${isLight
              ? 'bg-gradient-to-br from-gray-300/50 via-transparent to-gray-400/30'
              : 'bg-gradient-to-br from-gray-500/20 via-transparent to-gray-600/20'
            }
          `}
        />
      )}

      <AnimatedCheckbox
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        isLight={isLight}
      />

      <span className="text-xl transition-transform duration-300 group-hover:scale-110">
        {provider.icon}
      </span>

      <div className="flex-1 min-w-0">
        <div className={`text-xs font-mono font-bold truncate ${
          isLight ? 'text-gray-800' : 'text-gray-200'
        }`}>
          {provider.name}
        </div>
        <div className={`text-[9px] font-mono ${
          isLight ? 'text-gray-500' : 'text-gray-500'
        }`}>
          {provider.isAvailable ? (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Available
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Placeholder
            </span>
          )}
        </div>
      </div>

      <div className={`
        text-[8px] font-mono font-bold px-2 py-1 rounded-lg
        ${checked
          ? isLight
            ? 'bg-gray-200 text-gray-700'
            : 'bg-gray-700 text-gray-300'
          : isLight
            ? 'bg-gray-100 text-gray-500'
            : 'bg-gray-800 text-gray-500'
        }
      `}>
        {(provider.maxContextTokens / 1000).toFixed(0)}K
      </div>
    </label>
  );
};

// ============================================================================
// FLOATING LABEL INPUT
// ============================================================================

interface FloatingInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  disabled: boolean;
  isLight: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  maxChars?: number;
}

const FloatingInput: React.FC<FloatingInputProps> = ({
  value,
  onChange,
  onKeyDown,
  disabled,
  isLight,
  textareaRef,
  maxChars = 10000,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const hasValue = value.length > 0;
  const charPercent = Math.min((value.length / maxChars) * 100, 100);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [value, textareaRef]);

  return (
    <div className="relative flex-1">
      {/* Gradient border container */}
      <div
        className={`
          relative rounded-xl p-[2px] transition-all duration-300
          ${isFocused || hasValue
            ? 'bg-gradient-to-r from-gray-400 via-gray-500 to-gray-600'
            : isLight
              ? 'bg-gray-300'
              : 'bg-gray-700'
          }
        `}
        style={{
          boxShadow: isFocused
            ? isLight
              ? '0 0 20px rgba(100, 100, 100, 0.15)'
              : '0 0 20px rgba(150, 150, 150, 0.1)'
            : 'none',
        }}
      >
        <div
          className={`
            relative rounded-[10px] overflow-hidden
            ${isLight ? 'bg-white' : 'bg-gray-900'}
          `}
        >
          {/* Floating label */}
          <label
            className={`
              absolute left-4 font-mono transition-all duration-300 pointer-events-none z-10
              ${isFocused || hasValue
                ? 'top-2 text-[9px] tracking-wider uppercase'
                : 'top-4 text-sm'
              }
              ${isFocused
                ? isLight ? 'text-gray-600' : 'text-gray-400'
                : isLight ? 'text-gray-400' : 'text-gray-600'
              }
            `}
          >
            {isFocused || hasValue ? 'PROMPT' : 'Enter your prompt...'}
          </label>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={disabled}
            rows={3}
            className={`
              w-full p-4 pt-7 resize-none font-mono text-sm leading-relaxed
              bg-transparent outline-none transition-colors
              ${isLight ? 'text-gray-800' : 'text-gray-200'}
              ${disabled ? 'opacity-60' : ''}
            `}
          />

          {/* Character counter */}
          <div className="absolute bottom-2 right-3 flex items-center gap-2">
            {/* Animated progress bar */}
            <div className={`
              w-20 h-1.5 rounded-full overflow-hidden
              ${isLight ? 'bg-gray-200' : 'bg-gray-800'}
            `}>
              <div
                className={`
                  h-full rounded-full transition-all duration-500 ease-out
                  ${charPercent > 90
                    ? 'bg-gradient-to-r from-red-400 to-red-500'
                    : charPercent > 70
                      ? 'bg-gradient-to-r from-amber-400 to-amber-500'
                      : 'bg-gradient-to-r from-gray-400 to-gray-500'
                  }
                `}
                style={{ width: `${charPercent}%` }}
              />
            </div>

            {/* Counter text */}
            <span
              className={`
                text-[9px] font-mono font-bold tabular-nums transition-colors duration-300
                ${charPercent > 90
                  ? 'text-red-500'
                  : charPercent > 70
                    ? 'text-amber-500'
                    : isLight ? 'text-gray-400' : 'text-gray-600'
                }
              `}
            >
              {value.length.toLocaleString()}/{maxChars.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Keyboard hint */}
      <div className={`
        absolute -bottom-5 left-0 text-[9px] font-mono
        ${isLight ? 'text-gray-400' : 'text-gray-600'}
      `}>
        Press <kbd className={`px-1 py-0.5 rounded ${isLight ? 'bg-gray-100' : 'bg-gray-800'}`}>Ctrl</kbd>+<kbd className={`px-1 py-0.5 rounded ${isLight ? 'bg-gray-100' : 'bg-gray-800'}`}>Enter</kbd> to send
      </div>
    </div>
  );
};

// ============================================================================
// RESPONSE PANEL (with gradient header)
// ============================================================================

interface ResponsePanelProps {
  response: ProviderResponse;
  isLight: boolean;
  isActive: boolean;
  onClick?: () => void;
  expanded?: boolean;
  showDiff?: boolean;
  compareContent?: string;
}

const ResponsePanel: React.FC<ResponsePanelProps> = ({
  response,
  isLight,
  isActive,
  onClick,
  expanded = true,
  showDiff = false,
  compareContent,
}) => {
  const provider = PROVIDERS[response.provider];
  const [isExpanded, setIsExpanded] = useState(expanded);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(response.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [response.content]);

  // Simple diff highlighting
  const renderContent = () => {
    if (!showDiff || !compareContent || !response.content) {
      return response.content;
    }

    const words1 = response.content.split(/\s+/);
    const words2 = compareContent.split(/\s+/);
    const uniqueWords = words1.filter(w => !words2.includes(w));

    let content = response.content;
    uniqueWords.forEach(word => {
      if (word.length > 2) {
        content = content.replace(
          new RegExp(`\\b${word}\\b`, 'g'),
          `<mark class="bg-emerald-200 dark:bg-emerald-900/50 px-0.5 rounded">${word}</mark>`
        );
      }
    });

    return <span dangerouslySetInnerHTML={{ __html: content }} />;
  };

  return (
    <div
      className={`
        flex flex-col rounded-xl overflow-hidden transition-all duration-300
        ${isActive
          ? isLight
            ? 'shadow-[0_4px_20px_rgba(0,0,0,0.1)]'
            : 'shadow-[0_4px_20px_rgba(0,0,0,0.3)]'
          : ''
        }
        ${onClick ? 'cursor-pointer' : ''}
      `}
      onClick={onClick}
      style={{
        border: `2px solid ${isActive
          ? isLight ? '#9ca3af' : '#6b7280'
          : isLight ? '#e5e7eb' : '#374151'
        }`,
      }}
    >
      {/* Gradient Header */}
      <div
        className={`
          flex items-center justify-between p-3
          ${isLight
            ? 'bg-gradient-to-r from-gray-100 via-gray-50 to-gray-100'
            : 'bg-gradient-to-r from-gray-800 via-gray-750 to-gray-800'
          }
        `}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{provider.icon}</span>
          <span className={`text-sm font-mono font-bold ${
            isLight ? 'text-gray-800' : 'text-gray-200'
          }`}>
            {provider.name}
          </span>

          {/* Status indicators */}
          {response.isLoading && (
            <div className="flex items-center gap-1.5">
              <Loader2 size={14} className="animate-spin text-gray-500" />
              <span className="text-[10px] font-mono text-gray-500">Processing...</span>
            </div>
          )}
          {!response.isLoading && !response.error && response.content && (
            <div className="flex items-center gap-1">
              <CheckCircle2 size={14} className="text-emerald-500" />
              <span className="text-[10px] font-mono text-emerald-500">Complete</span>
            </div>
          )}
          {response.error && (
            <div className="flex items-center gap-1">
              <X size={14} className="text-red-500" />
              <span className="text-[10px] font-mono text-red-500">Error</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Metrics badges */}
          {response.metrics.latencyMs !== undefined && (
            <div className={`
              flex items-center gap-1.5 px-2 py-1 rounded-lg
              ${isLight ? 'bg-white/80' : 'bg-black/30'}
            `}>
              <Clock size={12} className={isLight ? 'text-gray-500' : 'text-gray-400'} />
              <span className={`text-[10px] font-mono font-bold ${
                isLight ? 'text-gray-600' : 'text-gray-400'
              }`}>
                {response.metrics.latencyMs}ms
              </span>
            </div>
          )}
          {response.metrics.tokensEstimate !== undefined && (
            <div className={`
              flex items-center gap-1.5 px-2 py-1 rounded-lg
              ${isLight ? 'bg-white/80' : 'bg-black/30'}
            `}>
              <Zap size={12} className={isLight ? 'text-gray-500' : 'text-gray-400'} />
              <span className={`text-[10px] font-mono font-bold ${
                isLight ? 'text-gray-600' : 'text-gray-400'
              }`}>
                ~{response.metrics.tokensEstimate}
              </span>
            </div>
          )}

          {/* Actions */}
          {response.content && (
            <button
              onClick={(e) => { e.stopPropagation(); handleCopy(); }}
              className={`
                p-1.5 rounded-lg transition-all duration-200
                ${copied
                  ? 'bg-emerald-500/20 text-emerald-500'
                  : isLight
                    ? 'hover:bg-gray-200 text-gray-600'
                    : 'hover:bg-gray-700 text-gray-400'
                }
              `}
              title={copied ? 'Copied!' : 'Copy response'}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          )}

          <button
            onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
            className={`
              p-1.5 rounded-lg transition-all duration-300
              ${isLight ? 'hover:bg-gray-200 text-gray-600' : 'hover:bg-gray-700 text-gray-400'}
            `}
            style={{
              transform: isExpanded ? 'rotate(0deg)' : 'rotate(180deg)',
            }}
          >
            <ChevronUp size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        className={`
          overflow-hidden transition-all duration-300 ease-out
          ${isLight ? 'bg-white/80' : 'bg-black/40'}
        `}
        style={{
          maxHeight: isExpanded ? '400px' : '0',
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <div className="p-4 overflow-auto max-h-[400px]">
          {response.isLoading && !response.content && (
            <div className="flex items-center justify-center py-8">
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  <Loader2 size={32} className="animate-spin text-gray-400" />
                  <div className="absolute inset-0 animate-ping">
                    <Loader2 size={32} className="text-gray-300 opacity-30" />
                  </div>
                </div>
                <span className={`text-xs font-mono ${
                  isLight ? 'text-gray-500' : 'text-gray-500'
                }`}>
                  Generating response...
                </span>
              </div>
            </div>
          )}

          {response.error && (
            <div className={`
              p-4 rounded-lg border-2
              ${isLight
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-red-900/20 border-red-800 text-red-400'
              }
            `}>
              <span className="text-xs font-mono">{response.error}</span>
            </div>
          )}

          {response.content && (
            <div className={`text-sm font-mono whitespace-pre-wrap leading-relaxed ${
              isLight ? 'text-gray-800' : 'text-gray-200'
            }`}>
              {renderContent()}
            </div>
          )}

          {!response.isLoading && !response.error && !response.content && (
            <div className={`text-xs font-mono text-center py-6 ${
              isLight ? 'text-gray-400' : 'text-gray-600'
            }`}>
              Waiting for response...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// ANIMATED BAR CHART
// ============================================================================

interface AnimatedBarChartProps {
  responses: ProviderResponse[];
  isLight: boolean;
}

const AnimatedBarChart: React.FC<AnimatedBarChartProps> = ({ responses, isLight }) => {
  const [isVisible, setIsVisible] = useState(false);
  const completedResponses = responses.filter(r => !r.isLoading && r.metrics.latencyMs);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  if (completedResponses.length === 0) return null;

  const maxLatency = Math.max(...completedResponses.map(r => r.metrics.latencyMs || 0));
  const fastestResponse = completedResponses.reduce((a, b) =>
    (a.metrics.latencyMs || Infinity) < (b.metrics.latencyMs || Infinity) ? a : b
  );

  return (
    <div className={`
      p-4 rounded-xl border-2
      ${isLight
        ? 'bg-gradient-to-br from-white to-gray-50 border-gray-200'
        : 'bg-gradient-to-br from-gray-900 to-gray-850 border-gray-700'
      }
    `}>
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={16} className={isLight ? 'text-gray-600' : 'text-gray-400'} />
        <span className={`text-[11px] font-mono font-bold tracking-wider uppercase ${
          isLight ? 'text-gray-600' : 'text-gray-400'
        }`}>
          Latency Comparison
        </span>
      </div>

      <div className="space-y-3">
        {completedResponses.map((response, index) => {
          const provider = PROVIDERS[response.provider];
          const latency = response.metrics.latencyMs || 0;
          const percent = (latency / maxLatency) * 100;
          const isFastest = response.provider === fastestResponse.provider;

          return (
            <div key={response.provider} className="group relative">
              {/* Label row */}
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{provider.icon}</span>
                  <span className={`text-xs font-mono font-bold ${
                    isLight ? 'text-gray-700' : 'text-gray-300'
                  }`}>
                    {provider.name}
                  </span>
                  {isFastest && (
                    <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-500">
                      FASTEST
                    </span>
                  )}
                </div>
                <span className={`text-xs font-mono font-bold ${
                  isLight ? 'text-gray-600' : 'text-gray-400'
                }`}>
                  {latency}ms
                </span>
              </div>

              {/* Bar */}
              <div className={`
                h-3 rounded-full overflow-hidden
                ${isLight ? 'bg-gray-200' : 'bg-gray-800'}
              `}>
                <div
                  className={`
                    h-full rounded-full transition-all duration-1000 ease-out
                    ${isFastest
                      ? 'bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600'
                      : 'bg-gradient-to-r from-gray-400 via-gray-500 to-gray-600'
                    }
                  `}
                  style={{
                    width: isVisible ? `${percent}%` : '0%',
                    transitionDelay: `${index * 150}ms`,
                  }}
                />
              </div>

              {/* Tooltip on hover */}
              <div className={`
                absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded-lg
                text-[10px] font-mono font-bold whitespace-nowrap
                opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10
                ${isLight
                  ? 'bg-gray-800 text-white'
                  : 'bg-white text-gray-800'
                }
              `}>
                {latency}ms | ~{response.metrics.tokensEstimate || 0} tokens
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// METRICS SUMMARY (with animated charts)
// ============================================================================

interface MetricsSummaryProps {
  responses: ProviderResponse[];
  isLight: boolean;
}

const MetricsSummary: React.FC<MetricsSummaryProps> = ({ responses, isLight }) => {
  const completedResponses = responses.filter(r => !r.isLoading && r.metrics.latencyMs);

  if (completedResponses.length === 0) return null;

  const fastestResponse = completedResponses.reduce((a, b) =>
    (a.metrics.latencyMs || Infinity) < (b.metrics.latencyMs || Infinity) ? a : b
  );

  const avgLatency = completedResponses.reduce((sum, r) => sum + (r.metrics.latencyMs || 0), 0) / completedResponses.length;
  const totalTokens = completedResponses.reduce((sum, r) => sum + (r.metrics.tokensEstimate || 0), 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        {/* Fastest */}
        <div className={`
          p-4 rounded-xl border-2 transition-all duration-300 hover:scale-[1.02]
          bg-gradient-to-br
          ${isLight
            ? 'from-emerald-50 to-emerald-100/50 border-emerald-200 hover:shadow-[0_4px_20px_rgba(16,185,129,0.15)]'
            : 'from-emerald-900/30 to-emerald-800/20 border-emerald-800 hover:shadow-[0_4px_20px_rgba(16,185,129,0.1)]'
          }
        `}>
          <div className={`text-[9px] font-mono font-bold uppercase tracking-wider ${
            isLight ? 'text-emerald-600' : 'text-emerald-400'
          }`}>
            Fastest
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-2xl">{PROVIDERS[fastestResponse.provider].icon}</span>
            <span className={`text-lg font-mono font-bold ${
              isLight ? 'text-emerald-700' : 'text-emerald-300'
            }`}>
              {fastestResponse.metrics.latencyMs}ms
            </span>
          </div>
        </div>

        {/* Avg Latency */}
        <div className={`
          p-4 rounded-xl border-2 transition-all duration-300 hover:scale-[1.02]
          bg-gradient-to-br
          ${isLight
            ? 'from-blue-50 to-blue-100/50 border-blue-200 hover:shadow-[0_4px_20px_rgba(59,130,246,0.15)]'
            : 'from-blue-900/30 to-blue-800/20 border-blue-800 hover:shadow-[0_4px_20px_rgba(59,130,246,0.1)]'
          }
        `}>
          <div className={`text-[9px] font-mono font-bold uppercase tracking-wider ${
            isLight ? 'text-blue-600' : 'text-blue-400'
          }`}>
            Avg Latency
          </div>
          <div className={`text-lg font-mono font-bold mt-2 ${
            isLight ? 'text-blue-700' : 'text-blue-300'
          }`}>
            {avgLatency.toFixed(0)}ms
          </div>
        </div>

        {/* Total Tokens */}
        <div className={`
          p-4 rounded-xl border-2 transition-all duration-300 hover:scale-[1.02]
          bg-gradient-to-br
          ${isLight
            ? 'from-purple-50 to-purple-100/50 border-purple-200 hover:shadow-[0_4px_20px_rgba(147,51,234,0.15)]'
            : 'from-purple-900/30 to-purple-800/20 border-purple-800 hover:shadow-[0_4px_20px_rgba(147,51,234,0.1)]'
          }
        `}>
          <div className={`text-[9px] font-mono font-bold uppercase tracking-wider ${
            isLight ? 'text-purple-600' : 'text-purple-400'
          }`}>
            Est. Tokens
          </div>
          <div className={`text-lg font-mono font-bold mt-2 ${
            isLight ? 'text-purple-700' : 'text-purple-300'
          }`}>
            ~{totalTokens.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Bar Chart */}
      <AnimatedBarChart responses={responses} isLight={isLight} />
    </div>
  );
};

// ============================================================================
// PILL-STYLE VIEW TOGGLE
// ============================================================================

interface ViewToggleProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  isLight: boolean;
}

const ViewToggle: React.FC<ViewToggleProps> = ({ viewMode, setViewMode, isLight }) => {
  return (
    <div className={`
      relative flex rounded-full p-1 overflow-hidden
      ${isLight
        ? 'bg-gray-200'
        : 'bg-gray-800'
      }
    `}>
      {/* Sliding background */}
      <div
        className={`
          absolute top-1 bottom-1 rounded-full transition-all duration-300 ease-out
          ${isLight
            ? 'bg-white shadow-md'
            : 'bg-gray-700 shadow-lg'
          }
        `}
        style={{
          left: viewMode === 'columns' ? '4px' : '50%',
          width: 'calc(50% - 4px)',
        }}
      />

      {/* Columns button */}
      <button
        onClick={() => setViewMode('columns')}
        className={`
          relative z-10 flex items-center gap-2 px-4 py-2 rounded-full
          transition-colors duration-300 font-mono text-xs font-bold
          ${viewMode === 'columns'
            ? isLight ? 'text-gray-800' : 'text-white'
            : isLight ? 'text-gray-500 hover:text-gray-700' : 'text-gray-400 hover:text-gray-200'
          }
        `}
      >
        <Columns
          size={16}
          className="transition-transform duration-300"
          style={{
            transform: viewMode === 'columns' ? 'rotate(0deg)' : 'rotate(-15deg)',
          }}
        />
        <span>Columns</span>
      </button>

      {/* Tabs button */}
      <button
        onClick={() => setViewMode('tabs')}
        className={`
          relative z-10 flex items-center gap-2 px-4 py-2 rounded-full
          transition-colors duration-300 font-mono text-xs font-bold
          ${viewMode === 'tabs'
            ? isLight ? 'text-gray-800' : 'text-white'
            : isLight ? 'text-gray-500 hover:text-gray-700' : 'text-gray-400 hover:text-gray-200'
          }
        `}
      >
        <Layers
          size={16}
          className="transition-transform duration-300"
          style={{
            transform: viewMode === 'tabs' ? 'rotate(0deg)' : 'rotate(15deg)',
          }}
        />
        <span>Tabs</span>
      </button>
    </div>
  );
};

// ============================================================================
// RESIZABLE COLUMN VIEW
// ============================================================================

interface ResizableColumnsProps {
  responses: ProviderResponse[];
  isLight: boolean;
}

const ResizableColumns: React.FC<ResizableColumnsProps> = ({ responses, isLight }) => {
  const [columnWidths, setColumnWidths] = useState<number[]>([]);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeIndex, setResizeIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthsRef = useRef<number[]>([]);

  // Initialize equal widths
  useEffect(() => {
    if (responses.length > 0 && columnWidths.length !== responses.length) {
      setColumnWidths(responses.map(() => 100 / responses.length));
    }
  }, [responses.length]);

  const handleMouseDown = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    setResizeIndex(index);
    startXRef.current = e.clientX;
    startWidthsRef.current = [...columnWidths];
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || resizeIndex === null || !containerRef.current) return;

      const containerWidth = containerRef.current.offsetWidth;
      const deltaX = e.clientX - startXRef.current;
      const deltaPercent = (deltaX / containerWidth) * 100;

      const newWidths = [...startWidthsRef.current];
      const minWidth = 15; // Minimum 15% width

      const newLeftWidth = startWidthsRef.current[resizeIndex] + deltaPercent;
      const newRightWidth = startWidthsRef.current[resizeIndex + 1] - deltaPercent;

      if (newLeftWidth >= minWidth && newRightWidth >= minWidth) {
        newWidths[resizeIndex] = newLeftWidth;
        newWidths[resizeIndex + 1] = newRightWidth;
        setColumnWidths(newWidths);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setResizeIndex(null);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeIndex]);

  // Compare mode for diff highlighting
  const [compareMode, setCompareMode] = useState(false);
  const [compareIndex, setCompareIndex] = useState<number | null>(null);

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Compare toggle */}
      {responses.length > 1 && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setCompareMode(!compareMode);
              if (!compareMode && responses.length > 0) {
                setCompareIndex(0);
              }
            }}
            className={`
              flex items-center gap-2 px-3 py-1.5 rounded-lg font-mono text-xs font-bold
              transition-all duration-300
              ${compareMode
                ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg'
                : isLight
                  ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }
            `}
          >
            <ArrowLeftRight size={14} />
            {compareMode ? 'Comparing' : 'Compare Mode'}
          </button>

          {compareMode && (
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-mono ${isLight ? 'text-gray-500' : 'text-gray-500'}`}>
                Base:
              </span>
              <select
                value={compareIndex ?? 0}
                onChange={(e) => setCompareIndex(Number(e.target.value))}
                className={`
                  px-2 py-1 rounded-lg text-xs font-mono
                  ${isLight
                    ? 'bg-gray-100 text-gray-700 border border-gray-300'
                    : 'bg-gray-800 text-gray-300 border border-gray-600'
                  }
                `}
              >
                {responses.map((r, i) => (
                  <option key={r.provider} value={i}>
                    {PROVIDERS[r.provider].name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Columns */}
      <div
        ref={containerRef}
        className="flex h-full gap-0 relative"
        style={{ cursor: isResizing ? 'col-resize' : 'default' }}
      >
        {responses.map((response, index) => (
          <React.Fragment key={response.provider}>
            <div
              className="min-w-0 overflow-hidden"
              style={{ width: `${columnWidths[index] || (100 / responses.length)}%` }}
            >
              <ResponsePanel
                response={response}
                isLight={isLight}
                isActive={compareMode && compareIndex === index}
                showDiff={compareMode && compareIndex !== index}
                compareContent={compareMode && compareIndex !== null ? responses[compareIndex]?.content : undefined}
              />
            </div>

            {/* Resizable divider */}
            {index < responses.length - 1 && (
              <div
                className={`
                  group flex items-center justify-center w-4 cursor-col-resize
                  transition-colors duration-200 shrink-0
                  ${isResizing && resizeIndex === index
                    ? isLight ? 'bg-gray-300' : 'bg-gray-600'
                    : 'hover:bg-gray-200 dark:hover:bg-gray-700'
                  }
                `}
                onMouseDown={(e) => handleMouseDown(index, e)}
              >
                <GripVertical
                  size={16}
                  className={`
                    transition-colors duration-200
                    ${isResizing && resizeIndex === index
                      ? 'text-gray-600 dark:text-gray-300'
                      : 'text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300'
                    }
                  `}
                />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const MultiInputDashboard: React.FC = () => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  // State
  const [selectedProviders, setSelectedProviders] = useState<Set<CLIProvider>>(
    new Set(['claude', 'gemini', 'ollama'])
  );
  const [prompt, setPrompt] = useState('');
  const [responses, setResponses] = useState<Map<CLIProvider, ProviderResponse>>(new Map());
  const [isProcessing, setIsProcessing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('columns');
  const [activeTab, setActiveTab] = useState<CLIProvider | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // All providers (including placeholders)
  const allProviders = Object.values(PROVIDERS);

  // Toggle provider selection
  const toggleProvider = useCallback((providerId: CLIProvider, checked: boolean) => {
    setSelectedProviders(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(providerId);
      } else {
        next.delete(providerId);
      }
      return next;
    });
  }, []);

  // Select/Deselect all
  const selectAll = useCallback(() => {
    setSelectedProviders(new Set(allProviders.filter(p => p.isAvailable).map(p => p.id)));
  }, [allProviders]);

  const deselectAll = useCallback(() => {
    setSelectedProviders(new Set());
  }, []);

  // Estimate tokens from text
  const estimateTokens = (text: string): number => {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  };

  // Send to all selected providers
  const sendToAll = useCallback(async () => {
    if (!prompt.trim() || selectedProviders.size === 0 || isProcessing) return;

    setIsProcessing(true);
    const newResponses = new Map<CLIProvider, ProviderResponse>();

    // Initialize responses
    selectedProviders.forEach(providerId => {
      newResponses.set(providerId, {
        provider: providerId,
        content: '',
        isLoading: true,
        metrics: {
          startTime: Date.now(),
        },
      });
    });
    setResponses(newResponses);

    // Set active tab to first provider
    if (viewMode === 'tabs' && selectedProviders.size > 0) {
      setActiveTab(Array.from(selectedProviders)[0]);
    }

    // Send to all providers in parallel
    const promises = Array.from(selectedProviders).map(async (providerId) => {
      const provider = getProvider(providerId);
      const startTime = Date.now();

      try {
        const result = await provider.send(prompt);
        const endTime = Date.now();

        setResponses(prev => {
          const updated = new Map(prev);
          updated.set(providerId, {
            provider: providerId,
            content: result.content,
            isLoading: false,
            error: result.error,
            metrics: {
              startTime,
              endTime,
              latencyMs: endTime - startTime,
              tokensEstimate: estimateTokens(result.content),
            },
          });
          return updated;
        });
      } catch (error) {
        const endTime = Date.now();

        setResponses(prev => {
          const updated = new Map(prev);
          updated.set(providerId, {
            provider: providerId,
            content: '',
            isLoading: false,
            error: String(error),
            metrics: {
              startTime,
              endTime,
              latencyMs: endTime - startTime,
            },
          });
          return updated;
        });
      }
    });

    await Promise.allSettled(promises);
    setIsProcessing(false);
  }, [prompt, selectedProviders, isProcessing, viewMode]);

  // Clear all responses
  const clearResponses = useCallback(() => {
    setResponses(new Map());
  }, []);

  // Handle keyboard shortcut
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendToAll();
    }
  };

  const responsesArray = Array.from(responses.values());

  return (
    <div className="flex flex-col h-full p-4 gap-6 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`
            p-2 rounded-xl
            ${isLight
              ? 'bg-gradient-to-br from-gray-100 to-gray-200'
              : 'bg-gradient-to-br from-gray-800 to-gray-900'
            }
          `}>
            <Layers size={24} className={isLight ? 'text-gray-700' : 'text-gray-300'} />
          </div>
          <div>
            <h2 className={`text-lg font-mono font-bold tracking-wider ${
              isLight ? 'text-gray-800' : 'text-gray-200'
            }`}>
              MULTI-INPUT DASHBOARD
            </h2>
            <p className={`text-[10px] font-mono ${isLight ? 'text-gray-500' : 'text-gray-500'}`}>
              Compare responses from multiple AI providers
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <ViewToggle
            viewMode={viewMode}
            setViewMode={setViewMode}
            isLight={isLight}
          />

          {/* Clear button */}
          {responses.size > 0 && (
            <button
              onClick={clearResponses}
              className={`
                p-2 rounded-xl transition-all duration-300
                ${isLight
                  ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }
              `}
              title="Clear responses"
            >
              <RefreshCw size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Provider Selection */}
      <div className={`
        p-4 rounded-2xl border-2
        ${isLight
          ? 'bg-gradient-to-br from-white to-gray-50 border-gray-200'
          : 'bg-gradient-to-br from-gray-900 to-gray-850 border-gray-700'
        }
      `}>
        <div className="flex items-center justify-between mb-3">
          <span className={`text-[11px] font-mono font-bold tracking-wider uppercase ${
            isLight ? 'text-gray-600' : 'text-gray-400'
          }`}>
            Select Providers
          </span>
          <div className="flex gap-2">
            <button
              onClick={selectAll}
              className={`
                text-[10px] font-mono font-bold px-3 py-1 rounded-lg transition-all duration-200
                ${isLight
                  ? 'text-gray-600 hover:bg-gray-200 hover:text-gray-800'
                  : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                }
              `}
            >
              Select All
            </button>
            <button
              onClick={deselectAll}
              className={`
                text-[10px] font-mono font-bold px-3 py-1 rounded-lg transition-all duration-200
                ${isLight
                  ? 'text-gray-600 hover:bg-gray-200 hover:text-gray-800'
                  : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                }
              `}
            >
              Deselect All
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {allProviders.map((provider) => (
            <ProviderCheckbox
              key={provider.id}
              provider={provider}
              checked={selectedProviders.has(provider.id)}
              onChange={(checked) => toggleProvider(provider.id, checked)}
              isLight={isLight}
              disabled={!provider.isAvailable}
            />
          ))}
        </div>

        <div className={`mt-3 text-[10px] font-mono font-bold ${
          isLight ? 'text-gray-500' : 'text-gray-500'
        }`}>
          {selectedProviders.size} provider{selectedProviders.size !== 1 ? 's' : ''} selected
        </div>
      </div>

      {/* Prompt Input */}
      <div className={`
        p-4 rounded-2xl border-2
        ${isLight
          ? 'bg-gradient-to-br from-white to-gray-50 border-gray-200'
          : 'bg-gradient-to-br from-gray-900 to-gray-850 border-gray-700'
        }
      `}>
        <div className="flex gap-4">
          <FloatingInput
            value={prompt}
            onChange={setPrompt}
            onKeyDown={handleKeyDown}
            disabled={isProcessing}
            isLight={isLight}
            textareaRef={textareaRef as React.RefObject<HTMLTextAreaElement>}
          />

          <button
            onClick={sendToAll}
            disabled={!prompt.trim() || selectedProviders.size === 0 || isProcessing}
            className={`
              px-6 py-3 rounded-xl font-mono text-sm font-bold transition-all duration-300
              flex items-center gap-3 shrink-0 self-start mt-1
              ${prompt.trim() && selectedProviders.size > 0 && !isProcessing
                ? isLight
                  ? 'bg-gradient-to-r from-gray-800 via-gray-900 to-black text-white hover:shadow-[0_4px_20px_rgba(0,0,0,0.3)] hover:scale-105'
                  : 'bg-gradient-to-r from-white via-gray-100 to-gray-200 text-black hover:shadow-[0_4px_20px_rgba(255,255,255,0.2)] hover:scale-105'
                : isLight
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-800 text-gray-600 cursor-not-allowed'
              }
            `}
          >
            {isProcessing ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send size={18} />
                Send to All
              </>
            )}
          </button>
        </div>
      </div>

      {/* Metrics Summary */}
      {responsesArray.length > 0 && (
        <MetricsSummary responses={responsesArray} isLight={isLight} />
      )}

      {/* Responses */}
      {responsesArray.length > 0 && (
        <div className="flex-1 min-h-0">
          {viewMode === 'columns' ? (
            /* Resizable Column View */
            <ResizableColumns responses={responsesArray} isLight={isLight} />
          ) : (
            /* Tab View */
            <div className="flex flex-col h-full gap-3">
              {/* Tab headers */}
              <div className={`
                flex gap-1 p-1.5 rounded-xl
                ${isLight ? 'bg-gray-100' : 'bg-gray-800'}
              `}>
                {responsesArray.map((response) => {
                  const provider = PROVIDERS[response.provider];
                  const isActive = activeTab === response.provider;

                  return (
                    <button
                      key={response.provider}
                      onClick={() => setActiveTab(response.provider)}
                      className={`
                        flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-300 font-mono text-xs font-bold
                        ${isActive
                          ? isLight
                            ? 'bg-white text-gray-800 shadow-md'
                            : 'bg-gray-700 text-white shadow-lg'
                          : isLight
                            ? 'text-gray-600 hover:text-gray-800 hover:bg-gray-200'
                            : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                        }
                      `}
                    >
                      <span className="text-lg">{provider.icon}</span>
                      <span>{provider.name}</span>
                      {response.isLoading && (
                        <Loader2 size={14} className="animate-spin" />
                      )}
                      {!response.isLoading && !response.error && response.content && (
                        <Check size={14} className="text-emerald-500" />
                      )}
                      {response.error && (
                        <X size={14} className="text-red-500" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Active tab content */}
              <div className="flex-1 min-h-0">
                {activeTab && responses.has(activeTab) && (
                  <ResponsePanel
                    response={responses.get(activeTab)!}
                    isLight={isLight}
                    isActive={true}
                    expanded={true}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {responsesArray.length === 0 && (
        <div className={`
          flex-1 flex items-center justify-center rounded-2xl border-2 border-dashed
          ${isLight ? 'border-gray-300 text-gray-400' : 'border-gray-700 text-gray-600'}
        `}>
          <div className="text-center p-8">
            <div className={`
              w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center
              ${isLight
                ? 'bg-gradient-to-br from-gray-100 to-gray-200'
                : 'bg-gradient-to-br from-gray-800 to-gray-900'
              }
            `}>
              <Layers size={32} className="opacity-50" />
            </div>
            <p className="text-sm font-mono font-bold">Select providers and enter a prompt</p>
            <p className="text-xs font-mono mt-1 opacity-70">Compare AI responses side by side</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiInputDashboard;
