/**
 * Effects components barrel exports
 *
 * Visual effect components for backgrounds and animations.
 * Includes both eager-loaded and lazy-loaded variants.
 */

// ============================================================================
// Eager-loaded components (immediate loading)
// ============================================================================

export { default as AuroraBackground } from './AuroraBackground';
export type { AuroraBackgroundProps } from './AuroraBackground';

export { default as MorphingBlob } from './MorphingBlob';
export type { MorphingBlobProps } from './MorphingBlob';

export { default as ParticleField } from './ParticleField';
export type { ParticleFieldProps } from './ParticleField';

export { default as Spotlight } from './Spotlight';
export type { SpotlightProps, MagneticElement } from './Spotlight';

// ============================================================================
// Lazy-loaded components (code-split, on-demand loading)
// ============================================================================

export {
  LazyAuroraBackground,
  LazySpotlight,
  LazyParticleField,
  LazyMorphingBlob,
  EffectSkeleton,
  preloadEffects,
} from './LazyEffects';
export type { EffectSkeletonProps } from './LazyEffects';

// ============================================================================
// Lazy load wrappers (intersection observer based)
// ============================================================================

export {
  default as LazyLoadWrapper,
  LazyEffect,
  LazySection,
  withLazyLoading,
} from './LazyLoadWrapper';
export type {
  LazyLoadWrapperProps,
  LazyEffectProps,
  LazySectionProps,
} from './LazyLoadWrapper';
