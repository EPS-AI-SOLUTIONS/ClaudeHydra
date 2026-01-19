import React, { useState, useCallback, useRef } from 'react';
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
  ChevronDown,
  ChevronUp,
  RefreshCw,
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
// PROVIDER CHECKBOX
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
      className={`flex items-center gap-2 p-2 rounded-lg border transition-all cursor-pointer ${
        checked
          ? isLight
            ? 'bg-gray-100 border-gray-400'
            : 'bg-gray-800 border-gray-500'
          : isLight
            ? 'bg-white/50 border-gray-200 hover:border-gray-300'
            : 'bg-black/30 border-gray-700 hover:border-gray-600'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="w-4 h-4 rounded border-gray-400 text-gray-600 focus:ring-gray-500"
      />
      <span className="text-base">{provider.icon}</span>
      <div className="flex-1">
        <div className={`text-xs font-mono font-semibold ${
          isLight ? 'text-gray-800' : 'text-gray-200'
        }`}>
          {provider.name}
        </div>
        <div className={`text-[9px] font-mono ${
          isLight ? 'text-gray-500' : 'text-gray-500'
        }`}>
          {provider.isAvailable ? (
            <span className="text-emerald-500">Available</span>
          ) : (
            <span className="text-amber-500">Placeholder</span>
          )}
        </div>
      </div>
      <div className={`text-[8px] font-mono px-1.5 py-0.5 rounded ${
        isLight ? 'bg-gray-200 text-gray-600' : 'bg-gray-700 text-gray-400'
      }`}>
        {(provider.maxContextTokens / 1000).toFixed(0)}K
      </div>
    </label>
  );
};

// ============================================================================
// RESPONSE PANEL
// ============================================================================

interface ResponsePanelProps {
  response: ProviderResponse;
  isLight: boolean;
  isActive: boolean;
  onClick?: () => void;
  expanded?: boolean;
}

const ResponsePanel: React.FC<ResponsePanelProps> = ({
  response,
  isLight,
  isActive,
  onClick,
  expanded = true,
}) => {
  const provider = PROVIDERS[response.provider];
  const [isExpanded, setIsExpanded] = useState(expanded);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(response.content);
  }, [response.content]);

  return (
    <div
      className={`flex flex-col rounded-lg border transition-all ${
        isActive
          ? isLight
            ? 'border-gray-400 bg-white/80'
            : 'border-gray-500 bg-black/60'
          : isLight
            ? 'border-gray-200 bg-white/50'
            : 'border-gray-700 bg-black/40'
      } ${onClick ? 'cursor-pointer hover:border-gray-400' : ''}`}
      onClick={onClick}
    >
      {/* Header */}
      <div className={`flex items-center justify-between p-2 border-b ${
        isLight ? 'border-gray-200' : 'border-gray-700'
      }`}>
        <div className="flex items-center gap-2">
          <span className="text-base">{provider.icon}</span>
          <span className={`text-xs font-mono font-semibold ${
            isLight ? 'text-gray-800' : 'text-gray-200'
          }`}>
            {provider.name}
          </span>
          {response.isLoading && (
            <Loader2 size={12} className="animate-spin text-gray-500" />
          )}
          {!response.isLoading && !response.error && response.content && (
            <Check size={12} className="text-emerald-500" />
          )}
          {response.error && (
            <X size={12} className="text-red-500" />
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Metrics */}
          {response.metrics.latencyMs !== undefined && (
            <div className={`flex items-center gap-1 text-[9px] font-mono ${
              isLight ? 'text-gray-500' : 'text-gray-500'
            }`}>
              <Clock size={10} />
              {response.metrics.latencyMs}ms
            </div>
          )}
          {response.metrics.tokensEstimate !== undefined && (
            <div className={`flex items-center gap-1 text-[9px] font-mono ${
              isLight ? 'text-gray-500' : 'text-gray-500'
            }`}>
              <Zap size={10} />
              ~{response.metrics.tokensEstimate}
            </div>
          )}

          {/* Actions */}
          {response.content && (
            <button
              onClick={(e) => { e.stopPropagation(); handleCopy(); }}
              className={`p-1 rounded transition-colors ${
                isLight ? 'hover:bg-gray-200' : 'hover:bg-gray-700'
              }`}
              title="Copy response"
            >
              <Copy size={12} className={isLight ? 'text-gray-600' : 'text-gray-400'} />
            </button>
          )}

          <button
            onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
            className={`p-1 rounded transition-colors ${
              isLight ? 'hover:bg-gray-200' : 'hover:bg-gray-700'
            }`}
          >
            {isExpanded ? (
              <ChevronUp size={12} className={isLight ? 'text-gray-600' : 'text-gray-400'} />
            ) : (
              <ChevronDown size={12} className={isLight ? 'text-gray-600' : 'text-gray-400'} />
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="flex-1 p-3 overflow-auto max-h-[400px]">
          {response.isLoading && !response.content && (
            <div className="flex items-center justify-center py-8">
              <div className="flex flex-col items-center gap-2">
                <Loader2 size={24} className="animate-spin text-gray-500" />
                <span className={`text-xs font-mono ${
                  isLight ? 'text-gray-500' : 'text-gray-500'
                }`}>
                  Processing...
                </span>
              </div>
            </div>
          )}

          {response.error && (
            <div className={`p-3 rounded border ${
              isLight
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-red-900/20 border-red-800 text-red-400'
            }`}>
              <span className="text-xs font-mono">{response.error}</span>
            </div>
          )}

          {response.content && (
            <div className={`text-xs font-mono whitespace-pre-wrap leading-relaxed ${
              isLight ? 'text-gray-800' : 'text-gray-200'
            }`}>
              {response.content}
            </div>
          )}

          {!response.isLoading && !response.error && !response.content && (
            <div className={`text-xs font-mono text-center py-4 ${
              isLight ? 'text-gray-400' : 'text-gray-600'
            }`}>
              No response yet
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// METRICS SUMMARY
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
    <div className={`glass-card p-3 ${isLight ? 'bg-white/70' : 'bg-black/40'}`}>
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 size={14} className={isLight ? 'text-gray-600' : 'text-gray-400'} />
        <span className={`text-[10px] font-mono tracking-wider uppercase ${
          isLight ? 'text-gray-600' : 'text-gray-400'
        }`}>
          Comparison Metrics
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Fastest */}
        <div className={`p-2 rounded border ${
          isLight ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-900/20 border-emerald-800'
        }`}>
          <div className={`text-[9px] font-mono uppercase ${
            isLight ? 'text-emerald-600' : 'text-emerald-400'
          }`}>
            Fastest
          </div>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-base">{PROVIDERS[fastestResponse.provider].icon}</span>
            <span className={`text-xs font-mono font-semibold ${
              isLight ? 'text-emerald-700' : 'text-emerald-300'
            }`}>
              {fastestResponse.metrics.latencyMs}ms
            </span>
          </div>
        </div>

        {/* Avg Latency */}
        <div className={`p-2 rounded border ${
          isLight ? 'bg-blue-50 border-blue-200' : 'bg-blue-900/20 border-blue-800'
        }`}>
          <div className={`text-[9px] font-mono uppercase ${
            isLight ? 'text-blue-600' : 'text-blue-400'
          }`}>
            Avg Latency
          </div>
          <div className={`text-xs font-mono font-semibold mt-1 ${
            isLight ? 'text-blue-700' : 'text-blue-300'
          }`}>
            {avgLatency.toFixed(0)}ms
          </div>
        </div>

        {/* Total Tokens */}
        <div className={`p-2 rounded border ${
          isLight ? 'bg-purple-50 border-purple-200' : 'bg-purple-900/20 border-purple-800'
        }`}>
          <div className={`text-[9px] font-mono uppercase ${
            isLight ? 'text-purple-600' : 'text-purple-400'
          }`}>
            Est. Tokens
          </div>
          <div className={`text-xs font-mono font-semibold mt-1 ${
            isLight ? 'text-purple-700' : 'text-purple-300'
          }`}>
            ~{totalTokens}
          </div>
        </div>
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

  // Auto-resize textarea
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  };

  const responsesArray = Array.from(responses.values());

  return (
    <div className="flex flex-col h-full p-4 gap-4 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers size={20} className={isLight ? 'text-gray-700' : 'text-gray-300'} />
          <h2 className={`text-lg font-mono font-bold tracking-wider ${
            isLight ? 'text-gray-800' : 'text-gray-200'
          }`}>
            MULTI-INPUT DASHBOARD
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className={`flex rounded-lg border ${
            isLight ? 'border-gray-300 bg-gray-100' : 'border-gray-700 bg-gray-800'
          }`}>
            <button
              onClick={() => setViewMode('columns')}
              className={`p-1.5 rounded-l-lg transition-colors ${
                viewMode === 'columns'
                  ? isLight ? 'bg-white text-gray-800' : 'bg-gray-700 text-white'
                  : isLight ? 'text-gray-500 hover:text-gray-700' : 'text-gray-400 hover:text-gray-200'
              }`}
              title="Column view"
            >
              <Columns size={16} />
            </button>
            <button
              onClick={() => setViewMode('tabs')}
              className={`p-1.5 rounded-r-lg transition-colors ${
                viewMode === 'tabs'
                  ? isLight ? 'bg-white text-gray-800' : 'bg-gray-700 text-white'
                  : isLight ? 'text-gray-500 hover:text-gray-700' : 'text-gray-400 hover:text-gray-200'
              }`}
              title="Tab view"
            >
              <Layers size={16} />
            </button>
          </div>

          {/* Clear button */}
          {responses.size > 0 && (
            <button
              onClick={clearResponses}
              className="glass-button p-1.5"
              title="Clear responses"
            >
              <RefreshCw size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Provider Selection */}
      <div className="glass-card p-3">
        <div className="flex items-center justify-between mb-2">
          <span className={`text-[10px] font-mono tracking-wider uppercase ${
            isLight ? 'text-gray-600' : 'text-gray-400'
          }`}>
            Select Providers
          </span>
          <div className="flex gap-2">
            <button
              onClick={selectAll}
              className={`text-[9px] font-mono px-2 py-0.5 rounded transition-colors ${
                isLight
                  ? 'text-gray-600 hover:bg-gray-200'
                  : 'text-gray-400 hover:bg-gray-700'
              }`}
            >
              Select All
            </button>
            <button
              onClick={deselectAll}
              className={`text-[9px] font-mono px-2 py-0.5 rounded transition-colors ${
                isLight
                  ? 'text-gray-600 hover:bg-gray-200'
                  : 'text-gray-400 hover:bg-gray-700'
              }`}
            >
              Deselect All
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
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

        <div className={`mt-2 text-[9px] font-mono ${
          isLight ? 'text-gray-500' : 'text-gray-500'
        }`}>
          {selectedProviders.size} provider{selectedProviders.size !== 1 ? 's' : ''} selected
        </div>
      </div>

      {/* Prompt Input */}
      <div className="glass-card p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-[10px] font-mono tracking-wider uppercase ${
            isLight ? 'text-gray-600' : 'text-gray-400'
          }`}>
            Prompt
          </span>
          <span className={`text-[9px] font-mono ${
            isLight ? 'text-gray-400' : 'text-gray-600'
          }`}>
            (Ctrl+Enter to send)
          </span>
        </div>

        <div className="flex gap-3">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Enter your prompt to send to all selected providers..."
            disabled={isProcessing}
            rows={3}
            className={`flex-1 p-3 rounded-lg border resize-none font-mono text-sm transition-colors ${
              isLight
                ? 'bg-white border-gray-300 text-gray-800 placeholder:text-gray-400 focus:border-gray-500'
                : 'bg-black/30 border-gray-700 text-gray-200 placeholder:text-gray-600 focus:border-gray-500'
            } outline-none`}
          />

          <button
            onClick={sendToAll}
            disabled={!prompt.trim() || selectedProviders.size === 0 || isProcessing}
            className={`px-4 py-2 rounded-lg font-mono text-sm font-semibold transition-all flex items-center gap-2 ${
              prompt.trim() && selectedProviders.size > 0 && !isProcessing
                ? isLight
                  ? 'bg-gray-900 text-white hover:bg-gray-800'
                  : 'bg-white text-black hover:bg-gray-200'
                : isLight
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-800 text-gray-600 cursor-not-allowed'
            }`}
          >
            {isProcessing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send size={16} />
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
            /* Column View */
            <div className={`grid gap-3 h-full ${
              responsesArray.length === 1 ? 'grid-cols-1' :
              responsesArray.length === 2 ? 'grid-cols-2' :
              responsesArray.length === 3 ? 'grid-cols-3' :
              'grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
            }`}>
              {responsesArray.map((response) => (
                <ResponsePanel
                  key={response.provider}
                  response={response}
                  isLight={isLight}
                  isActive={false}
                />
              ))}
            </div>
          ) : (
            /* Tab View */
            <div className="flex flex-col h-full gap-3">
              {/* Tab headers */}
              <div className={`flex gap-1 p-1 rounded-lg ${
                isLight ? 'bg-gray-100' : 'bg-gray-800'
              }`}>
                {responsesArray.map((response) => {
                  const provider = PROVIDERS[response.provider];
                  const isActive = activeTab === response.provider;

                  return (
                    <button
                      key={response.provider}
                      onClick={() => setActiveTab(response.provider)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${
                        isActive
                          ? isLight
                            ? 'bg-white text-gray-800 shadow-sm'
                            : 'bg-gray-700 text-white'
                          : isLight
                            ? 'text-gray-600 hover:text-gray-800 hover:bg-gray-200'
                            : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                      }`}
                    >
                      <span>{provider.icon}</span>
                      <span className="text-xs font-mono font-semibold">{provider.name}</span>
                      {response.isLoading && (
                        <Loader2 size={12} className="animate-spin" />
                      )}
                      {!response.isLoading && !response.error && response.content && (
                        <Check size={12} className="text-emerald-500" />
                      )}
                      {response.error && (
                        <X size={12} className="text-red-500" />
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
        <div className={`flex-1 flex items-center justify-center ${
          isLight ? 'text-gray-400' : 'text-gray-600'
        }`}>
          <div className="text-center">
            <Layers size={48} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm font-mono">Select providers and enter a prompt to compare responses</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiInputDashboard;
