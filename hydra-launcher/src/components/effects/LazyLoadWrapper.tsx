/**
 * LazyLoadWrapper - Component that loads children only when visible
 *
 * Combines Intersection Observer with React Suspense for optimal lazy loading.
 * Children are only mounted when the wrapper enters the viewport.
 */

import React, { Suspense, useState, useEffect, useMemo, ElementType } from 'react';
import { useIntersectionObserver, UseIntersectionObserverOptions } from '../../hooks/useIntersectionObserver';
import { EffectSkeleton, EffectSkeletonProps } from './LazyEffects';

// ============================================================================
// Types
// ============================================================================

export interface LazyLoadWrapperProps {
  /** Content to render when visible */
  children: React.ReactNode;

  /**
   * Fallback content shown while loading.
   * Can be a React node or 'skeleton' to use EffectSkeleton.
   * @default null
   */
  fallback?: React.ReactNode | 'skeleton';

  /**
   * Skeleton type when fallback='skeleton'
   * @default 'default'
   */
  skeletonType?: EffectSkeletonProps['type'];

  /**
   * Keep children mounted after becoming visible once.
   * If false, children unmount when scrolled out of view.
   * @default true
   */
  keepMounted?: boolean;

  /**
   * Margin around viewport to trigger loading.
   * Positive values trigger earlier (preload).
   * @default "200px"
   */
  rootMargin?: string;

  /**
   * Threshold for intersection (0-1)
   * @default 0
   */
  threshold?: number | number[];

  /**
   * Minimum time to show fallback (ms).
   * Prevents flash of loading state.
   * @default 0
   */
  minLoadingTime?: number;

  /**
   * Delay before showing content after intersection (ms).
   * @default 0
   */
  delay?: number;

  /**
   * Whether lazy loading is enabled.
   * If false, children render immediately.
   * @default true
   */
  enabled?: boolean;

  /**
   * Callback when visibility changes
   */
  onVisibilityChange?: (isVisible: boolean) => void;

  /**
   * Callback when content starts loading
   */
  onLoadStart?: () => void;

  /**
   * Callback when content finishes loading
   */
  onLoadComplete?: () => void;

  /**
   * Additional className for wrapper
   */
  className?: string;

  /**
   * Inline styles for wrapper
   */
  style?: React.CSSProperties;

  /**
   * HTML tag for wrapper element
   * @default 'div'
   */
  as?: ElementType;

  /**
   * Width of wrapper (for sizing skeleton)
   */
  width?: number | string;

  /**
   * Height of wrapper (for sizing skeleton)
   */
  height?: number | string;

  /**
   * Accessibility label
   */
  'aria-label'?: string;
}

// ============================================================================
// Component Implementation
// ============================================================================

/**
 * LazyLoadWrapper
 *
 * @example Basic usage
 * ```tsx
 * <LazyLoadWrapper>
 *   <HeavyComponent />
 * </LazyLoadWrapper>
 * ```
 *
 * @example With skeleton fallback
 * ```tsx
 * <LazyLoadWrapper
 *   fallback="skeleton"
 *   skeletonType="aurora"
 *   rootMargin="300px"
 * >
 *   <AuroraBackground />
 * </LazyLoadWrapper>
 * ```
 *
 * @example With custom fallback and callbacks
 * ```tsx
 * <LazyLoadWrapper
 *   fallback={<CustomLoader />}
 *   onVisibilityChange={(visible) => console.log('Visible:', visible)}
 *   onLoadComplete={() => console.log('Loaded!')}
 *   keepMounted={false}
 * >
 *   <HeavyVisualization />
 * </LazyLoadWrapper>
 * ```
 */
export const LazyLoadWrapper: React.FC<LazyLoadWrapperProps> = ({
  children,
  fallback = null,
  skeletonType = 'default',
  keepMounted = true,
  rootMargin = '200px',
  threshold = 0,
  minLoadingTime = 0,
  delay = 0,
  enabled = true,
  onVisibilityChange,
  onLoadStart,
  onLoadComplete,
  className = '',
  style,
  as: Component = 'div',
  width,
  height,
  'aria-label': ariaLabel,
}) => {
  // Track if content has been loaded at least once
  const [hasLoaded, setHasLoaded] = useState(false);
  // Track if minimum loading time has passed
  const [minTimeElapsed, setMinTimeElapsed] = useState(minLoadingTime === 0);
  // Track if we should show content
  const [showContent, setShowContent] = useState(false);

  // Intersection observer configuration
  const observerOptions: UseIntersectionObserverOptions = useMemo(
    () => ({
      threshold,
      rootMargin,
      triggerOnce: keepMounted,
      enabled,
      delay,
      onChange: (isIntersecting) => {
        onVisibilityChange?.(isIntersecting);

        if (isIntersecting && !hasLoaded) {
          onLoadStart?.();
        }
      },
    }),
    [threshold, rootMargin, keepMounted, enabled, delay, onVisibilityChange, hasLoaded, onLoadStart]
  );

  const { ref, isIntersecting } = useIntersectionObserver<HTMLDivElement>(observerOptions);

  // Handle minimum loading time
  useEffect(() => {
    if (isIntersecting && minLoadingTime > 0 && !minTimeElapsed) {
      const timer = setTimeout(() => {
        setMinTimeElapsed(true);
      }, minLoadingTime);

      return () => clearTimeout(timer);
    }
  }, [isIntersecting, minLoadingTime, minTimeElapsed]);

  // Determine if we should show content
  useEffect(() => {
    const shouldShow = !enabled || (isIntersecting && minTimeElapsed);

    if (shouldShow && !showContent) {
      setShowContent(true);
      if (!hasLoaded) {
        setHasLoaded(true);
        onLoadComplete?.();
      }
    } else if (!shouldShow && !keepMounted && hasLoaded) {
      setShowContent(false);
    }
  }, [enabled, isIntersecting, minTimeElapsed, showContent, hasLoaded, keepMounted, onLoadComplete]);

  // Resolve fallback content
  const resolvedFallback = useMemo(() => {
    if (fallback === 'skeleton') {
      return (
        <EffectSkeleton
          type={skeletonType}
          width={width}
          height={height}
        />
      );
    }
    return fallback;
  }, [fallback, skeletonType, width, height]);

  // Wrapper styles
  const wrapperStyle = useMemo<React.CSSProperties>(
    () => ({
      position: 'relative',
      width: width,
      height: height,
      ...style,
    }),
    [width, height, style]
  );

  // Render content or fallback
  const content = useMemo(() => {
    // If lazy loading disabled, render children directly
    if (!enabled) {
      return children;
    }

    // Show content if visible (or previously loaded and keepMounted)
    if (showContent || (keepMounted && hasLoaded)) {
      return (
        <Suspense fallback={resolvedFallback}>
          {children}
        </Suspense>
      );
    }

    // Show fallback while not visible
    return resolvedFallback;
  }, [enabled, showContent, keepMounted, hasLoaded, children, resolvedFallback]);

  return (
    <Component
      ref={ref as React.Ref<HTMLDivElement>}
      className={`lazy-load-wrapper ${className}`}
      style={wrapperStyle}
      aria-label={ariaLabel}
      data-loaded={hasLoaded}
      data-visible={isIntersecting}
    >
      {content}
    </Component>
  );
};

// ============================================================================
// Utility Components
// ============================================================================

/**
 * LazyEffect - Specialized wrapper for effect components
 *
 * Preconfigured for optimal effect loading with appropriate defaults.
 */
export interface LazyEffectProps extends Omit<LazyLoadWrapperProps, 'fallback' | 'as'> {
  /** Type of effect being loaded */
  effectType?: EffectSkeletonProps['type'];
}

export const LazyEffect: React.FC<LazyEffectProps> = ({
  effectType = 'default',
  children,
  rootMargin = '300px', // Effects benefit from earlier preloading
  keepMounted = true,
  ...props
}) => {
  return (
    <LazyLoadWrapper
      fallback="skeleton"
      skeletonType={effectType}
      rootMargin={rootMargin}
      keepMounted={keepMounted}
      {...props}
    >
      {children}
    </LazyLoadWrapper>
  );
};

/**
 * LazySection - Wrapper for page sections with heavy content
 *
 * Uses section element and provides scroll-based loading.
 */
export interface LazySectionProps extends Omit<LazyLoadWrapperProps, 'as'> {
  /** Section ID for navigation */
  id?: string;
}

export const LazySection: React.FC<LazySectionProps> = ({
  children,
  rootMargin = '100px',
  ...props
}) => {
  return (
    <LazyLoadWrapper
      as="section"
      rootMargin={rootMargin}
      {...props}
    >
      {children}
    </LazyLoadWrapper>
  );
};

// ============================================================================
// HOC for Lazy Loading
// ============================================================================

/**
 * withLazyLoading - Higher-order component for lazy loading
 *
 * @example
 * ```tsx
 * const LazyHeavyComponent = withLazyLoading(HeavyComponent, {
 *   rootMargin: '200px',
 *   skeletonType: 'aurora',
 * });
 *
 * // Usage
 * <LazyHeavyComponent someProp="value" />
 * ```
 */
export function withLazyLoading<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  wrapperProps: Omit<LazyLoadWrapperProps, 'children'> = {}
): React.FC<P> {
  const WithLazyLoading: React.FC<P> = (props) => {
    return (
      <LazyLoadWrapper {...wrapperProps}>
        <WrappedComponent {...props} />
      </LazyLoadWrapper>
    );
  };

  WithLazyLoading.displayName = `withLazyLoading(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;

  return WithLazyLoading;
}

export default LazyLoadWrapper;
