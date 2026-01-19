/**
 * GlowCard - Premium animated card component with glow effects
 *
 * Features:
 * - Animated rotating gradient border glow
 * - Configurable glow color (per provider)
 * - Hover state with intensified glow and 3D transform
 * - Backdrop blur with noise texture
 * - 3D perspective transform on hover
 * - Multiple variants: default, elevated, floating
 *
 * @example
 * <GlowCard glowColor="#f59e0b" intensity={0.8}>
 *   <ProviderContent />
 * </GlowCard>
 *
 * <GlowCard variant="floating" glowColor="#3b82f6">
 *   <ProviderCard />
 * </GlowCard>
 */

import React, { useState, useRef, useCallback, forwardRef, useMemo } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

// ============================================================================
// TYPES
// ============================================================================

export type GlowCardVariant = 'default' | 'elevated' | 'floating';

export interface GlowCardProps {
  /** Glow color - CSS color value (hex, rgb, hsl) */
  glowColor?: string;
  /** Glow intensity 0-1 (default: 0.6) */
  intensity?: number;
  /** Card variant */
  variant?: GlowCardVariant;
  /** Additional CSS classes */
  className?: string;
  /** Click handler */
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  /** Children to render inside card */
  children?: React.ReactNode;
  /** Disable hover effects */
  disableHover?: boolean;
  /** Disable 3D tilt effect */
  disableTilt?: boolean;
  /** Disable glow animation */
  disableAnimation?: boolean;
  /** Border radius in pixels (default: 16) */
  borderRadius?: number;
  /** Animation speed multiplier (default: 1) */
  animationSpeed?: number;
  /** Aria label for accessibility */
  'aria-label'?: string;
  /** Aria role */
  role?: string;
  /** Tab index for keyboard navigation */
  tabIndex?: number;
}

// ============================================================================
// PROVIDER GLOW PRESETS
// ============================================================================

export const PROVIDER_GLOW_COLORS = {
  claude: '#f59e0b',
  gemini: '#3b82f6',
  jules: '#a855f7',
  codex: '#22c55e',
  grok: '#6b7280',
  deepseek: '#ef4444',
  ollama: '#ec4899',
  default: '#ffffff',
} as const;

export type ProviderType = keyof typeof PROVIDER_GLOW_COLORS;

// ============================================================================
// COMPONENT
// ============================================================================

const GlowCard = forwardRef<HTMLDivElement, GlowCardProps>(
  (
    {
      glowColor = PROVIDER_GLOW_COLORS.default,
      intensity = 0.6,
      variant = 'default',
      className = '',
      onClick,
      children,
      disableHover = false,
      disableTilt = false,
      disableAnimation = false,
      borderRadius = 16,
      animationSpeed = 1,
      'aria-label': ariaLabel,
      role,
      tabIndex,
    },
    ref
  ) => {
    const { resolvedTheme } = useTheme();
    const isLight = resolvedTheme === 'light';
    const cardRef = useRef<HTMLDivElement>(null);

    // State
    const [isHovered, setIsHovered] = useState(false);
    const [tiltStyle, setTiltStyle] = useState<React.CSSProperties>({});
    const [glowPosition, setGlowPosition] = useState({ x: 50, y: 50 });

    // Compute animation duration based on speed
    const animationDuration = useMemo(
      () => `${4 / animationSpeed}s`,
      [animationSpeed]
    );

    // Compute effective intensity based on hover state
    const effectiveIntensity = useMemo(() => {
      if (isHovered && !disableHover) {
        return Math.min(intensity * 1.5, 1);
      }
      return intensity;
    }, [isHovered, intensity, disableHover]);

    // 3D Tilt effect on mouse move
    const handleMouseMove = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        const card = cardRef.current;
        if (disableTilt || disableHover || !card) return;

        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        // Calculate rotation (max 6 degrees)
        const rotateX = ((y - centerY) / centerY) * -6;
        const rotateY = ((x - centerX) / centerX) * 6;

        // Calculate glow position (percentage)
        const glowX = (x / rect.width) * 100;
        const glowY = (y / rect.height) * 100;

        setTiltStyle({
          transform: `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`,
        });
        setGlowPosition({ x: glowX, y: glowY });
      },
      [disableTilt, disableHover]
    );

    const handleMouseEnter = useCallback(() => {
      if (!disableHover) {
        setIsHovered(true);
      }
    }, [disableHover]);

    const handleMouseLeave = useCallback(() => {
      setIsHovered(false);
      setTiltStyle({
        transform: 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)',
      });
      setGlowPosition({ x: 50, y: 50 });
    }, []);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick(e as unknown as React.MouseEvent<HTMLDivElement>);
        }
      },
      [onClick]
    );

    // Variant-specific styles
    const variantStyles = useMemo((): React.CSSProperties => {
      const baseTransform = 'translateZ(0)';
      
      switch (variant) {
        case 'elevated':
          return {
            boxShadow: isLight
              ? `0 12px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.08)`
              : `0 12px 40px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.3)`,
            transform: baseTransform,
          };
        case 'floating':
          return {
            boxShadow: isLight
              ? `0 20px 60px rgba(0,0,0,0.15), 0 8px 24px rgba(0,0,0,0.1)`
              : `0 20px 60px rgba(0,0,0,0.6), 0 8px 24px rgba(0,0,0,0.4)`,
            transform: `${baseTransform} translateY(-4px)`,
          };
        default:
          return {
            boxShadow: isLight
              ? `0 4px 16px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)`
              : `0 4px 16px rgba(0,0,0,0.3), 0 2px 6px rgba(0,0,0,0.2)`,
            transform: baseTransform,
          };
      }
    }, [variant, isLight]);

    // Background styles based on theme
    const backgroundStyle = useMemo((): React.CSSProperties => {
      return {
        background: isLight
          ? 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(250,250,250,0.9) 100%)'
          : 'linear-gradient(135deg, rgba(26,26,26,0.95) 0%, rgba(20,20,20,0.9) 100%)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      };
    }, [isLight]);

    // Border glow gradient
    const glowGradient = useMemo(() => {
      const alpha = effectiveIntensity;
      return `linear-gradient(90deg, 
        ${glowColor}${Math.round(alpha * 255).toString(16).padStart(2, '0')}, 
        transparent 25%, 
        ${glowColor}${Math.round(alpha * 0.6 * 255).toString(16).padStart(2, '0')} 50%, 
        transparent 75%, 
        ${glowColor}${Math.round(alpha * 255).toString(16).padStart(2, '0')}
      )`;
    }, [glowColor, effectiveIntensity]);

    // Cursor glow style
    const cursorGlowStyle = useMemo((): React.CSSProperties | null => {
      if (!isHovered || disableHover) return null;
      
      const glowAlpha = effectiveIntensity * 0.3;
      return {
        background: `radial-gradient(circle at ${glowPosition.x}% ${glowPosition.y}%, ${glowColor}${Math.round(glowAlpha * 255).toString(16).padStart(2, '0')} 0%, transparent 60%)`,
      };
    }, [isHovered, disableHover, glowPosition, glowColor, effectiveIntensity]);

    return (
      <div
        ref={(node) => {
          // Handle both refs
          (cardRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          if (typeof ref === 'function') {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        }}
        className={`glow-card relative overflow-hidden ${className}`}
        style={{
          borderRadius,
          ...variantStyles,
          ...(!disableTilt && !disableHover ? tiltStyle : {}),
          transformStyle: 'preserve-3d',
          willChange: 'transform',
          transition: 'transform 0.3s ease-out, box-shadow 0.3s ease',
        }}
        onClick={onClick}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onKeyDown={handleKeyDown}
        aria-label={ariaLabel}
        role={role || (onClick ? 'button' : undefined)}
        tabIndex={tabIndex ?? (onClick ? 0 : undefined)}
      >
        {/* Animated gradient border glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            borderRadius: borderRadius + 2,
            padding: 2,
            background: glowGradient,
            backgroundSize: '300% 100%',
            animation: disableAnimation
              ? 'none'
              : `gradient-border-rotate ${animationDuration} linear infinite`,
            opacity: isHovered && !disableHover ? 1 : 0.7,
            transition: 'opacity 0.3s ease',
            zIndex: -1,
            margin: -2,
          }}
        />

        {/* Outer glow blur effect */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            borderRadius: borderRadius + 8,
            background: glowGradient,
            backgroundSize: '300% 100%',
            animation: disableAnimation
              ? 'none'
              : `gradient-border-rotate ${animationDuration} linear infinite`,
            opacity: effectiveIntensity * 0.4,
            filter: `blur(${16 + effectiveIntensity * 8}px)`,
            transition: 'opacity 0.3s ease, filter 0.3s ease',
            zIndex: -2,
            margin: -8,
          }}
        />

        {/* Main card background with glass effect */}
        <div
          className="absolute inset-0 rounded-inherit"
          style={{
            borderRadius,
            ...backgroundStyle,
            border: `1px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)'}`,
          }}
        />

        {/* Noise texture overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            borderRadius,
            opacity: isLight ? 0.02 : 0.04,
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
            mixBlendMode: isLight ? 'multiply' : 'overlay',
          }}
        />

        {/* Cursor-following glow */}
        {cursorGlowStyle && (
          <div
            className="absolute inset-0 pointer-events-none transition-opacity duration-300"
            style={{
              borderRadius,
              ...cursorGlowStyle,
              opacity: 1,
            }}
          />
        )}

        {/* Top shine effect */}
        <div
          className="absolute inset-x-0 top-0 h-1/2 pointer-events-none"
          style={{
            borderRadius: `${borderRadius}px ${borderRadius}px 0 0`,
            background: isLight
              ? 'linear-gradient(180deg, rgba(255,255,255,0.6) 0%, transparent 100%)'
              : 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 100%)',
            opacity: isHovered && !disableHover ? 0.8 : 0.4,
            transition: 'opacity 0.3s ease',
          }}
        />

        {/* Hover border highlight */}
        {isHovered && !disableHover && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              borderRadius,
              border: `1px solid ${glowColor}${Math.round(effectiveIntensity * 0.4 * 255).toString(16).padStart(2, '0')}`,
              transition: 'border-color 0.3s ease',
            }}
          />
        )}

        {/* Content container with 3D depth */}
        <div
          className="relative z-10 h-full w-full"
          style={{
            transform: 'translateZ(20px)',
            transformStyle: 'preserve-3d',
          }}
        >
          {children}
        </div>
      </div>
    );
  }
);

GlowCard.displayName = 'GlowCard';

export default GlowCard;

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export { GlowCard };

/**
 * Helper function to get provider glow color
 */
export function getProviderGlowColor(provider: string): string {
  const normalizedProvider = provider.toLowerCase() as ProviderType;
  return PROVIDER_GLOW_COLORS[normalizedProvider] || PROVIDER_GLOW_COLORS.default;
}
