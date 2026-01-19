import React, { useMemo, useId } from 'react';

export interface MorphingBlobProps {
  /** Array of colors for gradient fill */
  colors?: string[];
  /** Size of the blob in pixels */
  size?: number;
  /** Animation speed multiplier (default: 1) */
  speed?: number;
  /** Blur amount in pixels */
  blur?: number;
  /** Glow intensity (0-1) */
  glow?: number;
  /** Custom className for container */
  className?: string;
  /** Opacity of the blob (0-1) */
  opacity?: number;
}

interface SingleBlobProps extends MorphingBlobProps {
  /** Unique identifier for SVG elements */
  uniqueId: string;
  /** Animation delay for staggered effect */
  delay?: number;
  /** Scale factor for size variation */
  scale?: number;
  /** X offset position */
  offsetX?: number;
  /** Y offset position */
  offsetY?: number;
}

// Generate organic blob path using smooth curves
const generateBlobPath = (seed: number, complexity: number = 6): string => {
  const points: { x: number; y: number }[] = [];
  const angleStep = (Math.PI * 2) / complexity;
  const centerX = 50;
  const centerY = 50;
  const baseRadius = 35;

  for (let i = 0; i < complexity; i++) {
    const angle = i * angleStep;
    // Add variation based on seed and index
    const radiusVariation = 8 + ((seed * (i + 1)) % 12);
    const radius = baseRadius + radiusVariation * Math.sin(seed + i * 0.5);

    points.push({
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    });
  }

  // Create smooth curve through all points
  let path = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const nextNext = points[(i + 2) % points.length];

    const cx = (current.x + next.x) / 2;
    const cy = (current.y + next.y) / 2;
    const nx = (next.x + nextNext.x) / 2;
    const ny = (next.y + nextNext.y) / 2;

    path += ` Q ${next.x} ${next.y} ${(cx + nx) / 2} ${(cy + ny) / 2}`;
  }

  path += ' Z';
  return path;
};

// Single morphing blob with animations
const SingleBlob: React.FC<SingleBlobProps> = ({
  colors = ['#3b82f6', '#8b5cf6', '#ec4899'],
  size = 200,
  speed = 1,
  blur = 40,
  glow = 0.5,
  opacity = 0.6,
  uniqueId,
  delay = 0,
  scale = 1,
  offsetX = 0,
  offsetY = 0,
}) => {
  // Generate multiple blob paths for morphing animation
  const paths = useMemo(() => [
    generateBlobPath(1, 6),
    generateBlobPath(2.5, 6),
    generateBlobPath(4, 6),
    generateBlobPath(5.5, 6),
    generateBlobPath(1, 6), // Return to start for smooth loop
  ], []);

  // Calculate animation duration based on speed
  const baseDuration = 20;
  const duration = baseDuration / speed;
  const gradientDuration = 15 / speed;

  // Create keyframe values for morph animation
  const keyTimes = '0;0.25;0.5;0.75;1';

  return (
    <svg
      width={size * scale}
      height={size * scale}
      viewBox="0 0 100 100"
      style={{
        position: 'absolute',
        left: `calc(50% - ${(size * scale) / 2}px + ${offsetX}px)`,
        top: `calc(50% - ${(size * scale) / 2}px + ${offsetY}px)`,
        filter: `blur(${blur}px)`,
        opacity,
        mixBlendMode: 'screen',
      }}
    >
      <defs>
        {/* Animated gradient */}
        <linearGradient id={`gradient-${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={colors[0]}>
            <animate
              attributeName="stop-color"
              values={`${colors.join(';')};${colors[0]}`}
              dur={`${gradientDuration}s`}
              repeatCount="indefinite"
              begin={`${delay}s`}
            />
          </stop>
          <stop offset="50%" stopColor={colors[1] || colors[0]}>
            <animate
              attributeName="stop-color"
              values={`${colors.slice(1).join(';')};${colors[0]};${colors[1] || colors[0]}`}
              dur={`${gradientDuration}s`}
              repeatCount="indefinite"
              begin={`${delay}s`}
            />
          </stop>
          <stop offset="100%" stopColor={colors[2] || colors[1] || colors[0]}>
            <animate
              attributeName="stop-color"
              values={`${[...colors].reverse().join(';')};${colors[colors.length - 1]}`}
              dur={`${gradientDuration}s`}
              repeatCount="indefinite"
              begin={`${delay}s`}
            />
          </stop>
          {/* Animate gradient position */}
          <animateTransform
            attributeName="gradientTransform"
            type="rotate"
            values="0 50 50;360 50 50"
            dur={`${duration * 1.5}s`}
            repeatCount="indefinite"
            begin={`${delay}s`}
          />
        </linearGradient>

        {/* Glow filter */}
        <filter id={`glow-${uniqueId}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={glow * 10} result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Morphing blob shape */}
      <path
        fill={`url(#gradient-${uniqueId})`}
        filter={glow > 0 ? `url(#glow-${uniqueId})` : undefined}
      >
        <animate
          attributeName="d"
          values={paths.join(';')}
          dur={`${duration}s`}
          repeatCount="indefinite"
          keyTimes={keyTimes}
          calcMode="spline"
          keySplines="0.4 0 0.2 1;0.4 0 0.2 1;0.4 0 0.2 1;0.4 0 0.2 1"
          begin={`${delay}s`}
        />
      </path>
    </svg>
  );
};

// Main component with multiple overlapping blobs
const MorphingBlob: React.FC<MorphingBlobProps> = ({
  colors = ['#3b82f6', '#8b5cf6', '#ec4899'],
  size = 300,
  speed = 1,
  blur = 40,
  glow = 0.5,
  className = '',
  opacity = 0.6,
}) => {
  const baseId = useId();

  // Configuration for multiple overlapping blobs
  const blobConfigs = useMemo(() => [
    { scale: 1, offsetX: 0, offsetY: 0, delay: 0, opacity: opacity },
    { scale: 0.8, offsetX: -30, offsetY: 20, delay: 2, opacity: opacity * 0.8 },
    { scale: 0.7, offsetX: 40, offsetY: -25, delay: 4, opacity: opacity * 0.7 },
    { scale: 0.6, offsetX: -20, offsetY: -40, delay: 6, opacity: opacity * 0.6 },
  ], [opacity]);

  // Shift colors for each blob to create variety
  const getShiftedColors = (index: number): string[] => {
    const shift = index % colors.length;
    return [...colors.slice(shift), ...colors.slice(0, shift)];
  };

  return (
    <div
      className={`relative pointer-events-none ${className}`}
      style={{
        width: size * 1.5,
        height: size * 1.5,
        overflow: 'visible',
      }}
      aria-hidden="true"
    >
      {blobConfigs.map((config, index) => (
        <SingleBlob
          key={`${baseId}-blob-${index}`}
          uniqueId={`${baseId}-${index}`}
          colors={getShiftedColors(index)}
          size={size}
          speed={speed}
          blur={blur}
          glow={glow}
          opacity={config.opacity}
          delay={config.delay}
          scale={config.scale}
          offsetX={config.offsetX}
          offsetY={config.offsetY}
        />
      ))}
    </div>
  );
};

export default MorphingBlob;
