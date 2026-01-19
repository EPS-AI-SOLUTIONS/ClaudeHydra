import React, { useRef, useEffect, useCallback, memo } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { useMousePosition } from '../../hooks/useMousePosition';

export interface MagneticElement {
  /** CSS selector for magnetic elements */
  selector: string;
  /** Magnetic pull strength 0-1 (default: 0.3) */
  strength?: number;
  /** Distance threshold in pixels (default: 100) */
  threshold?: number;
}

export interface SpotlightProps {
  /** Spotlight radius in pixels (default: 200) */
  size?: number;
  /** Spotlight color - CSS color value (default: theme-aware white/black) */
  color?: string;
  /** Blur amount in pixels (default: 80) */
  blur?: number;
  /** Opacity/intensity 0-1 (default: 0.15) */
  intensity?: number;
  /** Enable magnetic attraction to elements (default: false) */
  magnetic?: boolean;
  /** Magnetic element configurations */
  magneticElements?: MagneticElement[];
  /** Easing factor for smooth follow 0-1 (default: 0.12) */
  easing?: number;
  /** Whether spotlight is enabled (default: true) */
  enabled?: boolean;
  /** Additional CSS class */
  className?: string;
  /** Z-index (default: 1) */
  zIndex?: number;
}

interface MagneticTarget {
  element: HTMLElement;
  centerX: number;
  centerY: number;
  strength: number;
  threshold: number;
  distance: number;
}

/**
 * Spotlight - Mouse-following radial gradient spotlight effect
 * Optimized with requestAnimationFrame and CSS transforms
 */
const Spotlight: React.FC<SpotlightProps> = memo(
  ({
    size = 200,
    color,
    blur = 80,
    intensity = 0.15,
    magnetic = false,
    magneticElements = [],
    easing = 0.12,
    enabled = true,
    className = '',
    zIndex = 1,
  }) => {
    const { resolvedTheme } = useTheme();
    const containerRef = useRef<HTMLDivElement>(null);
    const spotlightRef = useRef<HTMLDivElement>(null);
    const animationRef = useRef<number>(0);
    const currentPosRef = useRef({ x: 0, y: 0 });
    const targetPosRef = useRef({ x: 0, y: 0 });

    // Get mouse position with built-in smoothing disabled (we handle it ourselves)
    const mousePos = useMousePosition({
      smooth: false,
    });

    // Determine spotlight color based on theme
    const spotlightColor = color || (resolvedTheme === 'light' ? '#000000' : '#ffffff');

    // Find nearest magnetic element and calculate attraction
    const calculateMagneticPull = useCallback(
      (
        mouseX: number,
        mouseY: number
      ): { x: number; y: number; hasMagnet: boolean } => {
        if (!magnetic || magneticElements.length === 0) {
          return { x: mouseX, y: mouseY, hasMagnet: false };
        }

        const targets: MagneticTarget[] = [];

        // Find all magnetic elements and calculate distances
        magneticElements.forEach(({ selector, strength = 0.3, threshold = 100 }) => {
          const elements = document.querySelectorAll<HTMLElement>(selector);
          elements.forEach((element) => {
            const rect = element.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const distance = Math.hypot(mouseX - centerX, mouseY - centerY);

            if (distance < threshold) {
              targets.push({
                element,
                centerX,
                centerY,
                strength,
                threshold,
                distance,
              });
            }
          });
        });

        // No magnetic targets in range
        if (targets.length === 0) {
          return { x: mouseX, y: mouseY, hasMagnet: false };
        }

        // Find the closest target
        const closest = targets.reduce((a, b) => (a.distance < b.distance ? a : b));

        // Calculate magnetic pull (stronger when closer)
        const pullFactor = 1 - closest.distance / closest.threshold;
        const magneticStrength = pullFactor * closest.strength;

        // Interpolate position towards magnetic center
        const magnetX = mouseX + (closest.centerX - mouseX) * magneticStrength;
        const magnetY = mouseY + (closest.centerY - mouseY) * magneticStrength;

        return { x: magnetX, y: magnetY, hasMagnet: true };
      },
      [magnetic, magneticElements]
    );

    // Animation loop for smooth movement
    useEffect(() => {
      if (!enabled) return;

      const animate = () => {
        const spotlight = spotlightRef.current;
        if (!spotlight) {
          animationRef.current = requestAnimationFrame(animate);
          return;
        }

        // Calculate target position with magnetic pull
        const { x: targetX, y: targetY } = calculateMagneticPull(
          mousePos.x,
          mousePos.y
        );
        targetPosRef.current = { x: targetX, y: targetY };

        // Apply easing
        const dx = targetPosRef.current.x - currentPosRef.current.x;
        const dy = targetPosRef.current.y - currentPosRef.current.y;

        // Only update if there's movement
        if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
          currentPosRef.current.x += dx * easing;
          currentPosRef.current.y += dy * easing;

          // Use transform for GPU-accelerated positioning
          spotlight.style.transform = `translate3d(${currentPosRef.current.x - size / 2}px, ${currentPosRef.current.y - size / 2}px, 0)`;
        }

        animationRef.current = requestAnimationFrame(animate);
      };

      animationRef.current = requestAnimationFrame(animate);

      return () => {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
      };
    }, [enabled, mousePos.x, mousePos.y, easing, size, calculateMagneticPull]);

    // Don't render if disabled
    if (!enabled) {
      return null;
    }

    return (
      <div
        ref={containerRef}
        className={`spotlight-container ${className}`}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex,
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
      >
        <div
          ref={spotlightRef}
          className="spotlight-gradient"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: size,
            height: size,
            borderRadius: '50%',
            background: `radial-gradient(circle at center, ${spotlightColor} 0%, transparent 70%)`,
            opacity: mousePos.isActive ? intensity : 0,
            filter: `blur(${blur}px)`,
            willChange: 'transform, opacity',
            transition: 'opacity 0.3s ease',
            transform: `translate3d(${-size / 2}px, ${-size / 2}px, 0)`,
          }}
        />
      </div>
    );
  }
);

Spotlight.displayName = 'Spotlight';

export default Spotlight;
