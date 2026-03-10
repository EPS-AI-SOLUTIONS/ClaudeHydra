/**
 * SessionSearch — Debounced search input for filtering chat sessions in the sidebar.
 *
 * #19 - Session search/filter
 */

import { cn } from '@jaskier/ui';
import { Search, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface SessionSearchProps {
  /** Called with the debounced search query (lowercase). Empty string = no filter. */
  onSearch: (query: string) => void;
  /** Extra CSS classes for the container */
  className?: string;
}

export function SessionSearch({ onSearch, className }: SessionSearchProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Debounced callback (300ms)
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      onSearch(value.trim().toLowerCase());
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [value, onSearch]);

  const handleClear = useCallback(() => {
    setValue('');
    onSearch('');
  }, [onSearch]);

  return (
    <div className={cn('relative flex items-center', className)}>
      <Search size={13} className="absolute left-2.5 text-[var(--matrix-text-secondary)]/60 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t('sidebar.searchSessions', 'Search chats...')}
        aria-label={t('sidebar.searchSessions', 'Search chats...')}
        className={cn(
          'w-full pl-8 pr-7 py-1.5 text-xs rounded-lg',
          'bg-[var(--matrix-bg-primary)]/50 border border-[var(--matrix-border)]',
          'text-[var(--matrix-text-primary)] placeholder:text-[var(--matrix-text-secondary)]/40',
          'focus:outline-none focus:border-[var(--matrix-accent)]/40',
          'transition-colors font-mono',
        )}
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2 p-0.5 rounded text-[var(--matrix-text-secondary)]/60 hover:text-[var(--matrix-text-primary)] transition-colors"
          aria-label={t('common.clear', 'Clear')}
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
