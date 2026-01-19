import React, { useState, useRef, useCallback, useEffect } from 'react';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface DockItem {
  /** Unique identifier for the item */
  id: string;
  /** Icon element (ReactNode - can be emoji, Lucide icon, or custom SVG) */
  icon: React.ReactNode;
  /** Label shown in tooltip on hover */
  label: string;
  /** Click handler */
  onClick?: () => void;
  /** Optional badge (number or string) */
  badge?: number | string;
  /** Whether the item is active/selected */
  isActive?: boolean;
  /** Whether the item is disabled */
  disabled?: boolean;
}

export interface FloatingDockProps {
  /** Array of dock items to display */
  items: DockItem[];
  /** Position of the dock */
  position?: 'bottom' | 'left' | 'right';
  /** Magnification factor (1.0 = no magnification, 2.0 = 2x size) */
  magnification?: number;
  /** Base icon size in pixels */
  baseIconSize?: number;
  /** Distance from edge in pixels */
  distance?: number;
  /** Whether to show the dock */
  visible?: boolean;
  /** Additional class names */
  className?: string;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate scale factor based on distance from cursor
 * Uses gaussian-like falloff for smooth magnification
 */
function calculateScale(
  itemIndex: number,
  mousePosition: number,
  itemPositions: number[],
  magnification: number,
  baseSize: number
): number {
  if (mousePosition < 0) return 1;

  const itemCenter = itemPositions[itemIndex];
  const distance = Math.abs(mousePosition - itemCenter);
  const maxDistance = baseSize * 3; // Affect up to 3 items away

  if (distance > maxDistance) return 1;

  // Gaussian falloff
  const normalizedDistance = distance / maxDistance;
  const scaleFactor = Math.exp(-Math.pow(normalizedDistance * 2.5, 2));

  return 1 + (magnification - 1) * scaleFactor;
}

// ============================================================================
// TOOLTIP COMPONENT
// ============================================================================

interface TooltipProps {
  label: string;
  visible: boolean;
  position: 'bottom' | 'left' | 'right';
}

const Tooltip: React.FC<TooltipProps> = ({ label, visible, position }) => {
  const positionClasses = {
    bottom: 'bottom-full mb-3 left-1/2 -translate-x-1/2',
    left: 'left-full ml-3 top-1/2 -translate-y-1/2',
    right: 'right-full mr-3 top-1/2 -translate-y-1/2',
  };

  const arrowClasses = {
    bottom: 'top-full left-1/2 -translate-x-1/2 border-t-[var(--bw-card)] border-x-transparent border-b-transparent',
    left: 'right-full top-1/2 -translate-y-1/2 border-l-[var(--bw-card)] border-y-transparent border-r-transparent',
    right: 'left-full top-1/2 -translate-y-1/2 border-r-[var(--bw-card)] border-y-transparent border-l-transparent',
  };

  return (
    <div
      className={`
        absolute z-50 pointer-events-none
        transition-all duration-200 ease-out
        ${positionClasses[position]}
        ${visible
          ? 'opacity-100 transform translate-y-0'
          : 'opacity-0 transform translate-y-1'
        }
      `}
    >
      <div
        className="
          relative px-3 py-1.5 rounded-lg
          bg-[var(--bw-card)] border border-[var(--bw-border)]
          text-[var(--bw-text)] text-xs font-medium whitespace-nowrap
          shadow-lg backdrop-blur-md
        "
        style={{
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3), 0 0 1px rgba(255, 255, 255, 0.1)',
        }}
      >
        {label}
        {/* Arrow */}
        <div
          className={`
            absolute w-0 h-0 border-[6px]
            ${arrowClasses[position]}
          `}
        />
      </div>
    </div>
  );
};

// ============================================================================
// DOCK ITEM COMPONENT
// ============================================================================

interface DockItemComponentProps {
  item: DockItem;
  scale: number;
  baseSize: number;
  position: 'bottom' | 'left' | 'right';
  isHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
}

const DockItemComponent: React.FC<DockItemComponentProps> = ({
  item,
  scale,
  baseSize,
  position,
  isHovered,
  onHover,
  onLeave,
}) => {
  const scaledSize = baseSize * scale;
  const translateOffset = (scaledSize - baseSize) / 2;

  // Calculate transform based on position
  const getTransform = () => {
    switch (position) {
      case 'bottom':
        return `translateY(-${translateOffset}px) scale(${scale})`;
      case 'left':
        return `translateX(${translateOffset}px) scale(${scale})`;
      case 'right':
        return `translateX(-${translateOffset}px) scale(${scale})`;
    }
  };

  return (
    <div
      className="relative flex items-center justify-center"
      style={{
        width: baseSize,
        height: baseSize,
      }}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      {/* Tooltip */}
      <Tooltip
        label={item.label}
        visible={isHovered}
        position={position}
      />

      {/* Icon button */}
      <button
        onClick={item.onClick}
        disabled={item.disabled}
        className={`
          relative flex items-center justify-center
          rounded-xl
          transition-all duration-150 ease-out
          ${item.disabled
            ? 'opacity-40 cursor-not-allowed'
            : 'cursor-pointer hover:bg-[var(--bw-border-light)]'
          }
          ${item.isActive
            ? 'bg-[var(--bw-border-light)] ring-2 ring-[var(--bw-accent)]/20'
            : 'bg-transparent'
          }
        `}
        style={{
          width: baseSize,
          height: baseSize,
          transform: getTransform(),
          transformOrigin: position === 'bottom' ? 'bottom center' : position === 'left' ? 'center left' : 'center right',
          transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // Spring-like effect
        }}
      >
        {/* Icon wrapper with magnetic effect */}
        <div
          className="flex items-center justify-center text-[var(--bw-text)] transition-transform duration-150"
          style={{
            fontSize: baseSize * 0.5,
          }}
        >
          {item.icon}
        </div>

        {/* Glow effect on hover */}
        {isHovered && !item.disabled && (
          <div
            className="absolute inset-0 rounded-xl pointer-events-none"
            style={{
              boxShadow: '0 0 20px rgba(255, 255, 255, 0.15), 0 0 40px rgba(255, 255, 255, 0.05)',
              animation: 'dock-glow 1.5s ease-in-out infinite',
            }}
          />
        )}

        {/* Active indicator */}
        {item.isActive && (
          <div
            className={`
              absolute bg-[var(--bw-accent)]
              ${position === 'bottom' ? 'bottom-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full' : ''}
              ${position === 'left' ? 'left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full' : ''}
              ${position === 'right' ? 'right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full' : ''}
            `}
            style={{
              boxShadow: '0 0 8px var(--bw-accent)',
            }}
          />
        )}
      </button>

      {/* Badge */}
      {item.badge !== undefined && item.badge !== 0 && (
        <div
          className={`
            absolute flex items-center justify-center
            min-w-[18px] h-[18px] px-1
            bg-red-500 text-white text-[10px] font-bold
            rounded-full pointer-events-none
            transition-all duration-200 ease-out
            ${position === 'bottom' ? '-top-1 -right-1' : ''}
            ${position === 'left' ? '-top-1 -right-1' : ''}
            ${position === 'right' ? '-top-1 -left-1' : ''}
          `}
          style={{
            transform: isHovered ? 'scale(1.2)' : 'scale(1)',
            boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)',
          }}
        >
          {typeof item.badge === 'number' && item.badge > 99 ? '99+' : item.badge}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// MAIN FLOATING DOCK COMPONENT
// ============================================================================

const FloatingDock: React.FC<FloatingDockProps> = ({
  items,
  position = 'bottom',
  magnification = 1.5,
  baseIconSize = 48,
  distance = 16,
  visible = true,
  className = '',
}) => {
  const dockRef = useRef<HTMLDivElement>(null);
  const [mousePosition, setMousePosition] = useState(-1);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [itemPositions, setItemPositions] = useState<number[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [isMouseInDock, setIsMouseInDock] = useState(false);

  // Calculate item positions when items change
  useEffect(() => {
    const positions: number[] = [];
    const gap = 8;
    let currentPosition = 0;

    items.forEach((_item) => {
      void _item;
      positions.push(currentPosition + baseIconSize / 2);
      currentPosition += baseIconSize + gap;
    });

    setItemPositions(positions);
  }, [items, baseIconSize]);

  // Animate entrance
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => setIsVisible(true), 50);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [visible]);

  // Handle mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dockRef.current) return;

    const rect = dockRef.current.getBoundingClientRect();

    if (position === 'bottom') {
      const x = e.clientX - rect.left;
      setMousePosition(x);
    } else {
      const y = e.clientY - rect.top;
      setMousePosition(y);
    }
  }, [position]);

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    setMousePosition(-1);
    setHoveredIndex(null);
    setIsMouseInDock(false);
  }, []);

  // Handle mouse enter
  const handleMouseEnter = useCallback(() => {
    setIsMouseInDock(true);
  }, []);

  // Position classes
  const getPositionClasses = () => {
    switch (position) {
      case 'bottom':
        return `bottom-0 left-1/2 -translate-x-1/2 flex-row`;
      case 'left':
        return `left-0 top-1/2 -translate-y-1/2 flex-col`;
      case 'right':
        return `right-0 top-1/2 -translate-y-1/2 flex-col`;
    }
  };

  // Get entry animation
  const getEntryTransform = () => {
    if (!visible || !isVisible) {
      switch (position) {
        case 'bottom':
          return 'translateY(100%) translateX(-50%)';
        case 'left':
          return 'translateX(-100%) translateY(-50%)';
        case 'right':
          return 'translateX(100%) translateY(-50%)';
      }
    }
    switch (position) {
      case 'bottom':
        return 'translateY(0) translateX(-50%)';
      case 'left':
        return 'translateX(0) translateY(-50%)';
      case 'right':
        return 'translateX(0) translateY(-50%)';
    }
  };

  if (!visible && !isVisible) return null;

  return (
    <div
      ref={dockRef}
      className={`
        fixed z-50 flex items-center gap-2
        ${getPositionClasses()}
        ${className}
      `}
      style={{
        padding: distance,
        transform: getEntryTransform(),
        transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease',
        opacity: isVisible ? 1 : 0,
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={handleMouseEnter}
    >
      {/* Dock container with glassmorphism */}
      <div
        className={`
          relative flex items-center gap-2 px-3 py-2
          bg-[var(--bw-surface)]/80
          backdrop-blur-xl
          border border-[var(--bw-border)]
          rounded-2xl
          transition-all duration-300 ease-out
          ${position === 'bottom' ? 'flex-row' : 'flex-col'}
        `}
        style={{
          boxShadow: `
            0 8px 32px rgba(0, 0, 0, 0.4),
            0 0 0 1px rgba(255, 255, 255, 0.05) inset,
            ${isMouseInDock ? '0 0 40px rgba(255, 255, 255, 0.05)' : '0 0 0 transparent'}
          `,
          transform: isMouseInDock ? 'scale(1.02)' : 'scale(1)',
          transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {/* Top highlight line */}
        <div
          className={`
            absolute bg-gradient-to-r from-transparent via-white/10 to-transparent
            ${position === 'bottom' ? 'top-0 left-4 right-4 h-px' : 'top-4 bottom-4 left-0 w-px'}
          `}
        />

        {/* Dock items */}
        {items.map((item, index) => {
          const scale = calculateScale(
            index,
            mousePosition,
            itemPositions,
            magnification,
            baseIconSize
          );

          return (
            <DockItemComponent
              key={item.id}
              item={item}
              scale={isMouseInDock ? scale : 1}
              baseSize={baseIconSize}
              position={position}
              isHovered={hoveredIndex === index}
              onHover={() => setHoveredIndex(index)}
              onLeave={() => setHoveredIndex(null)}
            />
          );
        })}
      </div>

      {/* CSS Keyframes injection */}
      <style>{`
        @keyframes dock-glow {
          0%, 100% {
            box-shadow: 0 0 20px rgba(255, 255, 255, 0.15), 0 0 40px rgba(255, 255, 255, 0.05);
          }
          50% {
            box-shadow: 0 0 30px rgba(255, 255, 255, 0.2), 0 0 60px rgba(255, 255, 255, 0.08);
          }
        }

        @keyframes dock-bounce {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-8px);
          }
        }
      `}</style>
    </div>
  );
};

// ============================================================================
// EXPORTS
// ============================================================================

export default FloatingDock;
export { FloatingDock };
export type { DockItem as FloatingDockItem };
