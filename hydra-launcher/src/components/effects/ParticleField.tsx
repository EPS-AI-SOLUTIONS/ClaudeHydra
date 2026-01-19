import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

export interface ParticleFieldProps {
  /** Number of particles (max 50 for performance) */
  count?: number;
  /** Base color for particles (CSS color value) */
  color?: string;
  /** Animation speed multiplier (0.1 - 2) */
  speed?: number;
  /** Enable connections between nearby particles */
  connections?: boolean;
  /** Enable mouse interaction (parallax + repulsion) */
  mouseInteraction?: boolean;
  /** Connection distance threshold (in pixels) */
  connectionDistance?: number;
  /** Mouse repulsion strength (0 - 1) */
  repulsionStrength?: number;
  /** Custom class name */
  className?: string;
}

interface Particle {
  id: number;
  x: number; // percentage
  y: number; // percentage
  size: number;
  opacity: number;
  animationDuration: number;
  animationDelay: number;
  parallaxFactor: number;
  baseX: number;
  baseY: number;
}

interface Connection {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  opacity: number;
}

const generateParticles = (count: number, speed: number): Particle[] => {
  const particles: Particle[] = [];
  const clampedCount = Math.min(Math.max(count, 1), 50);

  for (let i = 0; i < clampedCount; i++) {
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    particles.push({
      id: i,
      x,
      y,
      baseX: x,
      baseY: y,
      size: Math.random() * 4 + 2, // 2-6px
      opacity: Math.random() * 0.6 + 0.2, // 0.2-0.8
      animationDuration: (Math.random() * 20 + 15) / speed, // 15-35s adjusted by speed
      animationDelay: Math.random() * -30, // Random start offset
      parallaxFactor: Math.random() * 0.5 + 0.1, // 0.1-0.6 parallax multiplier
    });
  }
  return particles;
};

const ParticleField: React.FC<ParticleFieldProps> = memo(({
  count = 30,
  color,
  speed = 1,
  connections = true,
  mouseInteraction = true,
  connectionDistance = 150,
  repulsionStrength = 0.3,
  className = '',
}) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Determine particle color based on theme or custom color
  const particleColor = color || (isLight ? 'rgba(80, 80, 80,' : 'rgba(200, 200, 200,');
  const connectionColor = color || (isLight ? 'rgba(100, 100, 100,' : 'rgba(180, 180, 180,');

  // Initialize particles
  useEffect(() => {
    const clampedSpeed = Math.min(Math.max(speed, 0.1), 2);
    setParticles(generateParticles(count, clampedSpeed));
  }, [count, speed]);

  // Handle container resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      setContainerSize({ width: rect.width, height: rect.height });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  // Mouse tracking for parallax effect
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!mouseInteraction || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setMousePos({ x, y });
  }, [mouseInteraction]);

  const handleMouseLeave = useCallback(() => {
    setMousePos(null);
  }, []);

  useEffect(() => {
    if (!mouseInteraction) return;

    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [mouseInteraction, handleMouseMove, handleMouseLeave]);

  // Calculate particle positions with mouse interaction
  const adjustedParticles = useMemo(() => {
    if (!mouseInteraction || !mousePos) return particles;

    return particles.map(p => {
      // Parallax effect - subtle movement based on mouse position
      const parallaxX = (mousePos.x - 50) * p.parallaxFactor * 0.1;
      const parallaxY = (mousePos.y - 50) * p.parallaxFactor * 0.1;

      // Repulsion effect
      const dx = p.baseX - mousePos.x;
      const dy = p.baseY - mousePos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const maxRepulsionDistance = 20; // percentage

      let repulsionX = 0;
      let repulsionY = 0;

      if (distance < maxRepulsionDistance && distance > 0) {
        const force = ((maxRepulsionDistance - distance) / maxRepulsionDistance) * repulsionStrength * 10;
        repulsionX = (dx / distance) * force;
        repulsionY = (dy / distance) * force;
      }

      return {
        ...p,
        x: p.baseX + parallaxX + repulsionX,
        y: p.baseY + parallaxY + repulsionY,
      };
    });
  }, [particles, mousePos, mouseInteraction, repulsionStrength]);

  // Calculate connections between nearby particles
  const connectionLines = useMemo((): Connection[] => {
    if (!connections || containerSize.width === 0) return [];

    const lines: Connection[] = [];
    const maxConnections = 100; // Limit total connections for performance
    let connectionCount = 0;

    for (let i = 0; i < adjustedParticles.length && connectionCount < maxConnections; i++) {
      for (let j = i + 1; j < adjustedParticles.length && connectionCount < maxConnections; j++) {
        const p1 = adjustedParticles[i];
        const p2 = adjustedParticles[j];

        // Calculate actual pixel distance
        const dx = (p2.x - p1.x) * containerSize.width / 100;
        const dy = (p2.y - p1.y) * containerSize.height / 100;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < connectionDistance) {
          const opacity = (1 - distance / connectionDistance) * 0.4;
          lines.push({
            id: `${i}-${j}`,
            x1: p1.x,
            y1: p1.y,
            x2: p2.x,
            y2: p2.y,
            opacity,
          });
          connectionCount++;
        }
      }
    }

    return lines;
  }, [adjustedParticles, connections, connectionDistance, containerSize]);

  // Generate unique animation keyframes for each particle
  const keyframesStyle = useMemo(() => {
    const keyframes = particles.map((p, i) => {
      // Generate random waypoints for natural floating motion
      const points = [
        { x: p.baseX, y: p.baseY },
        { x: p.baseX + (Math.random() - 0.5) * 10, y: p.baseY + (Math.random() - 0.5) * 10 },
        { x: p.baseX + (Math.random() - 0.5) * 10, y: p.baseY + (Math.random() - 0.5) * 10 },
        { x: p.baseX + (Math.random() - 0.5) * 10, y: p.baseY + (Math.random() - 0.5) * 10 },
        { x: p.baseX, y: p.baseY },
      ];

      return `
        @keyframes particle-float-${i} {
          0% { transform: translate(${points[0].x - p.baseX}%, ${points[0].y - p.baseY}%); }
          25% { transform: translate(${points[1].x - p.baseX}%, ${points[1].y - p.baseY}%); }
          50% { transform: translate(${points[2].x - p.baseX}%, ${points[2].y - p.baseY}%); }
          75% { transform: translate(${points[3].x - p.baseX}%, ${points[3].y - p.baseY}%); }
          100% { transform: translate(${points[4].x - p.baseX}%, ${points[4].y - p.baseY}%); }
        }
      `;
    }).join('\n');

    return keyframes;
  }, [particles]);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 overflow-hidden pointer-events-auto ${className}`}
      style={{ zIndex: 0 }}
    >
      {/* Inject animation keyframes */}
      <style>{keyframesStyle}</style>

      {/* SVG layer for connections */}
      {connections && connectionLines.length > 0 && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 1 }}
        >
          {connectionLines.map(line => (
            <line
              key={line.id}
              x1={`${line.x1}%`}
              y1={`${line.y1}%`}
              x2={`${line.x2}%`}
              y2={`${line.y2}%`}
              stroke={`${connectionColor}${line.opacity})`}
              strokeWidth="1"
              style={{
                transition: mouseInteraction ? 'all 0.15s ease-out' : undefined,
              }}
            />
          ))}
        </svg>
      )}

      {/* Particle elements */}
      {adjustedParticles.map((particle, i) => (
        <div
          key={particle.id}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            width: `${particle.size}px`,
            height: `${particle.size}px`,
            backgroundColor: `${particleColor}${particle.opacity})`,
            boxShadow: isLight
              ? `0 0 ${particle.size * 2}px ${particleColor}0.3)`
              : `0 0 ${particle.size * 3}px ${particleColor}0.5)`,
            transform: 'translate(-50%, -50%)',
            animation: mouseInteraction && mousePos
              ? 'none' // Disable CSS animation when mouse is active
              : `particle-float-${i} ${particle.animationDuration}s ease-in-out infinite`,
            animationDelay: `${particle.animationDelay}s`,
            transition: mouseInteraction ? 'left 0.15s ease-out, top 0.15s ease-out' : undefined,
            zIndex: 2,
            willChange: 'transform, left, top',
          }}
        />
      ))}

      {/* Optional glow effect on mouse position */}
      {mouseInteraction && mousePos && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: `${mousePos.x}%`,
            top: `${mousePos.y}%`,
            width: '200px',
            height: '200px',
            transform: 'translate(-50%, -50%)',
            background: `radial-gradient(circle, ${particleColor}0.1) 0%, transparent 70%)`,
            borderRadius: '50%',
            zIndex: 0,
            transition: 'left 0.1s ease-out, top 0.1s ease-out',
          }}
        />
      )}
    </div>
  );
});

ParticleField.displayName = 'ParticleField';

export default ParticleField;
