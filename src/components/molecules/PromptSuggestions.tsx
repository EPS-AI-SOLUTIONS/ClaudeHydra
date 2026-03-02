/** Jaskier Shared Pattern */

import type { LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/utils/cn';

export interface PromptSuggestion {
  /** i18n key for the suggestion text */
  labelKey: string;
  /** Fallback text if i18n key is missing */
  fallback: string;
  /** Lucide icon to display */
  icon: LucideIcon;
}

interface PromptSuggestionsProps {
  suggestions: PromptSuggestion[];
  onSelect: (text: string) => void;
  className?: string;
}

export const PromptSuggestions = memo<PromptSuggestionsProps>(({ suggestions, onSelect, className }) => {
  const { t } = useTranslation();

  return (
    <ul
      className={cn(
        'grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-2xl mx-auto mt-6 px-4 list-none p-0 m-0',
        className,
      )}
      aria-label={t('chat.suggestions.label', 'Suggested prompts')}
    >
      {suggestions.map((suggestion, index) => {
        const Icon = suggestion.icon;
        const text = t(suggestion.labelKey, suggestion.fallback);
        return (
          <motion.li
            key={suggestion.labelKey}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + index * 0.06, duration: 0.3 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect(text)}
            className={cn(
              'flex items-start gap-3 p-3.5 rounded-xl text-left transition-all duration-200',
              'bg-[var(--matrix-bg-secondary)]/50 border border-[var(--matrix-divider)]',
              'hover:border-[var(--matrix-accent)]/40 hover:bg-[var(--matrix-accent)]/5',
              'hover:shadow-[0_0_15px_rgba(var(--matrix-accent-rgb),0.08)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--matrix-accent)]',
              'cursor-pointer group',
            )}
          >
            <Icon
              size={18}
              className="text-[var(--matrix-text-secondary)] group-hover:text-[var(--matrix-accent)] transition-colors mt-0.5 flex-shrink-0"
            />
            <span className="text-sm font-mono text-[var(--matrix-text-secondary)] group-hover:text-[var(--matrix-text-primary)] transition-colors leading-snug">
              {text}
            </span>
          </motion.li>
        );
      })}
    </ul>
  );
});

PromptSuggestions.displayName = 'PromptSuggestions';
