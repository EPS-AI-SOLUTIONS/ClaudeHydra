/**
 * BentoGrid - Modern Bento Box Layout Component
 *
 * Inspired by bento.me, linear.app, and Apple's design language
 * Features:
 * - Responsive grid with variable cell sizes (1x1, 2x1, 1x2, 2x2)
 * - Staggered entrance animations
 * - 3D tilt hover effects
 * - Configurable gaps and padding
 * - Glassmorphism styling
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

// ============================================================================
// TYPES
// ============================================================================

export type BentoSize = '1x1' | '2x1' | '1x2' | '2x2';

export interface BentoItemData {
  id: string;
  size?: BentoSize;
  className?: string;
  children?: React.ReactNode;
  // Optional styling overrides
  background?: string;
  borderColor?: string;
  glowColor?: string;
  // Disable animations for specific items
  disableTilt?: boolean;
  disableHover?: boolean;
}

export interface BentoGridProps {
  items: BentoItemData[];
  columns?: 2 | 3 | 4 | 6;
  gap?: 'sm' | 'md' | 'lg' | 'xl';
  animate?: boolean;
  animationDelay?: number;
  className?: string;
  itemClassName?: string;
}

export interface BentoItemProps extends Omit<BentoItemData, 'id'> {
  index?: number;
  animate?: boolean;
  animationDelay?: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const GAP_SIZES = {
  sm: 'gap-2',
  md: 'gap-3',
  lg: 'gap-4',
  xl: 'gap-6',
};

const COLUMN_CLASSES = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 md:grid-cols-3',
  4: 'grid-cols-2 md:grid-cols-4',
  6: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6',
};

// Responsive size adjustments - larger items collapse on mobile
const SIZE_RESPONSIVE: Record<BentoSize, string> = {
  '1x1': 'col-span-1 row-span-1',
  '2x1': 'col-span-1 sm:col-span-2 row-span-1',
  '1x2': 'col-span-1 row-span-1 sm:row-span-2',
  '2x2': 'col-span-1 sm:col-span-2 row-span-1 sm:row-span-2',
};

// ============================================================================
// BENTO ITEM COMPONENT
// ============================================================================

export const BentoItem: React.FC<BentoItemProps> = ({
  size = '1x1',
  className = '',
  children,
  background,
  borderColor,
  glowColor,
  disableTilt = false,
  disableHover = false,
  index = 0,
  animate = true,
  animationDelay = 100,
}) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  const itemRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isVisible, setIsVisible] = useState(!animate);
  const [tiltStyle, setTiltStyle] = useState<React.CSSProperties>({});
  const [glowPosition, setGlowPosition] = useState({ x: 50, y: 50 });

  // Staggered entrance animation
  useEffect(() => {
    if (animate) {
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, index * animationDelay);
      return () => clearTimeout(timer);
    }
  }, [animate, index, animationDelay]);

  // 3D Tilt effect on mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (disableTilt || !itemRef.current) return;

    const rect = itemRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Calculate rotation (max 8 degrees)
    const rotateX = ((y - centerY) / centerY) * -8;
    const rotateY = ((x - centerX) / centerX) * 8;

    // Calculate glow position (percentage)
    const glowX = (x / rect.width) * 100;
    const glowY = (y / rect.height) * 100;

    setTiltStyle({
      transform: `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`,
    });
    setGlowPosition({ x: glowX, y: glowY });
  }, [disableTilt]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    setTiltStyle({
      transform: 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)',
    });
    setGlowPosition({ x: 50, y: 50 });
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (!disableHover) {
      setIsHovered(true);
    }
  }, [disableHover]);

  // Dynamic styles based on theme
  const bgStyle = background || (isLight
    ? 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(250,250,250,0.8) 100%)'
    : 'linear-gradient(135deg, rgba(26,26,26,0.9) 0%, rgba(20,20,20,0.8) 100%)');

  const borderStyle = borderColor || (isLight
    ? 'rgba(0,0,0,0.08)'
    : 'rgba(255,255,255,0.08)');

  const glowColorStyle = glowColor || (isLight
    ? 'rgba(0,0,0,0.03)'
    : 'rgba(255,255,255,0.06)');

  return (
    <div
      ref={itemRef}
      className={`
        relative overflow-hidden rounded-2xl
        transition-all duration-500 ease-out
        ${SIZE_RESPONSIVE[size]}
        ${className}
        ${!isVisible ? 'opacity-0 translate-y-8 scale-95' : 'opacity-100 translate-y-0 scale-100'}
      `}
      style={{
        ...tiltStyle,
        transformStyle: 'preserve-3d',
        willChange: 'transform',
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Background layer */}
      <div
        className="absolute inset-0 rounded-2xl backdrop-blur-xl"
        style={{
          background: bgStyle,
          border: `1px solid ${borderStyle}`,
          boxShadow: isHovered
            ? isLight
              ? '0 20px 40px rgba(0,0,0,0.1), 0 8px 16px rgba(0,0,0,0.06)'
              : '0 20px 40px rgba(0,0,0,0.4), 0 8px 16px rgba(0,0,0,0.3)'
            : isLight
              ? '0 4px 12px rgba(0,0,0,0.04), 0 1px 4px rgba(0,0,0,0.02)'
              : '0 4px 12px rgba(0,0,0,0.2), 0 1px 4px rgba(0,0,0,0.1)',
          transition: 'box-shadow 0.4s ease, border-color 0.3s ease',
        }}
      />

      {/* Gradient glow that follows cursor */}
      {isHovered && !disableHover && (
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none transition-opacity duration-300"
          style={{
            background: `radial-gradient(circle at ${glowPosition.x}% ${glowPosition.y}%, ${glowColorStyle} 0%, transparent 60%)`,
            opacity: isHovered ? 1 : 0,
          }}
        />
      )}

      {/* Shine effect on top */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{
          background: isLight
            ? 'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 40%)'
            : 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 40%)',
          opacity: isHovered ? 0.8 : 0.4,
          transition: 'opacity 0.3s ease',
        }}
      />

      {/* Border highlight on hover */}
      {isHovered && !disableHover && (
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            border: isLight
              ? '1px solid rgba(0,0,0,0.12)'
              : '1px solid rgba(255,255,255,0.15)',
            transition: 'border-color 0.3s ease',
          }}
        />
      )}

      {/* Content container */}
      <div
        className="relative z-10 h-full w-full p-4"
        style={{
          transform: 'translateZ(20px)',
          transformStyle: 'preserve-3d',
        }}
      >
        {children}
      </div>
    </div>
  );
};

// ============================================================================
// BENTO GRID COMPONENT
// ============================================================================

const BentoGrid: React.FC<BentoGridProps> = ({
  items,
  columns = 4,
  gap = 'md',
  animate = true,
  animationDelay = 100,
  className = '',
  itemClassName = '',
}) => {
  return (
    <div
      className={`
        grid auto-rows-[minmax(120px,1fr)]
        ${COLUMN_CLASSES[columns]}
        ${GAP_SIZES[gap]}
        ${className}
      `}
    >
      {items.map((item, index) => (
        <BentoItem
          key={item.id}
          size={item.size}
          className={`${itemClassName} ${item.className || ''}`}
          background={item.background}
          borderColor={item.borderColor}
          glowColor={item.glowColor}
          disableTilt={item.disableTilt}
          disableHover={item.disableHover}
          index={index}
          animate={animate}
          animationDelay={animationDelay}
        >
          {item.children}
        </BentoItem>
      ))}
    </div>
  );
};

// ============================================================================
// BENTO CARD VARIANTS - Pre-styled card components
// ============================================================================

interface BentoCardProps {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  accentColor?: string;
}

export const BentoCard: React.FC<BentoCardProps> = ({
  title,
  subtitle,
  icon,
  children,
  className = '',
  accentColor,
}) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      {(icon || title || subtitle) && (
        <div className="flex items-start gap-3 mb-3">
          {icon && (
            <div
              className={`p-2 rounded-xl flex-shrink-0 transition-all duration-300
                ${isLight
                  ? 'bg-gray-100 text-gray-700'
                  : 'bg-gray-800 text-gray-300'
                }`}
              style={accentColor ? {
                background: isLight
                  ? `${accentColor}15`
                  : `${accentColor}25`,
                color: accentColor,
              } : undefined}
            >
              {icon}
            </div>
          )}
          <div className="flex-1 min-w-0">
            {title && (
              <h3
                className={`font-mono font-semibold text-sm tracking-wide truncate
                  ${isLight ? 'text-gray-900' : 'text-white'}`}
              >
                {title}
              </h3>
            )}
            {subtitle && (
              <p
                className={`text-[11px] font-mono mt-0.5 truncate
                  ${isLight ? 'text-gray-500' : 'text-gray-400'}`}
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0">
        {children}
      </div>
    </div>
  );
};

// Stat card variant
interface BentoStatProps {
  label: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon?: React.ReactNode;
  sparkline?: number[];
}

export const BentoStat: React.FC<BentoStatProps> = ({
  label,
  value,
  change,
  changeType = 'neutral',
  icon,
  sparkline,
}) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  const changeColors = {
    positive: isLight ? 'text-green-600' : 'text-green-400',
    negative: isLight ? 'text-red-600' : 'text-red-400',
    neutral: isLight ? 'text-gray-500' : 'text-gray-400',
  };

  return (
    <div className="flex flex-col h-full justify-between">
      {/* Top section */}
      <div className="flex items-center justify-between">
        <span
          className={`text-[10px] font-mono uppercase tracking-wider
            ${isLight ? 'text-gray-500' : 'text-gray-400'}`}
        >
          {label}
        </span>
        {icon && (
          <div className={isLight ? 'text-gray-400' : 'text-gray-500'}>
            {icon}
          </div>
        )}
      </div>

      {/* Value */}
      <div className="mt-2">
        <span
          className={`text-3xl font-mono font-bold tracking-tight
            ${isLight ? 'text-gray-900' : 'text-white'}`}
        >
          {value}
        </span>
        {change && (
          <span className={`ml-2 text-xs font-mono ${changeColors[changeType]}`}>
            {changeType === 'positive' && '+'}
            {change}
          </span>
        )}
      </div>

      {/* Sparkline */}
      {sparkline && sparkline.length > 0 && (
        <div className="mt-3 flex items-end gap-0.5 h-8">
          {sparkline.map((val, i) => {
            const max = Math.max(...sparkline);
            const height = (val / max) * 100;
            const isLast = i === sparkline.length - 1;
            return (
              <div
                key={i}
                className={`flex-1 rounded-t transition-all duration-300
                  ${isLast
                    ? isLight ? 'bg-gray-800' : 'bg-white'
                    : isLight ? 'bg-gray-300' : 'bg-gray-600'
                  }`}
                style={{
                  height: `${Math.max(height, 8)}%`,
                  opacity: 0.4 + (i / sparkline.length) * 0.6,
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

// Image card variant
interface BentoImageProps {
  src: string;
  alt?: string;
  overlay?: React.ReactNode;
  objectFit?: 'cover' | 'contain' | 'fill';
}

export const BentoImage: React.FC<BentoImageProps> = ({
  src,
  alt = '',
  overlay,
  objectFit = 'cover',
}) => {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div className="absolute inset-0 overflow-hidden rounded-2xl">
      {/* Loading skeleton */}
      {!isLoaded && (
        <div className="absolute inset-0 animate-skeleton" />
      )}

      {/* Image */}
      <img
        src={src}
        alt={alt}
        className={`w-full h-full transition-opacity duration-500
          ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
        style={{ objectFit }}
        onLoad={() => setIsLoaded(true)}
      />

      {/* Overlay */}
      {overlay && (
        <div className="absolute inset-0 flex items-end p-4">
          <div className="w-full">
            {overlay}
          </div>
        </div>
      )}
    </div>
  );
};

// Feature card with gradient background
interface BentoFeatureProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  gradientFrom?: string;
  gradientTo?: string;
}

export const BentoFeature: React.FC<BentoFeatureProps> = ({
  title,
  description,
  icon,
  gradientFrom = '#374151',
  gradientTo = '#1f2937',
}) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  return (
    <div className="relative h-full overflow-hidden">
      {/* Gradient background */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          background: `linear-gradient(135deg, ${gradientFrom} 0%, ${gradientTo} 100%)`,
        }}
      />

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col">
        {/* Icon */}
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
          style={{
            background: `linear-gradient(135deg, ${gradientFrom}20 0%, ${gradientTo}20 100%)`,
            color: gradientFrom,
          }}
        >
          {icon}
        </div>

        {/* Text */}
        <h3
          className={`font-mono font-semibold text-base mb-2
            ${isLight ? 'text-gray-900' : 'text-white'}`}
        >
          {title}
        </h3>
        <p
          className={`text-[12px] leading-relaxed
            ${isLight ? 'text-gray-600' : 'text-gray-400'}`}
        >
          {description}
        </p>
      </div>
    </div>
  );
};

export default BentoGrid;
