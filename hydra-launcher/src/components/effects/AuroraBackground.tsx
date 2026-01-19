import React, { useMemo } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

export interface AuroraBackgroundProps {
  /** Intensity of the aurora effect (0.0 - 1.0) */
  intensity?: number;
  /** Custom colors for aurora layers. Default uses theme-appropriate colors */
  colors?: string[];
  /** Animation speed multiplier (1.0 = normal) */
  speed?: number;
  /** Blur amount in pixels */
  blur?: number;
  /** Additional CSS classes */
  className?: string;
  /** Children to render on top of aurora */
  children?: React.ReactNode;
}

/**
 * AuroraBackground - Animated gradient background resembling aurora borealis
 *
 * Uses pure CSS animations for optimal performance with GPU acceleration.
 * Supports light/dark mode with automatic color adjustment.
 */
const AuroraBackground: React.FC<AuroraBackgroundProps> = ({
  intensity = 0.6,
  colors,
  speed = 1,
  blur = 120,
  className = '',
  children,
}) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  // Default color palettes for light/dark modes
  const defaultDarkColors = [
    'rgba(20, 184, 166, 0.4)',   // Teal
    'rgba(139, 92, 246, 0.35)',  // Purple
    'rgba(59, 130, 246, 0.3)',   // Blue
    'rgba(236, 72, 153, 0.25)',  // Pink
  ];

  const defaultLightColors = [
    'rgba(20, 184, 166, 0.25)',  // Teal (softer)
    'rgba(139, 92, 246, 0.2)',   // Purple (softer)
    'rgba(59, 130, 246, 0.2)',   // Blue (softer)
    'rgba(236, 72, 153, 0.15)',  // Pink (softer)
  ];

  const auroraColors = colors || (isLight ? defaultLightColors : defaultDarkColors);

  // Memoize animation durations based on speed
  const animationDurations = useMemo(() => {
    const baseSpeed = 1 / speed;
    return {
      layer1: `${18 * baseSpeed}s`,
      layer2: `${22 * baseSpeed}s`,
      layer3: `${26 * baseSpeed}s`,
      layer4: `${30 * baseSpeed}s`,
      pulse1: `${8 * baseSpeed}s`,
      pulse2: `${10 * baseSpeed}s`,
      pulse3: `${12 * baseSpeed}s`,
      pulse4: `${14 * baseSpeed}s`,
    };
  }, [speed]);

  // Adjust opacity based on intensity
  const adjustedOpacity = (baseOpacity: number) => baseOpacity * intensity;

  // Generate inline styles for each layer
  const layerStyles = useMemo(() => {
    const baseStyles: React.CSSProperties = {
      position: 'absolute',
      inset: 0,
      filter: `blur(${blur}px)`,
      willChange: 'transform, opacity',
      transform: 'translateZ(0)', // Force GPU acceleration
      backfaceVisibility: 'hidden',
    };

    return [
      {
        ...baseStyles,
        background: `radial-gradient(ellipse 80% 50% at 20% 40%, ${auroraColors[0] || 'transparent'}, transparent 70%)`,
        opacity: adjustedOpacity(1),
        animation: `aurora-drift-1 ${animationDurations.layer1} ease-in-out infinite, aurora-pulse-1 ${animationDurations.pulse1} ease-in-out infinite`,
      },
      {
        ...baseStyles,
        background: `radial-gradient(ellipse 70% 60% at 70% 30%, ${auroraColors[1] || 'transparent'}, transparent 70%)`,
        opacity: adjustedOpacity(0.9),
        animation: `aurora-drift-2 ${animationDurations.layer2} ease-in-out infinite, aurora-pulse-2 ${animationDurations.pulse2} ease-in-out infinite`,
      },
      {
        ...baseStyles,
        background: `radial-gradient(ellipse 60% 70% at 40% 60%, ${auroraColors[2] || 'transparent'}, transparent 65%)`,
        opacity: adjustedOpacity(0.8),
        animation: `aurora-drift-3 ${animationDurations.layer3} ease-in-out infinite, aurora-pulse-3 ${animationDurations.pulse3} ease-in-out infinite`,
      },
      {
        ...baseStyles,
        background: `radial-gradient(ellipse 90% 40% at 60% 80%, ${auroraColors[3] || 'transparent'}, transparent 60%)`,
        opacity: adjustedOpacity(0.7),
        animation: `aurora-drift-4 ${animationDurations.layer4} ease-in-out infinite, aurora-pulse-4 ${animationDurations.pulse4} ease-in-out infinite`,
      },
    ] as React.CSSProperties[];
  }, [auroraColors, blur, intensity, animationDurations]);

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    zIndex: 0,
    pointerEvents: 'none',
    backgroundColor: isLight ? '#fafafa' : '#0a0a0a',
  };

  return (
    <>
      {/* CSS Keyframes - injected once */}
      <style>{`
        @keyframes aurora-drift-1 {
          0%, 100% {
            transform: translate(0%, 0%) scale(1) rotate(0deg);
          }
          25% {
            transform: translate(10%, -5%) scale(1.1) rotate(2deg);
          }
          50% {
            transform: translate(5%, 10%) scale(0.95) rotate(-1deg);
          }
          75% {
            transform: translate(-5%, 5%) scale(1.05) rotate(1deg);
          }
        }

        @keyframes aurora-drift-2 {
          0%, 100% {
            transform: translate(0%, 0%) scale(1) rotate(0deg);
          }
          25% {
            transform: translate(-8%, 6%) scale(1.05) rotate(-2deg);
          }
          50% {
            transform: translate(6%, -8%) scale(1.1) rotate(1deg);
          }
          75% {
            transform: translate(4%, 4%) scale(0.95) rotate(-1deg);
          }
        }

        @keyframes aurora-drift-3 {
          0%, 100% {
            transform: translate(0%, 0%) scale(1) rotate(0deg);
          }
          25% {
            transform: translate(5%, 8%) scale(0.95) rotate(1deg);
          }
          50% {
            transform: translate(-10%, 3%) scale(1.08) rotate(-2deg);
          }
          75% {
            transform: translate(-3%, -6%) scale(1.02) rotate(1deg);
          }
        }

        @keyframes aurora-drift-4 {
          0%, 100% {
            transform: translate(0%, 0%) scale(1) rotate(0deg);
          }
          25% {
            transform: translate(-6%, -4%) scale(1.08) rotate(-1deg);
          }
          50% {
            transform: translate(8%, 6%) scale(0.92) rotate(2deg);
          }
          75% {
            transform: translate(2%, -8%) scale(1.04) rotate(-1deg);
          }
        }

        @keyframes aurora-pulse-1 {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        @keyframes aurora-pulse-2 {
          0%, 100% { opacity: 0.9; }
          50% { opacity: 0.6; }
        }

        @keyframes aurora-pulse-3 {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 0.55; }
        }

        @keyframes aurora-pulse-4 {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 0.5; }
        }

        /* Reduced motion preference */
        @media (prefers-reduced-motion: reduce) {
          .aurora-layer {
            animation: none !important;
          }
        }
      `}</style>

      <div
        className={`aurora-background ${className}`}
        style={containerStyle}
        aria-hidden="true"
      >
        {/* Aurora gradient layers */}
        {layerStyles.map((style, index) => (
          <div
            key={index}
            className="aurora-layer"
            style={style}
          />
        ))}

        {/* Overlay for subtle noise/grain effect */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: isLight ? 0.02 : 0.03,
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Content layer */}
      {children && (
        <div style={{ position: 'relative', zIndex: 1 }}>
          {children}
        </div>
      )}
    </>
  );
};

export default AuroraBackground;
