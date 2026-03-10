// src/components/molecules/ModelSelector.tsx
/**
 * ModelSelector Molecule
 * ======================
 * Glass-styled dropdown for AI model selection.
 * Features: search/filter, keyboard navigation, outside-click close.
 * Generic typing for model options.
 *
 * ClaudeHydra-v4: Green Matrix accent with glass-panel from globals.css.
 */

import { cn } from '@jaskier/ui';
import { Check, ChevronDown, Search } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebounce } from '@/shared/hooks/useDebounce';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModelOption {
  /** Unique identifier for the model. */
  id: string;
  /** Display name. */
  name: string;
  /** Provider group (e.g. 'google', 'anthropic'). */
  provider?: string;
  /** Optional icon rendered before the name. */
  icon?: ReactNode;
  /** Whether the model is available for selection. */
  available?: boolean;
  /** Optional description / subtitle. */
  description?: string;
}

interface ModelSelectorProps<T extends ModelOption = ModelOption> {
  /** List of model options. */
  models: T[];
  /** Currently selected model id. */
  selectedId: string | null;
  /** Called when a model is selected. */
  onSelect: (model: T) => void;
  /** Placeholder text when nothing is selected. */
  placeholder?: string;
  /** Disabled state. */
  disabled?: boolean;
  /** Extra CSS class for the root wrapper. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ModelSelector<T extends ModelOption = ModelOption>({
  models,
  selectedId,
  onSelect,
  placeholder = 'Select model',
  disabled = false,
  className,
}: ModelSelectorProps<T>) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [focusIndex, setFocusIndex] = useState(-1);

  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ----- Derived data --------------------------------------------------

  const debouncedSearch = useDebounce(search, 300);

  const selectedModel = useMemo(() => models.find((m) => m.id === selectedId) ?? null, [models, selectedId]);

  const filtered = useMemo(() => {
    if (!debouncedSearch.trim()) return models;
    const q = debouncedSearch.toLowerCase();
    return models.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.provider?.toLowerCase().includes(q) ||
        m.description?.toLowerCase().includes(q),
    );
  }, [models, debouncedSearch]);

  // ----- Outside click -------------------------------------------------

  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // ----- Auto-focus search on open -------------------------------------

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setFocusIndex(-1);
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [isOpen]);

  // ----- Scroll focused item into view ---------------------------------

  useEffect(() => {
    if (focusIndex < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-model-item]');
    items[focusIndex]?.scrollIntoView({ block: 'nearest' });
  }, [focusIndex]);

  // ----- Keyboard nav --------------------------------------------------

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
          e.preventDefault();
          setIsOpen(true);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setFocusIndex((i) => (i + 1) % filtered.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusIndex((i) => (i - 1 + filtered.length) % filtered.length);
          break;
        case 'Enter': {
          e.preventDefault();
          const target = filtered[focusIndex];
          if (target && target.available !== false) {
            onSelect(target);
            setIsOpen(false);
          }
          break;
        }
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          break;
        default:
          break;
      }
    },
    [isOpen, filtered, focusIndex, onSelect],
  );

  // ----- Select handler ------------------------------------------------

  const handleSelect = useCallback(
    (model: T) => {
      if (model.available === false) return;
      onSelect(model);
      setIsOpen(false);
    },
    [onSelect],
  );

  // ----- Render --------------------------------------------------------

  return (
    <div
      ref={rootRef}
      className={cn('relative', className)}
      onKeyDown={handleKeyDown}
      role="combobox"
      aria-expanded={isOpen}
      tabIndex={-1}
    >
      {/* Trigger */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all w-full',
          'bg-[var(--glass-bg)] border border-[var(--glass-border)]',
          'hover:border-[var(--matrix-accent-dim)] hover:bg-[var(--matrix-bg-tertiary)]',
          isOpen && 'border-[var(--matrix-accent)] ring-1 ring-[var(--matrix-accent)]/30',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        {selectedModel?.icon && <span className="flex-shrink-0">{selectedModel.icon}</span>}
        <span className="text-[var(--matrix-text-primary)] font-medium truncate flex-1 text-left">
          {selectedModel?.name ?? placeholder}
        </span>
        <ChevronDown
          size={16}
          className={cn(
            'text-[var(--matrix-text-secondary)] transition-transform flex-shrink-0',
            isOpen && 'rotate-180',
          )}
        />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className={cn('absolute z-50 mt-2 w-full min-w-[280px]', 'glass-panel overflow-hidden')}
            role="listbox"
          >
            {/* Search */}
            {models.length > 5 && (
              <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--glass-border)]">
                <Search size={14} className="text-[var(--matrix-text-secondary)] flex-shrink-0" />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setFocusIndex(-1);
                  }}
                  placeholder={t('models.searchModels', 'Search models...')}
                  className="bg-transparent text-sm text-[var(--matrix-text-primary)] placeholder:text-[var(--matrix-text-secondary)] outline-none w-full font-mono"
                />
              </div>
            )}

            {/* Model list */}
            <div ref={listRef} className="max-h-64 overflow-y-auto p-1">
              {filtered.length === 0 && (
                <div className="px-3 py-4 text-center text-sm text-[var(--matrix-text-secondary)] font-mono">
                  No models found
                </div>
              )}

              {filtered.map((model, idx) => {
                const isSelected = model.id === selectedId;
                const isFocused = idx === focusIndex;
                const isDisabled = model.available === false;

                return (
                  <button
                    key={model.id}
                    type="button"
                    data-model-item
                    role="option"
                    aria-selected={isSelected}
                    disabled={isDisabled}
                    onClick={() => handleSelect(model)}
                    onMouseEnter={() => setFocusIndex(idx)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg',
                      'transition-colors text-left text-sm',
                      isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
                      !isDisabled && (isFocused || isSelected) && 'bg-[var(--matrix-accent)]/10',
                      isSelected && 'border border-[var(--matrix-accent)]/30',
                      !isSelected && 'border border-transparent',
                    )}
                  >
                    {/* Check / icon */}
                    <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                      {isSelected ? <Check size={14} className="text-[var(--matrix-accent)]" /> : (model.icon ?? null)}
                    </span>

                    {/* Name + description */}
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium text-[var(--matrix-text-primary)] truncate">{model.name}</span>
                      {model.description && (
                        <span className="block text-xs text-[var(--matrix-text-secondary)] truncate mt-0.5">
                          {model.description}
                        </span>
                      )}
                    </span>

                    {/* Provider badge */}
                    {model.provider && (
                      <span className="badge badge-default text-[10px] font-mono uppercase flex-shrink-0">
                        {model.provider}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
