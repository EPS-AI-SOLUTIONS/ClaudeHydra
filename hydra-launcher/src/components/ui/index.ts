/**
 * UI Components
 *
 * Reusable UI primitives and animation components
 */

export { default as AnimatedText, AnimatedText as AnimatedTextComponent } from './AnimatedText';
export type { AnimatedTextProps, AnimatedTextEffect } from './AnimatedText';

export { default as FloatingDock, FloatingDock as FloatingDockComponent } from './FloatingDock';
export type { DockItem, FloatingDockProps, FloatingDockItem } from './FloatingDock';

export { default as GlowCard, GlowCard as GlowCardComponent, getProviderGlowColor, PROVIDER_GLOW_COLORS } from './GlowCard';
export type { GlowCardProps, GlowCardVariant, ProviderType } from './GlowCard';
