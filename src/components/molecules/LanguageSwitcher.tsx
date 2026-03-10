// src/components/molecules/LanguageSwitcher.tsx
/** Jaskier Shared Pattern */
/**
 * Runtime Language Switcher
 * =========================
 * Compact inline language switcher using i18next.
 * Renders flag-style toggle buttons for EN/PL.
 */

import { cn } from '@jaskier/ui';
import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'pl', label: 'Polski' },
];

export function LanguageSwitcher({ className }: { className?: string }) {
  const { i18n } = useTranslation();

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Languages className="w-3.5 h-3.5 text-[var(--matrix-text-dim)]" />
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          type="button"
          onClick={() => i18n.changeLanguage(lang.code)}
          className={cn(
            'px-2 py-0.5 rounded text-xs transition-colors cursor-pointer',
            i18n.language === lang.code
              ? 'bg-[var(--matrix-accent)] text-[var(--matrix-bg-primary)] font-medium'
              : 'text-[var(--matrix-text-dim)] hover:text-[var(--matrix-text)]',
          )}
          aria-label={`Switch language to ${lang.label}`}
          aria-pressed={i18n.language === lang.code}
        >
          {lang.code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
