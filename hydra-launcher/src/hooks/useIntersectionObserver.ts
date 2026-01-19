/**
 * useIntersectionObserver - Hook for detecting element visibility
 *
 * Uses the Intersection Observer API to detect when elements enter/exit the viewport.
 * Optimized for lazy loading and deferred rendering of heavy components.
 */

import { useState, useEffect, useRef, useCallback, RefObject } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface UseIntersectionObserverOptions {
  /**
   * Threshold(s) at which to trigger the callback.
   * A value of 0.0 means trigger when any pixel is visible.
   * A value of 1.0 means trigger when 100% of the element is visible.
   * Can be a single number or array for multiple thresholds.
   * @default 0
   */
  threshold?: number | number[];

  /**
   * Margin around the root element.
   * Can be used to trigger loading before element enters viewport.
   * Syntax similar to CSS margin: "10px 20px 30px 40px"
   * @default "0px"
   */
  rootMargin?: string;

  /**
   * Element to use as viewport for visibility.
   * If null, uses the browser viewport.
   * @default null
   */
  root?: Element | Document | null;

  /**
   * Whether to disconnect observer after first intersection.
   * Useful for one-time lazy loading.
   * @default false
   */
  triggerOnce?: boolean;

  /**
   * Initial visibility state before observation starts.
   * @default false
   */
  initialIsIntersecting?: boolean;

  /**
   * Whether the observer is enabled.
   * Useful for conditional observation.
   * @default true
   */
  enabled?: boolean;

  /**
   * Callback fired on intersection change.
   * Provides the IntersectionObserverEntry for additional data.
   */
  onChange?: (isIntersecting: boolean, entry: IntersectionObserverEntry) => void;

  /**
   * Delay in ms before updating state after intersection.
   * Useful for debouncing rapid visibility changes.
   * @default 0
   */
  delay?: number;
}

export interface UseIntersectionObserverReturn<T extends Element = Element> {
  /** Ref to attach to the target element */
  ref: RefObject<T | null>;
  /** Whether the element is currently intersecting */
  isIntersecting: boolean;
  /** The full IntersectionObserverEntry (null if not observed yet) */
  entry: IntersectionObserverEntry | null;
  /** Manually trigger a check (useful after dynamic content changes) */
  observe: () => void;
  /** Stop observing the element */
  unobserve: () => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * useIntersectionObserver
 *
 * @example Basic usage
 * ```tsx
 * function LazyImage({ src }) {
 *   const { ref, isIntersecting } = useIntersectionObserver<HTMLDivElement>();
 *
 *   return (
 *     <div ref={ref}>
 *       {isIntersecting && <img src={src} alt="" />}
 *     </div>
 *   );
 * }
 * ```
 *
 * @example With preloading margin
 * ```tsx
 * const { ref, isIntersecting } = useIntersectionObserver<HTMLDivElement>({
 *   rootMargin: '200px', // Start loading 200px before visible
 *   triggerOnce: true,   // Only load once
 * });
 * ```
 *
 * @example With callback
 * ```tsx
 * const { ref } = useIntersectionObserver<HTMLDivElement>({
 *   threshold: [0, 0.5, 1],
 *   onChange: (isIntersecting, entry) => {
 *     console.log(`Visibility: ${entry.intersectionRatio * 100}%`);
 *   },
 * });
 * ```
 */
export function useIntersectionObserver<T extends Element = Element>(
  options: UseIntersectionObserverOptions = {}
): UseIntersectionObserverReturn<T> {
  const {
    threshold = 0,
    rootMargin = '0px',
    root = null,
    triggerOnce = false,
    initialIsIntersecting = false,
    enabled = true,
    onChange,
    delay = 0,
  } = options;

  const elementRef = useRef<T>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasTriggeredRef = useRef(false);

  const [isIntersecting, setIsIntersecting] = useState(initialIsIntersecting);
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Handle intersection changes
  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [observerEntry] = entries;
      if (!observerEntry) return;

      const updateState = () => {
        const isNowIntersecting = observerEntry.isIntersecting;

        setEntry(observerEntry);
        setIsIntersecting(isNowIntersecting);

        // Call onChange callback
        onChange?.(isNowIntersecting, observerEntry);

        // Handle triggerOnce
        if (isNowIntersecting && triggerOnce && !hasTriggeredRef.current) {
          hasTriggeredRef.current = true;
          observerRef.current?.disconnect();
        }
      };

      // Apply delay if specified
      if (delay > 0) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(updateState, delay);
      } else {
        updateState();
      }
    },
    [onChange, triggerOnce, delay]
  );

  // Setup observer
  useEffect(() => {
    const element = elementRef.current;

    // Early exit conditions
    if (!enabled || !element) {
      return;
    }

    // Skip if already triggered once
    if (triggerOnce && hasTriggeredRef.current) {
      return;
    }

    // Check for browser support
    if (typeof IntersectionObserver === 'undefined') {
      // Fallback for older browsers - assume visible
      setIsIntersecting(true);
      onChange?.(true, {} as IntersectionObserverEntry);
      return;
    }

    // Create observer with options
    const observerOptions: IntersectionObserverInit = {
      threshold,
      rootMargin,
      root,
    };

    observerRef.current = new IntersectionObserver(handleIntersection, observerOptions);
    observerRef.current.observe(element);

    return () => {
      observerRef.current?.disconnect();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabled, threshold, rootMargin, root, triggerOnce, handleIntersection]);

  // Manual observe function
  const observe = useCallback(() => {
    const element = elementRef.current;
    if (element && observerRef.current) {
      observerRef.current.observe(element);
    }
  }, []);

  // Manual unobserve function
  const unobserve = useCallback(() => {
    const element = elementRef.current;
    if (element && observerRef.current) {
      observerRef.current.unobserve(element);
    }
  }, []);

  return {
    ref: elementRef,
    isIntersecting,
    entry,
    observe,
    unobserve,
  };
}

// ============================================================================
// Utility Hooks
// ============================================================================

/**
 * useIsVisible - Simplified hook that just returns visibility state
 *
 * @example
 * ```tsx
 * const { ref, isVisible } = useIsVisible<HTMLDivElement>({ rootMargin: '100px' });
 * ```
 */
export function useIsVisible<T extends Element = Element>(
  options: Omit<UseIntersectionObserverOptions, 'onChange'> = {}
): { ref: RefObject<T | null>; isVisible: boolean } {
  const { ref, isIntersecting } = useIntersectionObserver<T>(options);
  return { ref, isVisible: isIntersecting };
}

/**
 * useOnScreen - Hook that returns true once element has been visible
 * Useful for lazy loading that should persist
 *
 * @example
 * ```tsx
 * const { ref, hasBeenVisible } = useOnScreen<HTMLDivElement>();
 *
 * return (
 *   <div ref={ref}>
 *     {hasBeenVisible && <HeavyComponent />}
 *   </div>
 * );
 * ```
 */
export function useOnScreen<T extends Element = Element>(
  options: Omit<UseIntersectionObserverOptions, 'triggerOnce'> = {}
): { ref: RefObject<T | null>; hasBeenVisible: boolean } {
  const { ref, isIntersecting } = useIntersectionObserver<T>({
    ...options,
    triggerOnce: true,
  });
  return { ref, hasBeenVisible: isIntersecting };
}

export default useIntersectionObserver;
