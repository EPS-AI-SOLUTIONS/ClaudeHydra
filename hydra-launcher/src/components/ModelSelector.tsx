import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { CLIProvider } from '../contexts/TabContext';
import { PROVIDERS, ProviderConfig } from '../providers';
import {
  Bot,
  ChevronDown,
  Search,
  Zap,
  Globe,
  Code,
  MessageSquare,
  Cpu,
  Check,
  X
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface ModelSelectorProps {
  onSelect: (provider: CLIProvider) => void;
  selectedProvider?: CLIProvider;
  compact?: boolean;
}

interface ModelOption {
  id: string;
  name: string;
  description: string;
  contextSize: string;
  isDefault?: boolean;
}

// Provider models mapping - each provider can have multiple models
const PROVIDER_MODELS: Record<CLIProvider, ModelOption[]> = {
  claude: [
    { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', description: 'Most capable model', contextSize: '200K', isDefault: true },
    { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', description: 'Balanced performance', contextSize: '200K' },
    { id: 'claude-haiku-3.5', name: 'Claude Haiku 3.5', description: 'Fast & efficient', contextSize: '200K' },
  ],
  gemini: [
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Latest flagship', contextSize: '2M', isDefault: true },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Ultra fast', contextSize: '1M' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Previous gen', contextSize: '2M' },
  ],
  jules: [
    { id: 'jules-agent', name: 'Jules Agent', description: 'Async task agent', contextSize: '100K', isDefault: true },
  ],
  codex: [
    { id: 'gpt-5-codex', name: 'GPT-5 Codex', description: 'Code specialist', contextSize: '128K', isDefault: true },
    { id: 'gpt-4o', name: 'GPT-4o', description: 'Multimodal', contextSize: '128K' },
  ],
  grok: [
    { id: 'grok-3', name: 'Grok 3', description: 'Real-time AI', contextSize: '100K', isDefault: true },
    { id: 'grok-2', name: 'Grok 2', description: 'Previous version', contextSize: '100K' },
  ],
  ollama: [
    { id: 'llama3.2:3b', name: 'Llama 3.2 3B', description: 'Fast local', contextSize: '8K', isDefault: true },
    { id: 'llama3.2:7b', name: 'Llama 3.2 7B', description: 'Better quality', contextSize: '8K' },
    { id: 'codellama:7b', name: 'Code Llama 7B', description: 'Code focused', contextSize: '16K' },
    { id: 'mistral:7b', name: 'Mistral 7B', description: 'Balanced', contextSize: '32K' },
    { id: 'deepseek-coder:6.7b', name: 'DeepSeek Coder', description: 'Code expert', contextSize: '16K' },
  ],
};

// Provider icons mapping with custom SVG or Lucide icons
const getProviderIcon = (providerId: CLIProvider) => {
  switch (providerId) {
    case 'claude':
      return <Bot className="w-5 h-5" />;
    case 'gemini':
      return <Globe className="w-5 h-5" />;
    case 'jules':
      return <Zap className="w-5 h-5" />;
    case 'codex':
      return <Code className="w-5 h-5" />;
    case 'grok':
      return <MessageSquare className="w-5 h-5" />;
    case 'ollama':
      return <Cpu className="w-5 h-5" />;
    default:
      return <Bot className="w-5 h-5" />;
  }
};

// ============================================================================
// TOOLTIP COMPONENT
// ============================================================================

interface TooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

const Tooltip: React.FC<TooltipProps> = ({ children, content, position = 'top' }) => {
  const [isVisible, setIsVisible] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div
          className={`absolute z-50 ${positionClasses[position]} pointer-events-none`}
          style={{ minWidth: '200px' }}
        >
          <div className="animate-fade-in-up glass-card-modern p-3 rounded-lg shadow-xl">
            {content}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// PROVIDER TOOLTIP CONTENT
// ============================================================================

const ProviderTooltipContent: React.FC<{ provider: ProviderConfig }> = ({ provider }) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">{provider.icon}</span>
        <span className={`font-mono font-semibold ${isLight ? 'text-gray-900' : 'text-white'}`}>
          {provider.name}
        </span>
        {provider.isAvailable ? (
          <span className="flex items-center gap-1 text-[10px] text-green-500">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Online
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[10px] text-gray-500">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
            Offline
          </span>
        )}
      </div>
      
      <p className={`text-[11px] ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>
        {provider.description}
      </p>
      
      <div className={`text-[10px] space-y-1 pt-1 border-t ${isLight ? 'border-gray-200' : 'border-gray-700'}`}>
        <div className="flex justify-between">
          <span className={isLight ? 'text-gray-500' : 'text-gray-500'}>Context:</span>
          <span className={isLight ? 'text-gray-700' : 'text-gray-300'}>
            {(provider.maxContextTokens / 1000).toFixed(0)}K tokens
          </span>
        </div>
        <div className="flex justify-between">
          <span className={isLight ? 'text-gray-500' : 'text-gray-500'}>Type:</span>
          <span className={isLight ? 'text-gray-700' : 'text-gray-300'}>
            {provider.isLocal ? 'Local' : 'Cloud'}
          </span>
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {provider.specialties.slice(0, 3).map((spec) => (
            <span
              key={spec}
              className={`px-1.5 py-0.5 rounded text-[9px] ${
                isLight ? 'bg-gray-100 text-gray-600' : 'bg-gray-800 text-gray-400'
              }`}
            >
              {spec.replace('_', ' ')}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// STATUS BADGE COMPONENT
// ============================================================================

interface StatusBadgeProps {
  isAvailable: boolean;
  isLocal?: boolean;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ isAvailable, isLocal }) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  if (isAvailable) {
    return (
      <div className="flex items-center gap-1">
        <span
          className={`relative flex h-2 w-2`}
        >
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        {isLocal && (
          <span className={`text-[8px] px-1 py-0.5 rounded ${
            isLight ? 'bg-blue-100 text-blue-600' : 'bg-blue-900/50 text-blue-400'
          }`}>
            LOCAL
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <span className="w-2 h-2 rounded-full bg-gray-400" />
      <span className={`text-[8px] ${isLight ? 'text-gray-400' : 'text-gray-500'}`}>
        OFFLINE
      </span>
    </div>
  );
};

// ============================================================================
// MODEL DROPDOWN COMPONENT
// ============================================================================

interface ModelDropdownProps {
  provider: CLIProvider;
  isOpen: boolean;
  onClose: () => void;
  onSelectModel: (modelId: string) => void;
  selectedModel: string;
}

const ModelDropdown: React.FC<ModelDropdownProps> = ({
  provider,
  isOpen,
  onClose,
  onSelectModel,
  selectedModel,
}) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const models = PROVIDER_MODELS[provider] || [];
  const filteredModels = models.filter(
    (m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      className={`absolute top-full left-0 right-0 mt-1 z-50 
        animate-scale-in origin-top
        glass-card-modern rounded-lg overflow-hidden
        ${isLight ? 'shadow-lg' : 'shadow-2xl'}`}
    >
      {/* Search input */}
      {models.length > 3 && (
        <div className={`p-2 border-b ${isLight ? 'border-gray-200' : 'border-gray-700'}`}>
          <div className={`flex items-center gap-2 px-2 py-1.5 rounded-md ${
            isLight ? 'bg-gray-100' : 'bg-gray-800'
          }`}>
            <Search size={12} className={isLight ? 'text-gray-400' : 'text-gray-500'} />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search models..."
              className={`flex-1 bg-transparent text-[11px] font-mono outline-none ${
                isLight ? 'text-gray-700 placeholder-gray-400' : 'text-gray-200 placeholder-gray-500'
              }`}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="hover:opacity-70">
                <X size={12} className={isLight ? 'text-gray-400' : 'text-gray-500'} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Model list */}
      <div className="max-h-48 overflow-y-auto">
        {filteredModels.length > 0 ? (
          filteredModels.map((model) => (
            <button
              key={model.id}
              onClick={() => {
                onSelectModel(model.id);
                onClose();
              }}
              className={`w-full px-3 py-2 text-left transition-all duration-150
                ${selectedModel === model.id
                  ? isLight
                    ? 'bg-gray-100'
                    : 'bg-gray-800'
                  : isLight
                    ? 'hover:bg-gray-50'
                    : 'hover:bg-gray-800/50'
                }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-mono font-medium truncate ${
                      isLight ? 'text-gray-800' : 'text-gray-200'
                    }`}>
                      {model.name}
                    </span>
                    {model.isDefault && (
                      <span className={`text-[8px] px-1 py-0.5 rounded ${
                        isLight ? 'bg-green-100 text-green-600' : 'bg-green-900/50 text-green-400'
                      }`}>
                        DEFAULT
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[9px] ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                      {model.description}
                    </span>
                    <span className={`text-[9px] ${isLight ? 'text-gray-400' : 'text-gray-500'}`}>
                      {model.contextSize}
                    </span>
                  </div>
                </div>
                {selectedModel === model.id && (
                  <Check size={14} className="text-green-500 flex-shrink-0" />
                )}
              </div>
            </button>
          ))
        ) : (
          <div className={`px-3 py-4 text-center text-[11px] ${
            isLight ? 'text-gray-500' : 'text-gray-400'
          }`}>
            No models found
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// PROVIDER CARD COMPONENT
// ============================================================================

interface ProviderCardProps {
  provider: ProviderConfig;
  isSelected: boolean;
  onSelect: () => void;
  onModelSelect: (modelId: string) => void;
  selectedModel: string;
}

const ProviderCard: React.FC<ProviderCardProps> = ({
  provider,
  isSelected,
  onSelect,
  onModelSelect,
  selectedModel,
}) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const hasMultipleModels = (PROVIDER_MODELS[provider.id]?.length || 0) > 1;

  return (
    <Tooltip content={<ProviderTooltipContent provider={provider} />} position="top">
      <div
        className={`relative group cursor-pointer transition-all duration-300
          ${isSelected ? 'z-10' : 'z-0'}
        `}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Gradient border for active provider */}
        {isSelected && (
          <div
            className="absolute -inset-[2px] rounded-xl opacity-100 blur-[1px]"
            style={{
              background: isLight
                ? 'linear-gradient(135deg, #374151, #6b7280, #374151)'
                : 'linear-gradient(135deg, #ffffff, #a3a3a3, #ffffff)',
              animation: 'gradient-shift 3s ease infinite',
            }}
          />
        )}

        {/* Glow effect for available providers */}
        {provider.isAvailable && !isSelected && isHovered && (
          <div
            className="absolute -inset-[1px] rounded-xl opacity-50 blur-sm transition-opacity duration-300"
            style={{
              background: isLight
                ? 'linear-gradient(135deg, rgba(0,0,0,0.1), rgba(0,0,0,0.2))'
                : 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.2))',
            }}
          />
        )}

        {/* Card content */}
        <button
          onClick={onSelect}
          disabled={!provider.isAvailable}
          className={`relative w-full p-3 rounded-xl transition-all duration-300
            ${isLight
              ? isSelected
                ? 'bg-white border-2 border-gray-300 shadow-lg'
                : provider.isAvailable
                  ? 'bg-gray-50 border border-gray-200 hover:bg-gray-100 hover:border-gray-300 hover:shadow-md'
                  : 'bg-gray-100/50 border border-gray-200/50 opacity-50 cursor-not-allowed'
              : isSelected
                ? 'bg-gray-900 border-2 border-gray-600 shadow-lg shadow-white/5'
                : provider.isAvailable
                  ? 'bg-gray-900/50 border border-gray-800 hover:bg-gray-800 hover:border-gray-700 hover:shadow-md hover:shadow-white/5'
                  : 'bg-gray-900/30 border border-gray-800/50 opacity-50 cursor-not-allowed'
            }
            ${isSelected ? 'scale-[1.02]' : isHovered && provider.isAvailable ? 'scale-[1.01]' : ''}
          `}
        >
          {/* Icon with animation */}
          <div className="flex items-start justify-between mb-2">
            <div
              className={`p-2 rounded-lg transition-all duration-300
                ${isLight
                  ? isSelected
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-200 text-gray-700'
                  : isSelected
                    ? 'bg-white text-gray-900'
                    : 'bg-gray-800 text-gray-300'
                }
                ${isHovered && provider.isAvailable ? 'animate-pulse-glow' : ''}
              `}
            >
              <div className={`transition-transform duration-300 ${isHovered && provider.isAvailable ? 'scale-110' : ''}`}>
                {getProviderIcon(provider.id)}
              </div>
            </div>
            <StatusBadge isAvailable={provider.isAvailable} isLocal={provider.isLocal} />
          </div>

          {/* Provider name & icon */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{provider.icon}</span>
            <span
              className={`text-[12px] font-mono font-semibold tracking-wide ${
                isLight
                  ? isSelected
                    ? 'text-gray-900'
                    : 'text-gray-700'
                  : isSelected
                    ? 'text-white'
                    : 'text-gray-300'
              }`}
            >
              {provider.name}
            </span>
          </div>

          {/* Context size badge */}
          <div className="flex items-center gap-1.5 mb-2">
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                isLight ? 'bg-gray-200 text-gray-600' : 'bg-gray-800 text-gray-400'
              }`}
            >
              {(provider.maxContextTokens / 1000).toFixed(0)}K
            </span>
            {provider.isLocal && (
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                  isLight ? 'bg-blue-100 text-blue-600' : 'bg-blue-900/50 text-blue-400'
                }`}
              >
                LOCAL
              </span>
            )}
          </div>

          {/* Model dropdown trigger */}
          {hasMultipleModels && provider.isAvailable && (
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDropdownOpen(!isDropdownOpen);
                }}
                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-[10px] font-mono
                  transition-all duration-200 border
                  ${isLight
                    ? 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200 hover:border-gray-300'
                    : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:bg-gray-800 hover:border-gray-600'
                  }
                `}
              >
                <span className="truncate">
                  {PROVIDER_MODELS[provider.id]?.find((m) => m.id === selectedModel)?.name ||
                    PROVIDER_MODELS[provider.id]?.[0]?.name ||
                    'Select model'}
                </span>
                <ChevronDown
                  size={12}
                  className={`flex-shrink-0 transition-transform duration-200 ${
                    isDropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              <ModelDropdown
                provider={provider.id}
                isOpen={isDropdownOpen}
                onClose={() => setIsDropdownOpen(false)}
                onSelectModel={onModelSelect}
                selectedModel={selectedModel}
              />
            </div>
          )}
        </button>
      </div>
    </Tooltip>
  );
};

// ============================================================================
// ANIMATED DIVIDER COMPONENT
// ============================================================================

const AnimatedDivider: React.FC<{ vertical?: boolean }> = ({ vertical }) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  if (vertical) {
    return (
      <div
        className={`w-px h-full relative overflow-hidden ${
          isLight ? 'bg-gray-200' : 'bg-gray-800'
        }`}
      >
        <div
          className="absolute inset-0 w-full"
          style={{
            background: isLight
              ? 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.1), transparent)'
              : 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.1), transparent)',
            animation: 'divider-flow 2s ease-in-out infinite',
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={`h-px w-full relative overflow-hidden ${
        isLight ? 'bg-gray-200' : 'bg-gray-800'
      }`}
    >
      <div
        className="absolute inset-0 h-full"
        style={{
          background: isLight
            ? 'linear-gradient(to right, transparent, rgba(0,0,0,0.1), transparent)'
            : 'linear-gradient(to right, transparent, rgba(255,255,255,0.1), transparent)',
          animation: 'divider-flow-horizontal 2s ease-in-out infinite',
        }}
      />
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const ModelSelector: React.FC<ModelSelectorProps> = ({
  onSelect,
  selectedProvider = 'claude',
  compact = false,
}) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  const [internalSelectedProvider, setInternalSelectedProvider] = useState<CLIProvider>(selectedProvider);
  const [selectedModels, setSelectedModels] = useState<Record<CLIProvider, string>>(() => {
    // Initialize with default models
    const defaults: Record<CLIProvider, string> = {} as Record<CLIProvider, string>;
    Object.keys(PROVIDER_MODELS).forEach((key) => {
      const provider = key as CLIProvider;
      const defaultModel = PROVIDER_MODELS[provider]?.find((m) => m.isDefault);
      defaults[provider] = defaultModel?.id || PROVIDER_MODELS[provider]?.[0]?.id || '';
    });
    return defaults;
  });

  const availableProviders = Object.values(PROVIDERS).filter((p) => p.isAvailable);
  const unavailableProviders = Object.values(PROVIDERS).filter((p) => !p.isAvailable);
  const allProviders = [...availableProviders, ...unavailableProviders];

  const handleProviderSelect = useCallback((provider: CLIProvider) => {
    if (!PROVIDERS[provider].isAvailable) return;
    setInternalSelectedProvider(provider);
    onSelect(provider);
  }, [onSelect]);

  const handleModelSelect = useCallback((provider: CLIProvider, modelId: string) => {
    setSelectedModels((prev) => ({
      ...prev,
      [provider]: modelId,
    }));
  }, []);

  // CSS for animations
  useEffect(() => {
    const styleId = 'model-selector-animations';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes gradient-shift {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; }
        }
        @keyframes divider-flow {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
        @keyframes divider-flow-horizontal {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  return (
    <div className="glass-card p-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div
          className={`p-1.5 rounded-md ${
            isLight ? 'bg-gray-100' : 'bg-gray-800'
          }`}
        >
          <Bot size={14} className={isLight ? 'text-gray-600' : 'text-gray-400'} />
        </div>
        <span
          className={`text-[10px] font-mono tracking-wider uppercase ${
            isLight ? 'text-gray-600' : 'text-gray-400'
          }`}
        >
          AI Provider
        </span>
        <div className="flex-1" />
        <span
          className={`text-[9px] font-mono ${
            isLight ? 'text-gray-400' : 'text-gray-500'
          }`}
        >
          {availableProviders.length}/{allProviders.length} online
        </span>
      </div>

      <AnimatedDivider />

      {/* Provider Grid */}
      <div
        className={`grid gap-2 mt-3 ${
          compact
            ? 'grid-cols-2'
            : 'grid-cols-2 md:grid-cols-3'
        }`}
      >
        {allProviders.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            isSelected={internalSelectedProvider === provider.id}
            onSelect={() => handleProviderSelect(provider.id)}
            onModelSelect={(modelId) => handleModelSelect(provider.id, modelId)}
            selectedModel={selectedModels[provider.id] || ''}
          />
        ))}
      </div>

      {/* Selected provider info */}
      {internalSelectedProvider && (
        <>
          <AnimatedDivider />
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">{PROVIDERS[internalSelectedProvider].icon}</span>
              <span
                className={`text-[11px] font-mono font-medium ${
                  isLight ? 'text-gray-700' : 'text-gray-300'
                }`}
              >
                {PROVIDERS[internalSelectedProvider].name}
              </span>
            </div>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                isLight ? 'bg-green-100 text-green-700' : 'bg-green-900/30 text-green-400'
              }`}
            >
              SELECTED
            </span>
          </div>
        </>
      )}
    </div>
  );
};

export default ModelSelector;
