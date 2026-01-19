import React, { useState, useEffect, useRef } from 'react';
import {
  Settings, Zap, Shield, Volume2, VolumeX, Bell, BellOff, Eye, EyeOff,
  Sparkles, X, Search, Database, Globe, ChevronDown, Check, ChevronRight,
  Cpu, Palette, Compass, Save, RotateCcw
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useSoundEffects } from '../hooks/useSoundEffects';
import { CLIProvider } from '../contexts/TabContext';

interface SettingItem {
  id: string;
  label: string;
  description: string;
  iconOn: React.ElementType;
  iconOff: React.ElementType;
  defaultValue: boolean;
  rune: string;
  category: 'core' | 'interface' | 'search';
}

// Custom SVG icon components for search providers
const GoogleIcon: React.FC<{ className?: string; size?: number }> = ({ className, size = 18 }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 48 48">
    <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
    <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
    <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/>
    <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/>
  </svg>
);

const StackOverflowIcon: React.FC<{ className?: string; size?: number }> = ({ className, size = 18 }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 48 48">
    <path fill="#FF9800" d="M32,40H8c-2.2,0-4-1.8-4-4V22h4v14h24V22h4v14C40,38.2,38.2,40,32,40z"/>
    <path fill="#FF9800" d="M12,32h16v4H12V32z"/>
    <path fill="#F57C00" d="M12.3,25.9l15.7,3.3l0.8-4l-15.7-3.3L12.3,25.9z"/>
    <path fill="#EF6C00" d="M15.1,19.3l14.5,6.8l1.7-3.6l-14.5-6.8L15.1,19.3z"/>
    <path fill="#E65100" d="M20.4,13.3l12.3,10.3l2.6-3.1L23,10.2L20.4,13.3z"/>
    <path fill="#BF360C" d="M28.4,9l9,13l3.2-2.3l-9-13L28.4,9z"/>
  </svg>
);

const CurrentDataIcon: React.FC<{ className?: string; size?: number }> = ({ className, size = 18 }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 48 48">
    <circle cx="24" cy="24" r="20" fill="#00BCD4"/>
    <path fill="#FFFFFF" d="M24,10c-7.7,0-14,6.3-14,14s6.3,14,14,14s14-6.3,14-14S31.7,10,24,10z M24,34c-5.5,0-10-4.5-10-10s4.5-10,10-10s10,4.5,10,10S29.5,34,24,34z"/>
    <path fill="#FFFFFF" d="M25,18h-3v8l6.5,4l1.5-2.5l-5-3V18z"/>
    <circle cx="24" cy="24" r="2" fill="#FFFFFF"/>
    <path fill="#E0F7FA" d="M36,12l-3,3l2,2l3-3L36,12z"/>
    <path fill="#E0F7FA" d="M39,17h-4v3h4V17z"/>
  </svg>
);

// ============================================================================
// AI PROVIDER DEFINITIONS
// ============================================================================

interface AIProviderOption {
  id: CLIProvider;
  name: string;
  description: string;
  icon: string;
  color: string;
  status: 'active' | 'available' | 'placeholder';
}

const AI_PROVIDERS: AIProviderOption[] = [
  {
    id: 'claude',
    name: 'Claude',
    description: 'Claude Opus 4.5 + MCP',
    icon: '🤖',
    color: '#f59e0b',
    status: 'active',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    description: '2M context, Multimodal',
    icon: '🔵',
    color: '#4285f4',
    status: 'active',
  },
  {
    id: 'jules',
    name: 'Jules',
    description: 'Async background tasks',
    icon: '🟣',
    color: '#a855f7',
    status: 'active',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: 'Local models ($0)',
    icon: '🦙',
    color: '#22c55e',
    status: 'available',
  },
  {
    id: 'codex',
    name: 'Codex',
    description: 'GPT-5-Codex (placeholder)',
    icon: '🟢',
    color: '#10b981',
    status: 'placeholder',
  },
  {
    id: 'grok',
    name: 'Grok',
    description: 'xAI Real-time (placeholder)',
    icon: '⚫',
    color: '#6b7280',
    status: 'placeholder',
  },
];

const SETTINGS: SettingItem[] = [
  // Core settings
  {
    id: 'yolo_mode',
    label: 'YOLO Mode',
    description: 'Full autonomy without confirmations',
    iconOn: Zap,
    iconOff: Shield,
    defaultValue: true,
    rune: 'ᛉ',
    category: 'core',
  },
  {
    id: 'sound_effects',
    label: 'Sound Effects',
    description: 'Interface sound effects',
    iconOn: Volume2,
    iconOff: VolumeX,
    defaultValue: true,
    rune: 'ᚹ',
    category: 'core',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    description: 'System notifications',
    iconOn: Bell,
    iconOff: BellOff,
    defaultValue: true,
    rune: 'ᚾ',
    category: 'core',
  },
  // Interface settings
  {
    id: 'animations',
    label: 'Animations',
    description: 'Visual effects and animations',
    iconOn: Sparkles,
    iconOff: Eye,
    defaultValue: true,
    rune: 'ᛊ',
    category: 'interface',
  },
  {
    id: 'auto_scroll',
    label: 'Auto-scroll',
    description: 'Automatic chat scrolling',
    iconOn: Eye,
    iconOff: EyeOff,
    defaultValue: true,
    rune: 'ᛏ',
    category: 'interface',
  },
  // Search settings
  {
    id: 'google_search',
    label: 'Google Search',
    description: 'Search via Google',
    iconOn: Globe,
    iconOff: Search,
    defaultValue: true,
    rune: 'ᚷ',
    category: 'search',
  },
  {
    id: 'stackoverflow_search',
    label: 'StackOverflow',
    description: 'Search on StackOverflow',
    iconOn: Database,
    iconOff: Search,
    defaultValue: true,
    rune: 'ᛋ',
    category: 'search',
  },
  {
    id: 'current_data',
    label: 'Current Data',
    description: 'Fetch current data',
    iconOn: Database,
    iconOff: Database,
    defaultValue: true,
    rune: 'ᛞ',
    category: 'search',
  },
];

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose }) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const [settings, setSettings] = useState<Record<string, boolean>>({});
  const [pendingSettings, setPendingSettings] = useState<Record<string, boolean>>({});
  const [selectedProvider, setSelectedProvider] = useState<CLIProvider>('claude');
  const [pendingProvider, setPendingProvider] = useState<CLIProvider>('claude');
  const [isProviderDropdownOpen, setIsProviderDropdownOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['ai', 'core', 'interface', 'search']));
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const { playToggle, playOpenPanel, playClosePanel, playClick } = useSoundEffects();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load settings from localStorage
  useEffect(() => {
    const loaded: Record<string, boolean> = {};
    SETTINGS.forEach(setting => {
      const stored = localStorage.getItem(`hydra_${setting.id}`);
      loaded[setting.id] = stored !== null ? stored === 'true' : setting.defaultValue;
    });
    setSettings(loaded);
    setPendingSettings(loaded);

    // Load selected AI provider
    const storedProvider = localStorage.getItem('hydra_ai_provider') as CLIProvider | null;
    if (storedProvider && AI_PROVIDERS.some(p => p.id === storedProvider)) {
      setSelectedProvider(storedProvider);
      setPendingProvider(storedProvider);
    }
  }, []);

  // Play open sound when panel opens
  useEffect(() => {
    if (isOpen) {
      setIsClosing(false);
      playOpenPanel();
    }
  }, [isOpen, playOpenPanel]);

  // Check for changes
  useEffect(() => {
    const settingsChanged = Object.keys(pendingSettings).some(
      key => pendingSettings[key] !== settings[key]
    );
    const providerChanged = pendingProvider !== selectedProvider;
    setHasChanges(settingsChanged || providerChanged);
  }, [pendingSettings, settings, pendingProvider, selectedProvider]);

  const togglePendingSetting = (id: string) => {
    const newValue = !pendingSettings[id];
    setPendingSettings(prev => ({ ...prev, [id]: newValue }));

    // Play toggle sound (except for sound_effects itself)
    if (id !== 'sound_effects') {
      playToggle(newValue);
    }
  };

  const handleSave = () => {
    // Save all pending settings
    Object.keys(pendingSettings).forEach(id => {
      localStorage.setItem(`hydra_${id}`, String(pendingSettings[id]));

      // Dispatch custom event
      window.dispatchEvent(new CustomEvent('hydra-settings-change', {
        detail: { id, value: pendingSettings[id] }
      }));

      // Special handling for yolo_mode
      if (id === 'yolo_mode') {
        localStorage.setItem('hydra_yolo', String(pendingSettings[id]));
      }
    });
    setSettings(pendingSettings);

    // Save provider
    if (pendingProvider !== selectedProvider) {
      localStorage.setItem('hydra_ai_provider', pendingProvider);
      window.dispatchEvent(new CustomEvent('hydra-provider-change', { detail: { provider: pendingProvider } }));
      setSelectedProvider(pendingProvider);
    }

    playClick();
    handleClose();
  };

  const handleReset = () => {
    setPendingSettings(settings);
    setPendingProvider(selectedProvider);
    playClick();
  };

  const handleClose = () => {
    setIsClosing(true);
    playClosePanel();
    setIsProviderDropdownOpen(false);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
      setSearchQuery('');
    }, 200);
  };

  const handlePendingProviderChange = (provider: CLIProvider) => {
    const providerInfo = AI_PROVIDERS.find(p => p.id === provider);
    if (providerInfo?.status === 'placeholder') {
      return;
    }
    setPendingProvider(provider);
    setIsProviderDropdownOpen(false);
    playToggle(true);
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
    playClick();
  };

  // Filter settings based on search
  const filterSettings = (items: SettingItem[]) => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter(
      item =>
        item.label.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query)
    );
  };

  // Highlight matching text
  const highlightText = (text: string) => {
    if (!searchQuery.trim()) return text;
    const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <span key={i} className="bg-gradient-to-r from-amber-400/40 to-orange-400/40 rounded px-0.5">
          {part}
        </span>
      ) : part
    );
  };

  if (!isOpen) return null;

  // Get custom icon for search settings
  const getCustomIcon = (id: string, isEnabled: boolean) => {
    const iconClass = isEnabled
      ? isLight ? 'text-neutral-700' : 'text-neutral-200'
      : isLight ? 'text-neutral-400' : 'text-neutral-500';

    switch (id) {
      case 'google_search':
        return <GoogleIcon className={iconClass} size={18} />;
      case 'stackoverflow_search':
        return <StackOverflowIcon className={iconClass} size={18} />;
      case 'current_data':
        return <CurrentDataIcon className={iconClass} size={18} />;
      default:
        return null;
    }
  };

  const coreSettings = filterSettings(SETTINGS.filter(s => s.category === 'core'));
  const interfaceSettings = filterSettings(SETTINGS.filter(s => s.category === 'interface'));
  const searchSettings = filterSettings(SETTINGS.filter(s => s.category === 'search'));

  // Custom Toggle Switch Component
  const ToggleSwitch: React.FC<{ isEnabled: boolean; onChange: () => void }> = ({ isEnabled, onChange }) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={`relative w-14 h-7 rounded-full transition-all duration-300 ${
        isEnabled
          ? 'bg-gradient-to-r from-neutral-600 to-neutral-500'
          : isLight
            ? 'bg-neutral-200'
            : 'bg-neutral-700'
      }`}
      style={{
        boxShadow: isEnabled
          ? `0 0 20px ${isLight ? 'rgba(64, 64, 64, 0.3)' : 'rgba(255, 255, 255, 0.15)'}, inset 0 1px 2px rgba(0,0,0,0.2)`
          : 'inset 0 2px 4px rgba(0,0,0,0.1)'
      }}
    >
      {/* Track glow */}
      {isEnabled && (
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-white/10 to-transparent" />
      )}
      {/* Knob */}
      <div
        className={`absolute top-1 w-5 h-5 rounded-full transition-all duration-300 transform ${
          isEnabled ? 'translate-x-8' : 'translate-x-1'
        }`}
        style={{
          background: isEnabled
            ? 'linear-gradient(135deg, #ffffff 0%, #e5e5e5 100%)'
            : isLight
              ? 'linear-gradient(135deg, #d4d4d4 0%, #a3a3a3 100%)'
              : 'linear-gradient(135deg, #737373 0%, #525252 100%)',
          boxShadow: isEnabled
            ? '0 2px 8px rgba(0,0,0,0.3), 0 0 12px rgba(255,255,255,0.2)'
            : '0 2px 4px rgba(0,0,0,0.2)'
        }}
      />
    </button>
  );

  const renderSettingItem = (setting: SettingItem) => {
    const isEnabled = pendingSettings[setting.id] ?? setting.defaultValue;
    const Icon = isEnabled ? setting.iconOn : setting.iconOff;
    const customIcon = getCustomIcon(setting.id, isEnabled);

    return (
      <div
        key={setting.id}
        className={`group flex items-center justify-between p-3 rounded-lg border transition-all duration-300 cursor-pointer transform hover:scale-[1.01] ${
          isEnabled
            ? isLight
              ? 'bg-gradient-to-r from-neutral-100 to-neutral-50 border-neutral-300 hover:border-neutral-400'
              : 'bg-gradient-to-r from-neutral-800/60 to-neutral-900/60 border-neutral-600 hover:border-neutral-500'
            : isLight
              ? 'bg-neutral-50/50 border-neutral-200 hover:border-neutral-300'
              : 'bg-neutral-900/30 border-neutral-700/50 hover:border-neutral-600'
        }`}
        onClick={() => togglePendingSetting(setting.id)}
        style={{
          boxShadow: isEnabled
            ? isLight
              ? '0 4px 12px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.8)'
              : '0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)'
            : 'none'
        }}
      >
        <div className="flex items-center gap-3">
          {/* Rune with glow */}
          <span className={`text-lg font-mono transition-all duration-300 ${
            isEnabled
              ? isLight ? 'text-neutral-700' : 'text-neutral-200'
              : isLight ? 'text-neutral-400' : 'text-neutral-600'
          }`}
          style={{
            textShadow: isEnabled ? `0 0 8px ${isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.3)'}` : 'none'
          }}>
            {setting.rune}
          </span>

          {/* Icon with animation */}
          <div className={`transition-transform duration-300 ${isEnabled ? 'scale-110' : 'scale-100'}`}>
            {customIcon || (
              <Icon
                size={18}
                className={`transition-all duration-300 ${
                  isEnabled
                    ? isLight ? 'text-neutral-700' : 'text-neutral-200'
                    : isLight ? 'text-neutral-400' : 'text-neutral-500'
                }`}
              />
            )}
          </div>

          {/* Labels */}
          <div>
            <div className={`text-sm font-mono font-semibold tracking-wider transition-colors duration-300 ${
              isEnabled
                ? isLight ? 'text-neutral-800' : 'text-neutral-100'
                : isLight ? 'text-neutral-500' : 'text-neutral-400'
            }`}>
              {highlightText(setting.label)}
            </div>
            <div className={`text-[10px] font-mono transition-colors duration-300 ${
              isLight ? 'text-neutral-500' : 'text-neutral-500'
            }`}>
              {highlightText(setting.description)}
            </div>
          </div>
        </div>

        {/* Custom Toggle Switch */}
        <ToggleSwitch isEnabled={isEnabled} onChange={() => togglePendingSetting(setting.id)} />
      </div>
    );
  };

  // AI Provider selector component
  const renderProviderSelector = () => {
    const currentProvider = AI_PROVIDERS.find(p => p.id === pendingProvider) || AI_PROVIDERS[0];

    return (
      <div className="relative">
        <button
          onClick={() => {
            setIsProviderDropdownOpen(!isProviderDropdownOpen);
            playClick();
          }}
          className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all duration-300 ${
            isLight
              ? 'bg-gradient-to-r from-neutral-100 to-neutral-50 border-neutral-300 hover:border-neutral-400'
              : 'bg-gradient-to-r from-neutral-800/60 to-neutral-900/60 border-neutral-600 hover:border-neutral-500'
          }`}
          style={{
            boxShadow: isLight
              ? '0 4px 12px rgba(0,0,0,0.08)'
              : '0 4px 12px rgba(0,0,0,0.3)'
          }}
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">{currentProvider.icon}</span>
            <div className="text-left">
              <div className={`text-sm font-mono font-semibold tracking-wider ${
                isLight ? 'text-neutral-800' : 'text-neutral-100'
              }`}>
                {currentProvider.name}
              </div>
              <div className={`text-[10px] font-mono ${
                isLight ? 'text-neutral-500' : 'text-neutral-500'
              }`}>
                {currentProvider.description}
              </div>
            </div>
          </div>
          <ChevronDown
            size={18}
            className={`transition-transform duration-300 ${
              isProviderDropdownOpen ? 'rotate-180' : ''
            } ${isLight ? 'text-neutral-600' : 'text-neutral-400'}`}
          />
        </button>

        {/* Dropdown menu with animation */}
        <div
          className={`absolute top-full left-0 right-0 mt-2 rounded-lg border overflow-hidden z-50 transition-all duration-300 origin-top ${
            isProviderDropdownOpen
              ? 'opacity-100 scale-y-100'
              : 'opacity-0 scale-y-0 pointer-events-none'
          } ${
            isLight
              ? 'bg-white/95 border-neutral-300 shadow-xl'
              : 'bg-neutral-900/95 border-neutral-700 shadow-2xl'
          }`}
          style={{
            backdropFilter: 'blur(12px)'
          }}
        >
          {AI_PROVIDERS.map((provider, index) => {
            const isSelected = provider.id === pendingProvider;
            const isDisabled = provider.status === 'placeholder';

            return (
              <button
                key={provider.id}
                onClick={() => handlePendingProviderChange(provider.id)}
                disabled={isDisabled}
                className={`w-full flex items-center justify-between p-3 transition-all duration-200 ${
                  isDisabled
                    ? 'opacity-40 cursor-not-allowed'
                    : isSelected
                      ? isLight
                        ? 'bg-neutral-100'
                        : 'bg-neutral-800'
                      : isLight
                        ? 'hover:bg-neutral-50'
                        : 'hover:bg-neutral-800/50'
                } ${
                  index < AI_PROVIDERS.length - 1
                    ? isLight ? 'border-b border-neutral-200' : 'border-b border-neutral-800'
                    : ''
                }`}
                style={{
                  transitionDelay: isProviderDropdownOpen ? `${index * 30}ms` : '0ms'
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{provider.icon}</span>
                  <div className="text-left">
                    <div className={`text-xs font-mono font-semibold tracking-wider flex items-center gap-2 ${
                      isDisabled
                        ? isLight ? 'text-neutral-400' : 'text-neutral-600'
                        : isLight ? 'text-neutral-800' : 'text-neutral-200'
                    }`}>
                      {provider.name}
                      {provider.status === 'placeholder' && (
                        <span className={`text-[8px] px-1.5 py-0.5 rounded font-mono ${
                          isLight ? 'bg-neutral-200 text-neutral-500' : 'bg-neutral-800 text-neutral-500'
                        }`}>
                          SOON
                        </span>
                      )}
                      {provider.status === 'available' && (
                        <span className={`text-[8px] px-1.5 py-0.5 rounded font-mono ${
                          isLight ? 'bg-green-100 text-green-600' : 'bg-green-900/30 text-green-500'
                        }`}>
                          LOCAL
                        </span>
                      )}
                    </div>
                    <div className={`text-[9px] font-mono ${
                      isDisabled
                        ? isLight ? 'text-neutral-400' : 'text-neutral-600'
                        : isLight ? 'text-neutral-500' : 'text-neutral-500'
                    }`}>
                      {provider.description}
                    </div>
                  </div>
                </div>
                {isSelected && !isDisabled && (
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                    isLight ? 'bg-neutral-800' : 'bg-white'
                  }`}>
                    <Check size={12} className={isLight ? 'text-white' : 'text-neutral-900'} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // Collapsible section component
  const renderSection = (
    sectionKey: string,
    title: string,
    SectionIcon: React.ElementType,
    rune: string,
    items: SettingItem[],
    customContent?: React.ReactNode
  ) => {
    const isExpanded = expandedSections.has(sectionKey);
    const hasItems = customContent || items.length > 0;

    if (!hasItems && searchQuery) return null;

    return (
      <div className="mb-3">
        {/* Section Header */}
        <button
          onClick={() => toggleSection(sectionKey)}
          className={`w-full flex items-center justify-between p-2 rounded-lg transition-all duration-300 ${
            isLight
              ? 'hover:bg-neutral-100'
              : 'hover:bg-neutral-800/50'
          }`}
        >
          <div className="flex items-center gap-2">
            <SectionIcon size={14} className={isLight ? 'text-neutral-600' : 'text-neutral-400'} />
            <span className={`text-[10px] font-mono tracking-wider uppercase ${
              isLight ? 'text-neutral-600' : 'text-neutral-400'
            }`}>
              {rune} {title} {rune}
            </span>
            {items.length > 0 && (
              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                isLight ? 'bg-neutral-200 text-neutral-500' : 'bg-neutral-800 text-neutral-500'
              }`}>
                {items.length}
              </span>
            )}
          </div>
          <ChevronRight
            size={14}
            className={`transition-transform duration-300 ${
              isExpanded ? 'rotate-90' : ''
            } ${isLight ? 'text-neutral-400' : 'text-neutral-600'}`}
          />
        </button>

        {/* Gradient Divider */}
        <div className={`h-px mx-2 mb-2 ${
          isLight
            ? 'bg-gradient-to-r from-transparent via-neutral-300 to-transparent'
            : 'bg-gradient-to-r from-transparent via-neutral-700 to-transparent'
        }`} />

        {/* Section Content with animation */}
        <div
          className={`overflow-hidden transition-all duration-300 ease-out ${
            isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="space-y-2 px-1">
            {customContent || items.map(renderSettingItem)}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-300 ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
      onClick={handleClose}
    >
      {/* Backdrop with blur and gradient */}
      <div
        className={`absolute inset-0 transition-all duration-300 ${
          isClosing ? 'backdrop-blur-none' : 'backdrop-blur-md'
        }`}
        style={{
          background: isLight
            ? 'linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(245,245,245,0.9) 100%)'
            : 'linear-gradient(135deg, rgba(0,0,0,0.8) 0%, rgba(23,23,23,0.9) 100%)'
        }}
      />

      {/* Panel with entrance animation */}
      <div
        ref={panelRef}
        className={`relative w-full max-w-md mx-4 rounded-xl border overflow-hidden max-h-[85vh] flex flex-col transition-all duration-300 ${
          isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
        } ${
          isLight
            ? 'bg-white/95 border-neutral-300'
            : 'bg-neutral-900/95 border-neutral-700'
        }`}
        onClick={e => e.stopPropagation()}
        style={{
          backdropFilter: 'blur(20px)',
          boxShadow: isLight
            ? '0 25px 80px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0,0,0,0.05)'
            : '0 25px 80px rgba(0, 0, 0, 0.5), 0 0 60px rgba(255, 255, 255, 0.03)',
        }}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b shrink-0 ${
          isLight ? 'border-neutral-200 bg-neutral-50/50' : 'border-neutral-800 bg-neutral-900/50'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${
              isLight ? 'bg-neutral-200' : 'bg-neutral-800'
            }`}>
              <Settings className={isLight ? 'text-neutral-700' : 'text-neutral-300'} size={18} />
            </div>
            <div>
              <h2 className={`font-mono text-sm font-bold tracking-wider uppercase ${
                isLight ? 'text-neutral-800' : 'text-neutral-100'
              }`}>
                Settings
              </h2>
              <p className={`text-[9px] font-mono ${
                isLight ? 'text-neutral-500' : 'text-neutral-500'
              }`}>
                Configure your experience
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            onMouseEnter={() => playClick()}
            className={`p-2 rounded-lg transition-all duration-200 hover:scale-105 ${
              isLight
                ? 'hover:bg-neutral-200 text-neutral-600'
                : 'hover:bg-neutral-800 text-neutral-400'
            }`}
          >
            <X size={18} />
          </button>
        </div>

        {/* Search Bar */}
        <div className={`px-4 py-3 border-b shrink-0 ${
          isLight ? 'border-neutral-200' : 'border-neutral-800'
        }`}>
          <div className={`relative flex items-center rounded-lg border transition-all duration-300 ${
            isSearchFocused
              ? isLight
                ? 'border-neutral-400 bg-white shadow-lg ring-2 ring-neutral-200'
                : 'border-neutral-500 bg-neutral-800 shadow-lg ring-2 ring-neutral-700'
              : isLight
                ? 'border-neutral-200 bg-neutral-50'
                : 'border-neutral-700 bg-neutral-800/50'
          }`}>
            <Search
              size={16}
              className={`ml-3 transition-all duration-300 ${
                isSearchFocused
                  ? isLight ? 'text-neutral-700 scale-110' : 'text-neutral-300 scale-110'
                  : isLight ? 'text-neutral-400' : 'text-neutral-500'
              }`}
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              placeholder="Search settings..."
              className={`w-full px-3 py-2 bg-transparent text-sm font-mono outline-none ${
                isLight ? 'text-neutral-800 placeholder-neutral-400' : 'text-neutral-200 placeholder-neutral-500'
              }`}
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  searchInputRef.current?.focus();
                }}
                className={`mr-2 p-1 rounded transition-colors ${
                  isLight ? 'hover:bg-neutral-200' : 'hover:bg-neutral-700'
                }`}
              >
                <X size={14} className={isLight ? 'text-neutral-500' : 'text-neutral-400'} />
              </button>
            )}
          </div>
        </div>

        {/* Settings list - scrollable */}
        <div className="p-4 overflow-y-auto flex-1">
          {renderSection('ai', 'AI Model', Cpu, '⚔', [], renderProviderSelector())}
          {renderSection('core', 'Core', Zap, '◆', coreSettings)}
          {renderSection('interface', 'Interface', Palette, '◇', interfaceSettings)}
          {renderSection('search', 'Search', Compass, '◈', searchSettings)}

          {/* No results message */}
          {searchQuery && coreSettings.length === 0 && interfaceSettings.length === 0 && searchSettings.length === 0 && (
            <div className={`text-center py-8 ${
              isLight ? 'text-neutral-400' : 'text-neutral-600'
            }`}>
              <Search size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm font-mono">No settings found for "{searchQuery}"</p>
            </div>
          )}
        </div>

        {/* Footer with Action Buttons */}
        <div className={`p-4 border-t shrink-0 ${
          isLight ? 'border-neutral-200 bg-neutral-50/50' : 'border-neutral-800 bg-neutral-900/50'
        }`}>
          <div className="flex items-center justify-between gap-3">
            {/* Reset Button (Ghost style) */}
            <button
              onClick={handleReset}
              disabled={!hasChanges}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-xs uppercase tracking-wider transition-all duration-200 ${
                hasChanges
                  ? isLight
                    ? 'text-neutral-600 hover:bg-neutral-200 hover:text-neutral-800'
                    : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                  : isLight
                    ? 'text-neutral-300 cursor-not-allowed'
                    : 'text-neutral-700 cursor-not-allowed'
              }`}
            >
              <RotateCcw size={14} />
              Reset
            </button>

            {/* Save Button (Gradient style) */}
            <button
              onClick={handleSave}
              className={`flex items-center gap-2 px-6 py-2 rounded-lg font-mono text-xs uppercase tracking-wider transition-all duration-300 transform hover:scale-105 ${
                hasChanges
                  ? 'bg-gradient-to-r from-neutral-700 to-neutral-600 text-white hover:from-neutral-600 hover:to-neutral-500 shadow-lg'
                  : isLight
                    ? 'bg-neutral-200 text-neutral-800'
                    : 'bg-neutral-700 text-neutral-200'
              }`}
              style={{
                boxShadow: hasChanges
                  ? '0 4px 20px rgba(0,0,0,0.3), 0 0 30px rgba(255,255,255,0.05)'
                  : 'none'
              }}
            >
              <Save size={14} />
              {hasChanges ? 'Save Changes' : 'Done'}
            </button>
          </div>

          {/* Version info */}
          <div className={`text-center mt-3 text-[9px] font-mono tracking-wider ${
            isLight ? 'text-neutral-400' : 'text-neutral-600'
          }`}>
            REGIS 10.6.1 // SETTINGS
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
