/**
 * useHotkey - Single Hotkey Listener Hook
 * @module hooks/useHotkey
 *
 * Registers a single keyboard shortcut with automatic cleanup.
 * Ported from GeminiHydra.
 */

import { useEffect, useRef } from 'react';

interface UseHotkeyOptions {
  preventDefault?: boolean;
  stopPropagation?: boolean;
  enabled?: boolean;
}

/**
 * Hook for listening to a single keyboard hotkey
 *
 * Uses useRef for callback stability — avoids re-registering the listener
 * on every render when the callback changes (e.g., closures).
 *
 * @param hotkey - Hotkey combination string (e.g., 'ctrl+enter', 'meta+n')
 * @param callback - Function to execute when hotkey is pressed
 * @param options - Configuration options
 */
export const useHotkey = (
  hotkey: string,
  callback: () => void,
  options: UseHotkeyOptions = {},
): void => {
  const { preventDefault = true, stopPropagation = false, enabled = true } = options;

  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isHotkeyPressed(event, hotkey)) {
        return;
      }

      if (preventDefault) {
        event.preventDefault();
      }

      if (stopPropagation) {
        event.stopPropagation();
      }

      callbackRef.current();
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [hotkey, preventDefault, stopPropagation, enabled]);
};

/**
 * Check if a keyboard event matches the given hotkey combination
 *
 * @param event - KeyboardEvent to check
 * @param hotkey - Hotkey combination string
 * @returns true if the event matches the hotkey
 */
export const isHotkeyPressed = (event: KeyboardEvent, hotkey: string): boolean => {
  const parts = hotkey.toLowerCase().split('+');
  const key = parts[parts.length - 1];

  // Check modifier keys
  const hasCtrl = parts.includes('ctrl');
  const hasShift = parts.includes('shift');
  const hasAlt = parts.includes('alt');
  const hasMeta = parts.includes('meta') || parts.includes('cmd');

  const ctrlMatch = hasCtrl === event.ctrlKey && hasMeta === event.metaKey;
  const shiftMatch = hasShift === event.shiftKey;
  const altMatch = hasAlt === event.altKey;

  // Get the actual key pressed (case-insensitive)
  const eventKey = event.key.toLowerCase();

  // Handle special key names
  const keyMap: Record<string, string[]> = {
    enter: ['enter'],
    escape: ['escape'],
    tab: ['tab'],
    delete: ['delete'],
    backspace: ['backspace'],
    arrowup: ['arrowup'],
    arrowdown: ['arrowdown'],
    arrowleft: ['arrowleft'],
    arrowright: ['arrowright'],
    space: [' ', 'space'],
  };

  const validKeys = keyMap[key] || [key];

  return ctrlMatch && shiftMatch && altMatch && validKeys.includes(eventKey);
};

export default useHotkey;
