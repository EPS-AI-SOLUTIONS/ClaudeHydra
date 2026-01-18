import React, { useState, useEffect } from 'react';
import { Settings, Zap, Shield, Volume2, VolumeX, Bell, BellOff, Eye, EyeOff, Sparkles, X, Search, Database, Globe } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useSoundEffects } from '../hooks/useSoundEffects';

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

const SETTINGS: SettingItem[] = [
  // Core settings
  {
    id: 'yolo_mode',
    label: 'YOLO Mode',
    description: 'Pełna autonomia bez potwierdzeń',
    iconOn: Zap,
    iconOff: Shield,
    defaultValue: true,
    rune: 'ᛉ',
    category: 'core',
  },
  {
    id: 'sound_effects',
    label: 'Dźwięki',
    description: 'Efekty dźwiękowe interfejsu',
    iconOn: Volume2,
    iconOff: VolumeX,
    defaultValue: true,
    rune: 'ᚹ',
    category: 'core',
  },
  {
    id: 'notifications',
    label: 'Powiadomienia',
    description: 'Powiadomienia systemowe',
    iconOn: Bell,
    iconOff: BellOff,
    defaultValue: true,
    rune: 'ᚾ',
    category: 'core',
  },
  // Interface settings
  {
    id: 'animations',
    label: 'Animacje',
    description: 'Efekty wizualne i animacje',
    iconOn: Sparkles,
    iconOff: Eye,
    defaultValue: true,
    rune: 'ᛊ',
    category: 'interface',
  },
  {
    id: 'auto_scroll',
    label: 'Auto-scroll',
    description: 'Automatyczne przewijanie chatu',
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
    description: 'Wyszukiwanie przez Google',
    iconOn: Globe,
    iconOff: Search,
    defaultValue: true,
    rune: 'ᚷ',
    category: 'search',
  },
  {
    id: 'stackoverflow_search',
    label: 'StackOverflow',
    description: 'Wyszukiwanie na StackOverflow',
    iconOn: Database,
    iconOff: Search,
    defaultValue: true,
    rune: 'ᛋ',
    category: 'search',
  },
  {
    id: 'current_data',
    label: 'Aktualne dane',
    description: 'Pobieranie aktualnych danych',
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
  const { playToggle, playOpenPanel, playClosePanel, playClick } = useSoundEffects();

  // Load settings from localStorage
  useEffect(() => {
    const loaded: Record<string, boolean> = {};
    SETTINGS.forEach(setting => {
      const stored = localStorage.getItem(`hydra_${setting.id}`);
      loaded[setting.id] = stored !== null ? stored === 'true' : setting.defaultValue;
    });
    setSettings(loaded);
  }, []);

  // Play open sound when panel opens
  useEffect(() => {
    if (isOpen) {
      playOpenPanel();
    }
  }, [isOpen, playOpenPanel]);

  const toggleSetting = (id: string) => {
    const newValue = !settings[id];
    setSettings(prev => ({ ...prev, [id]: newValue }));
    localStorage.setItem(`hydra_${id}`, String(newValue));

    // Play toggle sound (except for sound_effects itself to avoid confusing feedback)
    if (id !== 'sound_effects') {
      playToggle(newValue);
    }

    // Dispatch custom event for same-window listeners
    window.dispatchEvent(new CustomEvent('hydra-settings-change', { detail: { id, value: newValue } }));

    // Special handling for yolo_mode (legacy key)
    if (id === 'yolo_mode') {
      localStorage.setItem('hydra_yolo', String(newValue));
    }
  };

  const handleClose = () => {
    playClosePanel();
    onClose();
  };

  if (!isOpen) return null;

  // Get custom icon for search settings
  const getCustomIcon = (id: string, isEnabled: boolean) => {
    const iconClass = isEnabled
      ? isLight ? 'text-amber-600' : 'text-amber-500'
      : isLight ? 'text-slate-400' : 'text-slate-500';

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

  const coreSettings = SETTINGS.filter(s => s.category === 'core');
  const interfaceSettings = SETTINGS.filter(s => s.category === 'interface');
  const searchSettings = SETTINGS.filter(s => s.category === 'search');

  const renderSettingItem = (setting: SettingItem) => {
    const isEnabled = settings[setting.id] ?? setting.defaultValue;
    const Icon = isEnabled ? setting.iconOn : setting.iconOff;
    const customIcon = getCustomIcon(setting.id, isEnabled);

    return (
      <div
        key={setting.id}
        className={`flex items-center justify-between p-3 rounded-lg border transition-all duration-300 cursor-pointer ${
          isEnabled
            ? isLight
              ? 'bg-amber-100/60 border-amber-400/40 hover:border-amber-500/60'
              : 'bg-amber-900/20 border-amber-500/30 hover:border-amber-400/50'
            : isLight
              ? 'bg-slate-100/60 border-slate-300/40 hover:border-slate-400/60'
              : 'bg-slate-800/20 border-slate-600/30 hover:border-slate-500/50'
        }`}
        onClick={() => toggleSetting(setting.id)}
      >
        <div className="flex items-center gap-3">
          {/* Rune */}
          <span className={`text-lg ${
            isEnabled
              ? isLight ? 'text-amber-600' : 'text-amber-500'
              : isLight ? 'text-slate-400' : 'text-slate-600'
          }`}>
            {setting.rune}
          </span>

          {/* Icon - use custom SVG for search settings */}
          {customIcon || (
            <Icon
              size={18}
              className={
                isEnabled
                  ? isLight ? 'text-amber-600' : 'text-amber-500'
                  : isLight ? 'text-slate-400' : 'text-slate-500'
              }
            />
          )}

          {/* Labels */}
          <div>
            <div className={`text-sm font-cinzel font-semibold tracking-wider ${
              isEnabled
                ? isLight ? 'text-amber-700' : 'text-amber-400'
                : isLight ? 'text-slate-500' : 'text-slate-400'
            }`}>
              {setting.label}
            </div>
            <div className={`text-[9px] font-cinzel ${
              isLight ? 'text-amber-600/60' : 'text-amber-500/50'
            }`}>
              {setting.description}
            </div>
          </div>
        </div>

        {/* Toggle switch */}
        <div className={`w-12 h-6 rounded-md relative transition-all duration-300 border ${
          isEnabled
            ? isLight
              ? 'bg-amber-200/60 border-amber-400/60'
              : 'bg-amber-800/40 border-amber-500/40'
            : isLight
              ? 'bg-slate-200/60 border-slate-400/60'
              : 'bg-slate-700/40 border-slate-600/40'
        }`}>
          <div className={`absolute top-1 w-4 h-4 rounded transition-all duration-300 ${
            isEnabled
              ? isLight
                ? 'left-7 bg-gradient-to-b from-amber-400 to-amber-500'
                : 'left-7 bg-gradient-to-b from-amber-400 to-amber-600'
              : isLight
                ? 'left-1 bg-gradient-to-b from-slate-300 to-slate-400'
                : 'left-1 bg-gradient-to-b from-slate-500 to-slate-600'
          }`} />
        </div>
      </div>
    );
  };

  const renderSection = (title: string, runes: string, items: SettingItem[]) => (
    <div className="mb-4">
      <div className={`flex items-center gap-2 mb-2 px-1 ${
        isLight ? 'text-amber-600/70' : 'text-amber-500/60'
      }`}>
        <span className="text-[10px] tracking-wider">{runes}</span>
        <span className="text-[10px] font-cinzel tracking-wider uppercase">{title}</span>
        <span className="text-[10px] tracking-wider">{runes}</span>
      </div>
      <div className="space-y-2">
        {items.map(renderSettingItem)}
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center"
      onClick={handleClose}
    >
      {/* Backdrop */}
      <div className={`absolute inset-0 ${
        isLight ? 'bg-white/60' : 'bg-black/70'
      } backdrop-blur-sm`} />

      {/* Panel */}
      <div
        className={`relative w-full max-w-md mx-4 rounded-lg border-2 overflow-hidden max-h-[85vh] flex flex-col ${
          isLight
            ? 'bg-gradient-to-b from-amber-50 to-white border-amber-400/50'
            : 'bg-gradient-to-b from-amber-950/90 to-black/95 border-amber-500/40'
        }`}
        onClick={e => e.stopPropagation()}
        style={{
          boxShadow: isLight
            ? '0 20px 60px rgba(245, 158, 11, 0.2)'
            : '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(251, 191, 36, 0.1)',
        }}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b shrink-0 ${
          isLight ? 'border-amber-300/30' : 'border-amber-500/20'
        }`}>
          <div className="flex items-center gap-3">
            <Settings className={isLight ? 'text-amber-600' : 'text-amber-500'} size={20} />
            <h2 className="font-cinzel-decorative text-lg tracking-wider text-amber-500">
              USTAWIENIA
            </h2>
          </div>
          <button
            onClick={handleClose}
            onMouseEnter={() => playClick()}
            className={`p-2 rounded transition-colors ${
              isLight
                ? 'hover:bg-amber-100 text-amber-600'
                : 'hover:bg-amber-900/30 text-amber-500'
            }`}
          >
            <X size={18} />
          </button>
        </div>

        {/* Decorative runes */}
        <div className={`text-center py-2 text-[10px] tracking-[0.5em] shrink-0 ${
          isLight ? 'text-amber-600/30' : 'text-amber-500/20'
        }`}>
          ᚠ ᚢ ᚦ ᚨ ᚱ ᚲ
        </div>

        {/* Settings list - scrollable */}
        <div className="p-4 overflow-y-auto flex-1">
          {renderSection('Główne', '◆', coreSettings)}
          {renderSection('Interfejs', '◇', interfaceSettings)}
          {renderSection('Wyszukiwanie', '◈', searchSettings)}
        </div>

        {/* Footer */}
        <div className={`p-4 border-t text-center shrink-0 ${
          isLight ? 'border-amber-300/30' : 'border-amber-500/20'
        }`}>
          <span className={`text-[9px] font-cinzel tracking-wider ${
            isLight ? 'text-amber-600/50' : 'text-amber-500/40'
          }`}>
            ◇ HYDRA 10.5 ◇ WITCHER CODEX ◇
          </span>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
