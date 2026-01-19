/**
 * LazyEffects - Lazy-loaded visual effect components
 *
 * Uses React.lazy() and Suspense for code-splitting heavy visual effects.
 * Reduces initial bundle size by deferring loading until components are needed.
 */

import React, { Suspense, lazy, ComponentType } from 'react';
import type { AuroraBackgroundProps } from './AuroraBackground';
import type { SpotlightProps } from './Spotlight';
import type { ParticleFieldProps } from './ParticleField';
import type { MorphingBlobProps } from './MorphingBlob';

// Lazy-loaded component imports with webpack magic comments for better chunking
const LazyAuroraBackgroundComponent = lazy(
  () => import(/* webpackChunkName: "aurora-background" */ './AuroraBackground')
);

const LazySpotlightComponent = lazy(
  () => import(/* webpackChunkName: "spotlight" */ './Spotlight')
);

const LazyParticleFieldComponent = lazy(
  () => import(/* webpackChunkName: "particle-field" */ './ParticleField')
);

const LazyMorphingBlobComponent = lazy(
  () => import(/* webpackChunkName: "morphing-blob" */ './MorphingBlob')
);

// ============================================================================
// Skeleton/Placeholder Components
// ============================================================================

export interface EffectSkeletonProps {
  /** Type of skeleton to display */
  type?: 'aurora' | 'spotlight' | 'particles' | 'blob' | 'default';
  /** Custom className for styling */
  className?: string;
  /** Width for blob skeleton */
  width?: number | string;
  /** Height for blob skeleton */
  height?: number | string;
}

/**
 * EffectSkeleton - Placeholder shown while effects are loading
 *
 * Provides visual feedback during lazy loading with minimal render cost.
 * Uses CSS-only animations to avoid JavaScript overhead.
 */
export const EffectSkeleton: React.FC<EffectSkeletonProps> = ({
  type = 'default',
  className = '',
  width,
  height,
}) => {
  const baseStyles: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    overflow: 'hidden',
  };

  const pulseKeyframes = `
    @keyframes effect-skeleton-pulse {
      0%, 100% { opacity: 0.3; }
      50% { opacity: 0.15; }
    }
  `;

  const shimmerKeyframes = `
    @keyframes effect-skeleton-shimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }
  `;

  // Aurora skeleton - subtle gradient placeholder
  if (type === 'aurora') {
    return (
      <>
        <style>{pulseKeyframes}</style>
        <div
          className={`effect-skeleton effect-skeleton-aurora ${className}`}
          style={{
            ...baseStyles,
            background: 'linear-gradient(135deg, rgba(20, 184, 166, 0.1) 0%, rgba(139, 92, 246, 0.08) 50%, rgba(59, 130, 246, 0.06) 100%)',
            animation: 'effect-skeleton-pulse 2s ease-in-out infinite',
          }}
          aria-hidden="true"
        />
      </>
    );
  }

  // Spotlight skeleton - circular gradient placeholder
  if (type === 'spotlight') {
    return (
      <>
        <style>{pulseKeyframes}</style>
        <div
          className={`effect-skeleton effect-skeleton-spotlight ${className}`}
          style={{
            ...baseStyles,
            background: 'radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.05) 0%, transparent 50%)',
            animation: 'effect-skeleton-pulse 1.5s ease-in-out infinite',
          }}
          aria-hidden="true"
        />
      </>
    );
  }

  // Particles skeleton - dotted pattern placeholder
  if (type === 'particles') {
    return (
      <>
        <style>{pulseKeyframes}</style>
        <div
          className={`effect-skeleton effect-skeleton-particles ${className}`}
          style={{
            ...baseStyles,
            backgroundImage: 'radial-gradient(circle, rgba(150, 150, 150, 0.15) 1px, transparent 1px)',
            backgroundSize: '30px 30px',
            animation: 'effect-skeleton-pulse 2s ease-in-out infinite',
          }}
          aria-hidden="true"
        />
      </>
    );
  }

  // Blob skeleton - circular blurred placeholder
  if (type === 'blob') {
    const blobWidth = width || 300;
    const blobHeight = height || 300;

    return (
      <>
        <style>{pulseKeyframes}</style>
        <div
          className={`effect-skeleton effect-skeleton-blob ${className}`}
          style={{
            position: 'relative',
            width: blobWidth,
            height: blobHeight,
            pointerEvents: 'none',
          }}
          aria-hidden="true"
        >
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '60%',
              height: '60%',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(139, 92, 246, 0.1), rgba(236, 72, 153, 0.08))',
              filter: 'blur(30px)',
              animation: 'effect-skeleton-pulse 2.5s ease-in-out infinite',
            }}
          />
        </div>
      </>
    );
  }

  // Default skeleton - simple shimmer effect
  return (
    <>
      <style>{shimmerKeyframes}</style>
      <div
        className={`effect-skeleton effect-skeleton-default ${className}`}
        style={{
          ...baseStyles,
          background: 'rgba(128, 128, 128, 0.05)',
        }}
        aria-hidden="true"
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.03), transparent)',
            animation: 'effect-skeleton-shimmer 2s infinite',
          }}
        />
      </div>
    </>
  );
};

// ============================================================================
// Higher-Order Component for Lazy Loading with Suspense
// ============================================================================

interface WithLazyLoadingOptions {
  /** Fallback type for skeleton */
  fallbackType?: EffectSkeletonProps['type'];
  /** Custom fallback component */
  customFallback?: React.ReactNode;
  /** Display name for debugging */
  displayName?: string;
}

/**
 * Creates a lazy-loaded wrapper around a component with Suspense
 */
function createLazyEffect<P extends object>(
  LazyComponent: React.LazyExoticComponent<ComponentType<P>>,
  options: WithLazyLoadingOptions = {}
): React.FC<P & { fallback?: React.ReactNode }> {
  const { fallbackType = 'default', customFallback, displayName } = options;

  const LazyWrapper: React.FC<P & { fallback?: React.ReactNode }> = (props) => {
    const { fallback, ...componentProps } = props as P & { fallback?: React.ReactNode };
    const fallbackElement = fallback ?? customFallback ?? <EffectSkeleton type={fallbackType} />;

    return (
      <Suspense fallback={fallbackElement}>
        <LazyComponent {...(componentProps as P)} />
      </Suspense>
    );
  };

  LazyWrapper.displayName = displayName || 'LazyEffectWrapper';

  return LazyWrapper;
}

// ============================================================================
// Exported Lazy Components
// ============================================================================

/**
 * LazyAuroraBackground - Lazy-loaded aurora effect
 *
 * @example
 * ```tsx
 * <LazyAuroraBackground intensity={0.6} speed={1} />
 * ```
 */
export const LazyAuroraBackground = createLazyEffect<AuroraBackgroundProps>(
  LazyAuroraBackgroundComponent,
  {
    fallbackType: 'aurora',
    displayName: 'LazyAuroraBackground',
  }
);

/**
 * LazySpotlight - Lazy-loaded spotlight effect
 *
 * @example
 * ```tsx
 * <LazySpotlight size={200} intensity={0.15} />
 * ```
 */
export const LazySpotlight = createLazyEffect<SpotlightProps>(
  LazySpotlightComponent,
  {
    fallbackType: 'spotlight',
    displayName: 'LazySpotlight',
  }
);

/**
 * LazyParticleField - Lazy-loaded particle field effect
 *
 * @example
 * ```tsx
 * <LazyParticleField count={30} connections={true} />
 * ```
 */
export const LazyParticleField = createLazyEffect<ParticleFieldProps>(
  LazyParticleFieldComponent,
  {
    fallbackType: 'particles',
    displayName: 'LazyParticleField',
  }
);

/**
 * LazyMorphingBlob - Lazy-loaded morphing blob effect
 *
 * @example
 * ```tsx
 * <LazyMorphingBlob size={300} speed={1} />
 * ```
 */
export const LazyMorphingBlob = createLazyEffect<MorphingBlobProps>(
  LazyMorphingBlobComponent,
  {
    fallbackType: 'blob',
    displayName: 'LazyMorphingBlob',
  }
);

// ============================================================================
// Preload Functions for Critical Effects
// ============================================================================

/**
 * Preload functions to trigger loading before component is rendered
 * Useful for preloading effects based on user interaction or route changes
 */
export const preloadEffects = {
  aurora: () => import('./AuroraBackground'),
  spotlight: () => import('./Spotlight'),
  particles: () => import('./ParticleField'),
  blob: () => import('./MorphingBlob'),
  all: () =>
    Promise.all([
      import('./AuroraBackground'),
      import('./Spotlight'),
      import('./ParticleField'),
      import('./MorphingBlob'),
    ]),
};

export default {
  LazyAuroraBackground,
  LazySpotlight,
  LazyParticleField,
  LazyMorphingBlob,
  EffectSkeleton,
  preloadEffects,
};
