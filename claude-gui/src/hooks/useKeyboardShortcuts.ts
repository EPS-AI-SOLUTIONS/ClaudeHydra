/**
 * useKeyboardShortcuts - Multiple Hotkeys Manager Hook
 * @module hooks/useKeyboardShortcuts
 *
 * Manages multiple keyboard shortcuts with automatic cleanup.
 * Ported from GeminiHydra.
 */

import { useEffect, useRef } from 'react';
import { isHotkeyPressed } from './useHotkey';

interface UseKeyboardShortcutsOptions {
  preventDefault?: boolean;
  stopPropagation?: boolean;
  enabled?: boolean;
}

/**
 * Hook for managing multiple keyboard shortcuts
 *
 * @param shortcuts - Object mapping hotkey combinations to callback functions
 * @param options - Configuration options
 *
 * @example
 * ```tsx
 * const { registerShortcut, unregisterShortcut } = useKeyboardShortcuts({
 *   'ctrl+enter': () => submitMessage(),
 *   'ctrl+n': () => newSession(),
 *   'escape': () => closeModal(),
 * });
 * ```
 */
export const useKeyboardShortcuts = (
  shortcuts: Record<string, () => void>,
  options: UseKeyboardShortcutsOptions = {},
): {
  registerShortcut: (hotkey: string, callback: () => void) => void;
  unregisterShortcut: (hotkey: string) => void;
} => {
  const { preventDefault = true, stopPropagation = false, enabled = true } = options;

  // Mutable registry to allow dynamic shortcut management
  const shortcutsRef = useRef<Record<string, () => void>>(shortcuts);

  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  const registerShortcut = (hotkey: string, callback: () => void) => {
    shortcutsRef.current[hotkey] = callback;
  };

  const unregisterShortcut = (hotkey: string) => {
    delete shortcutsRef.current[hotkey];
  };

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Check each registered shortcut
      for (const [hotkey, callback] of Object.entries(shortcutsRef.current)) {
        if (isHotkeyPressed(event, hotkey)) {
          if (preventDefault) {
            event.preventDefault();
          }

          if (stopPropagation) {
            event.stopPropagation();
          }

          callback();
          return; // Only execute first matching shortcut
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [preventDefault, stopPropagation, enabled]);

  return {
    registerShortcut,
    unregisterShortcut,
  };
};

export default useKeyboardShortcuts;
