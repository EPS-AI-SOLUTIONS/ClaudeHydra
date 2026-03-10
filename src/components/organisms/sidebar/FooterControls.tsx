// src/components/organisms/sidebar/FooterControls.tsx
/** Jaskier Design System */
/**
 * Shared FooterControls — theme toggle, language selector, and version display.
 * Extracted from Sidebar for reuse across the Jaskier app family.
 */

import { cn } from '@jaskier/ui';
import { ChevronDown, Globe, Moon, Sun } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { useViewTheme } from '@/shared/hooks/useViewTheme';

interface FooterControlsProps {
  collapsed: boolean;
  version: string;
  tagline?: string;
}

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '\u{1F1EC}\u{1F1E7}' },
  { code: 'pl', name: 'Polski', flag: '\u{1F1F5}\u{1F1F1}' },
];

const THEME_LABELS: Record<string, string> = {
  dark: 'TRYB CIEMNY',
  light: 'TRYB JASNY',
};

const getThemeLabel = (theme: string): string => THEME_LABELS[theme] ?? 'TRYB CIEMNY';

export function FooterControls({ collapsed, version, tagline }: FooterControlsProps) {
  const { i18n } = useTranslation();
  const { resolvedTheme, toggleTheme } = useTheme();
  const theme = useViewTheme();
  const isLight = theme.isLight;

  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const langDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showLangDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (langDropdownRef.current && !langDropdownRef.current.contains(e.target as Node)) {
        setShowLangDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showLangDropdown]);

  const currentLang = LANGUAGES.find((l) => l.code === i18n.language) || LANGUAGES[1];

  const selectLanguage = (langCode: string) => {
    i18n.changeLanguage(langCode);
    setShowLangDropdown(false);
  };

  const glassPanel = isLight ? 'glass-panel-light' : 'glass-panel-dark';

  return (
    <>
      {/* Theme & Language Panel */}
      <div className={cn(glassPanel, 'p-2 space-y-1')}>
        {/* Theme Toggle */}
        <button
          type="button"
          data-testid="sidebar-theme-toggle"
          onClick={toggleTheme}
          className={cn(
            'flex items-center gap-3 w-full p-2 rounded-lg transition-all group',
            collapsed ? 'justify-center' : 'justify-start',
            isLight ? 'hover:bg-black/5' : 'hover:bg-white/5',
          )}
          title={collapsed ? `Theme: ${resolvedTheme === 'dark' ? 'Dark' : 'Light'}` : undefined}
          aria-label={`Toggle theme, current: ${resolvedTheme === 'dark' ? 'Dark' : 'Light'}`}
        >
          <div className="relative">
            {resolvedTheme === 'dark' ? (
              <Moon size={18} className={cn(theme.iconMuted, 'group-hover:text-white transition-colors')} />
            ) : (
              <Sun size={18} className="text-amber-500 group-hover:text-amber-400 transition-colors" />
            )}
          </div>
          {!collapsed && (
            <span
              className={cn(
                'text-base font-mono',
                theme.textMuted,
                isLight ? 'group-hover:text-black' : 'group-hover:text-white',
                'truncate',
              )}
            >
              {getThemeLabel(resolvedTheme)}
            </span>
          )}
        </button>

        {/* Language Selector */}
        <div className="relative" ref={langDropdownRef} data-testid="sidebar-lang-selector">
          <button
            type="button"
            onClick={() => setShowLangDropdown(!showLangDropdown)}
            className={cn(
              'flex items-center gap-3 w-full p-2 rounded-lg transition-all group',
              collapsed ? 'justify-center' : 'justify-between',
              isLight ? 'hover:bg-black/5' : 'hover:bg-white/5',
            )}
            title={collapsed ? `Language: ${currentLang?.name}` : undefined}
            aria-label={`Select language, current: ${currentLang?.name}`}
            aria-expanded={showLangDropdown}
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <Globe
                  size={18}
                  className={cn(
                    theme.iconMuted,
                    isLight ? 'group-hover:text-emerald-600' : 'group-hover:text-white',
                    'transition-colors',
                  )}
                />
              </div>
              {!collapsed && (
                <span
                  className={cn(
                    'text-base font-mono',
                    theme.textMuted,
                    isLight ? 'group-hover:text-black' : 'group-hover:text-white',
                    'truncate',
                  )}
                >
                  <span className="mr-1.5">{currentLang?.flag}</span>
                  <span className={cn('font-bold', theme.textAccent)}>{currentLang?.code.toUpperCase()}</span>
                </span>
              )}
            </div>
            {!collapsed && (
              <ChevronDown
                size={14}
                className={cn(
                  theme.iconMuted,
                  'transition-transform duration-200',
                  showLangDropdown ? 'rotate-180' : '',
                )}
              />
            )}
          </button>

          {/* Language Dropdown */}
          <AnimatePresence>
            {showLangDropdown && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  'absolute bottom-full left-0 right-0 mb-1 rounded-xl backdrop-blur-xl border overflow-hidden z-50',
                  isLight
                    ? 'bg-white/95 border-emerald-500/20 shadow-lg'
                    : 'bg-black/90 border-white/20 shadow-[0_0_32px_rgba(0,0,0,0.6)]',
                )}
              >
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    data-testid={`sidebar-lang-${lang.code}`}
                    onClick={() => selectLanguage(lang.code)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-all',
                      i18n.language === lang.code
                        ? isLight
                          ? 'bg-emerald-500/20 text-emerald-600'
                          : 'bg-white/15 text-white'
                        : cn(
                            theme.textMuted,
                            isLight ? 'hover:bg-black/5 hover:text-black' : 'hover:bg-white/5 hover:text-white',
                          ),
                    )}
                  >
                    <span className="text-base">{lang.flag}</span>
                    <span className="font-mono">{lang.name}</span>
                    {i18n.language === lang.code && (
                      <div
                        className={cn(
                          'ml-auto w-1.5 h-1.5 rounded-full',
                          isLight
                            ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]'
                            : 'bg-white shadow-[0_0_6px_rgba(255,255,255,0.4)]',
                        )}
                      />
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Version */}
      {!collapsed && (
        <p data-testid="sidebar-version" className={cn('text-center text-xs py-2', theme.textMuted)}>
          <span className={theme.textAccent}>{version.split(' ')[0]}</span>{' '}
          {version.includes(' ') ? version.slice(version.indexOf(' ') + 1) : ''}
          {tagline && <> | {tagline}</>}
        </p>
      )}
    </>
  );
}
