import { useState, useEffect, useRef, useCallback } from 'react';

export interface MousePosition {
  x: number;
  y: number;
  isActive: boolean;
}

export interface UseMousePositionOptions {
  /** Enable smooth easing (default: true) */
  smooth?: boolean;
  /** Easing factor 0-1, lower = smoother (default: 0.15) */
  easingFactor?: number;
  /** Throttle updates in ms (default: 16 for ~60fps) */
  throttleMs?: number;
  /** Element to track within (default: window) */
  targetRef?: React.RefObject<HTMLElement>;
}

/**
 * High-performance hook for tracking mouse position with optional smooth easing
 * Uses requestAnimationFrame for optimal performance
 */
export function useMousePosition(options: UseMousePositionOptions = {}): MousePosition {
  const {
    smooth = true,
    easingFactor = 0.15,
    throttleMs = 16,
    targetRef,
  } = options;

  const [position, setPosition] = useState<MousePosition>({
    x: 0,
    y: 0,
    isActive: false,
  });

  // Raw mouse position (unsmoothed)
  const rawPosition = useRef({ x: 0, y: 0 });
  // Smoothed position for animation
  const smoothedPosition = useRef({ x: 0, y: 0 });
  // Animation frame reference
  const animationFrameRef = useRef<number>(0);
  // Last update timestamp for throttling
  const lastUpdateRef = useRef<number>(0);
  // Is mouse currently within bounds
  const isActiveRef = useRef(false);

  // Smooth animation loop using requestAnimationFrame
  const animate = useCallback(
    (timestamp: number) => {
      if (!smooth) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      // Throttle updates
      const elapsed = timestamp - lastUpdateRef.current;
      if (elapsed < throttleMs) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }
      lastUpdateRef.current = timestamp;

      // Apply easing: smoothed = smoothed + (target - smoothed) * factor
      const dx = rawPosition.current.x - smoothedPosition.current.x;
      const dy = rawPosition.current.y - smoothedPosition.current.y;

      // Only update if there's significant movement (> 0.5px)
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        smoothedPosition.current.x += dx * easingFactor;
        smoothedPosition.current.y += dy * easingFactor;

        setPosition({
          x: Math.round(smoothedPosition.current.x),
          y: Math.round(smoothedPosition.current.y),
          isActive: isActiveRef.current,
        });
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    },
    [smooth, easingFactor, throttleMs]
  );

  useEffect(() => {
    const target = targetRef?.current || window;

    const handleMouseMove = (event: MouseEvent) => {
      let x: number;
      let y: number;

      if (targetRef?.current) {
        const rect = targetRef.current.getBoundingClientRect();
        x = event.clientX - rect.left;
        y = event.clientY - rect.top;
      } else {
        x = event.clientX;
        y = event.clientY;
      }

      rawPosition.current = { x, y };
      isActiveRef.current = true;

      // If not smooth, update immediately
      if (!smooth) {
        setPosition({ x, y, isActive: true });
      }
    };

    const handleMouseEnter = () => {
      isActiveRef.current = true;
      setPosition((prev) => ({ ...prev, isActive: true }));
    };

    const handleMouseLeave = () => {
      isActiveRef.current = false;
      setPosition((prev) => ({ ...prev, isActive: false }));
    };

    // Add event listeners
    target.addEventListener('mousemove', handleMouseMove as EventListener);
    target.addEventListener('mouseenter', handleMouseEnter);
    target.addEventListener('mouseleave', handleMouseLeave);

    // Start animation loop if smooth mode
    if (smooth) {
      animationFrameRef.current = requestAnimationFrame(animate);
    }

    return () => {
      target.removeEventListener('mousemove', handleMouseMove as EventListener);
      target.removeEventListener('mouseenter', handleMouseEnter);
      target.removeEventListener('mouseleave', handleMouseLeave);

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [smooth, animate, targetRef]);

  return position;
}

export default useMousePosition;
