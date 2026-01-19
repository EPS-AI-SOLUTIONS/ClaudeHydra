/**
 * Skeletons.tsx - Modern Loading States and Skeleton Screens
 * 
 * Provides reusable skeleton components with shimmer and pulse effects
 * for elegant loading states throughout the HYDRA Dashboard.
 */

import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

// =============================================================================
// UTILITY COMPONENTS
// =============================================================================

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  animate?: boolean;
  children?: React.ReactNode;
}

/**
 * Base Skeleton component - foundation for all skeleton elements
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  width,
  height,
  rounded = 'md',
  animate = true,
  children,
}) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  const roundedClasses = {
    none: 'rounded-none',
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    full: 'rounded-full',
  };

  const style: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  };

  return (
    <div
      className={`
        ${isLight ? 'bg-gray-200' : 'bg-[var(--bw-surface)]'}
        ${roundedClasses[rounded]}
        ${animate ? 'animate-skeleton' : ''}
        ${className}
      `}
      style={style}
    >
      {children}
    </div>
  );
};

interface ShimmerProps {
  className?: string;
  children?: React.ReactNode;
}

/**
 * Shimmer - Reusable shimmer effect overlay
 */
export const Shimmer: React.FC<ShimmerProps> = ({ className = '', children }) => {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {children}
      <div
        className="absolute inset-0 animate-shimmer"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.1) 50%, transparent 100%)',
          backgroundSize: '200% 100%',
        }}
      />
    </div>
  );
};

interface PulseProps {
  className?: string;
  intensity?: 'low' | 'medium' | 'high';
  children?: React.ReactNode;
}

/**
 * Pulse - Pulsating placeholder with configurable intensity
 */
export const Pulse: React.FC<PulseProps> = ({
  className = '',
  intensity = 'medium',
  children,
}) => {
  const intensityClasses = {
    low: 'animate-pulse opacity-40',
    medium: 'animate-pulse opacity-60',
    high: 'animate-pulse opacity-80',
  };

  return (
    <div className={`${intensityClasses[intensity]} ${className}`}>
      {children}
    </div>
  );
};

// =============================================================================
// MESSAGE SKELETON
// =============================================================================

interface MessageSkeletonProps {
  size?: 'short' | 'medium' | 'long';
  isUser?: boolean;
  showAvatar?: boolean;
}

/**
 * MessageSkeleton - Animated skeleton for chat messages
 */
export const MessageSkeleton: React.FC<MessageSkeletonProps> = ({
  size = 'medium',
  isUser = false,
  showAvatar = true,
}) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  const lineWidths = {
    short: ['60%'],
    medium: ['90%', '70%'],
    long: ['95%', '85%', '60%'],
  };

  const lines = lineWidths[size];

  return (
    <div
      className={`flex gap-3 p-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar placeholder */}
      {showAvatar && (
        <Shimmer>
          <Skeleton
            width={32}
            height={32}
            rounded="full"
            className="flex-shrink-0"
          />
        </Shimmer>
      )}

      {/* Message content */}
      <div
        className={`flex flex-col gap-2 flex-1 ${isUser ? 'items-end' : 'items-start'}`}
      >
        {/* Header line */}
        <Skeleton
          width={80}
          height={12}
          rounded="sm"
          className="opacity-60"
        />

        {/* Message bubble */}
        <div
          className={`
            p-3 rounded-lg space-y-2 max-w-[80%]
            ${isLight ? 'bg-gray-100' : 'bg-[var(--bw-card)]'}
            border
            ${isLight ? 'border-gray-200' : 'border-[var(--bw-border)]'}
          `}
        >
          {lines.map((width, i) => (
            <Shimmer key={i}>
              <Skeleton
                width={width}
                height={14}
                rounded="sm"
                className={i === lines.length - 1 ? 'opacity-70' : ''}
              />
            </Shimmer>
          ))}
        </div>

        {/* Timestamp */}
        <Skeleton
          width={50}
          height={10}
          rounded="sm"
          className="opacity-40"
        />
      </div>
    </div>
  );
};

// =============================================================================
// PROVIDER CARD SKELETON
// =============================================================================

interface ProviderCardSkeletonProps {
  showActions?: boolean;
}

/**
 * ProviderCardSkeleton - Skeleton for CLI provider cards
 */
export const ProviderCardSkeleton: React.FC<ProviderCardSkeletonProps> = ({
  showActions = true,
}) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  return (
    <div
      className={`
        p-4 rounded-lg border
        ${isLight ? 'bg-white border-gray-200' : 'bg-[var(--bw-card)] border-[var(--bw-border)]'}
      `}
    >
      <div className="flex items-center gap-3">
        {/* Icon placeholder */}
        <Shimmer>
          <Skeleton
            width={40}
            height={40}
            rounded="lg"
            className="flex-shrink-0"
          />
        </Shimmer>

        {/* Content */}
        <div className="flex-1 space-y-2">
          {/* Provider name */}
          <Skeleton width={100} height={16} rounded="sm" />

          {/* Status line */}
          <div className="flex items-center gap-2">
            <Skeleton width={8} height={8} rounded="full" />
            <Skeleton width={60} height={12} rounded="sm" className="opacity-60" />
          </div>

          {/* Model info */}
          <Skeleton width="70%" height={12} rounded="sm" className="opacity-50" />
        </div>

        {/* Actions */}
        {showActions && (
          <div className="flex flex-col gap-2">
            <Skeleton width={24} height={24} rounded="md" className="opacity-50" />
            <Skeleton width={24} height={24} rounded="md" className="opacity-50" />
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div className="mt-4 pt-3 border-t border-[var(--bw-border)] flex justify-between">
        <Skeleton width={60} height={10} rounded="sm" className="opacity-40" />
        <Skeleton width={40} height={10} rounded="sm" className="opacity-40" />
      </div>
    </div>
  );
};

// =============================================================================
// STREAM ITEM SKELETON
// =============================================================================

interface StreamItemSkeletonProps {
  showProgress?: boolean;
}

/**
 * StreamItemSkeleton - Skeleton for stream/output items
 */
export const StreamItemSkeleton: React.FC<StreamItemSkeletonProps> = ({
  showProgress = true,
}) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  return (
    <div
      className={`
        p-3 rounded-lg border
        ${isLight ? 'bg-gray-50 border-gray-200' : 'bg-[var(--bw-surface)] border-[var(--bw-border)]'}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Pulse intensity="medium">
            <Skeleton width={16} height={16} rounded="sm" />
          </Pulse>
          <Skeleton width={120} height={14} rounded="sm" />
        </div>
        <Skeleton width={60} height={12} rounded="sm" className="opacity-50" />
      </div>

      {/* Content lines */}
      <div className="space-y-2 mb-3">
        <Shimmer>
          <Skeleton width="100%" height={12} rounded="sm" />
        </Shimmer>
        <Shimmer>
          <Skeleton width="85%" height={12} rounded="sm" className="opacity-80" />
        </Shimmer>
      </div>

      {/* Progress bar placeholder */}
      {showProgress && (
        <div className="mt-3 pt-2 border-t border-[var(--bw-border)]">
          <div className="flex items-center justify-between mb-1">
            <Skeleton width={80} height={10} rounded="sm" className="opacity-40" />
            <Skeleton width={30} height={10} rounded="sm" className="opacity-40" />
          </div>
          <div
            className={`
              h-2 rounded-full overflow-hidden
              ${isLight ? 'bg-gray-200' : 'bg-[var(--bw-border)]'}
            `}
          >
            <Shimmer className="h-full w-1/3">
              <div
                className={`
                  h-full rounded-full
                  ${isLight ? 'bg-gray-300' : 'bg-[var(--bw-border-light)]'}
                `}
              />
            </Shimmer>
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// SETTINGS SKELETON
// =============================================================================

interface SettingsSkeletonProps {
  sections?: number;
  itemsPerSection?: number;
}

/**
 * SettingsSkeleton - Skeleton for settings panel sections
 */
export const SettingsSkeleton: React.FC<SettingsSkeletonProps> = ({
  sections = 3,
  itemsPerSection = 3,
}) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  return (
    <div className="space-y-6">
      {Array.from({ length: sections }).map((_, sectionIdx) => (
        <div key={sectionIdx} className="space-y-4">
          {/* Section header */}
          <div className="flex items-center gap-2">
            <Skeleton width={20} height={20} rounded="sm" className="opacity-60" />
            <Skeleton width={120} height={16} rounded="sm" />
          </div>

          {/* Settings items */}
          <div
            className={`
              rounded-lg border divide-y
              ${isLight ? 'bg-white border-gray-200 divide-gray-100' : 'bg-[var(--bw-card)] border-[var(--bw-border)] divide-[var(--bw-border)]'}
            `}
          >
            {Array.from({ length: itemsPerSection }).map((_, itemIdx) => (
              <div key={itemIdx} className="p-4 flex items-center justify-between">
                <div className="space-y-1.5">
                  <Skeleton width={140} height={14} rounded="sm" />
                  <Skeleton width={200} height={11} rounded="sm" className="opacity-50" />
                </div>
                {/* Toggle placeholder */}
                <Skeleton width={44} height={22} rounded="full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// =============================================================================
// DASHBOARD SKELETON
// =============================================================================

interface DashboardSkeletonProps {
  showSidebar?: boolean;
  sidebarWidth?: number;
}

/**
 * DashboardSkeleton - Full dashboard skeleton with sidebar and content
 */
export const DashboardSkeleton: React.FC<DashboardSkeletonProps> = ({
  showSidebar = true,
  sidebarWidth = 280,
}) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  return (
    <div className="flex h-full w-full">
      {/* Sidebar */}
      {showSidebar && (
        <div
          className={`
            flex-shrink-0 h-full border-r p-4 space-y-6
            ${isLight ? 'bg-gray-50 border-gray-200' : 'bg-[var(--bw-surface)] border-[var(--bw-border)]'}
          `}
          style={{ width: sidebarWidth }}
        >
          {/* Logo placeholder */}
          <div className="flex items-center gap-3 mb-6">
            <Shimmer>
              <Skeleton width={40} height={40} rounded="lg" />
            </Shimmer>
            <div className="space-y-1.5">
              <Skeleton width={100} height={16} rounded="sm" />
              <Skeleton width={60} height={10} rounded="sm" className="opacity-50" />
            </div>
          </div>

          {/* Navigation items */}
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Shimmer key={i}>
                <div className="flex items-center gap-3 p-2 rounded-lg">
                  <Skeleton width={20} height={20} rounded="sm" />
                  <Skeleton width={100 + Math.random() * 40} height={14} rounded="sm" />
                </div>
              </Shimmer>
            ))}
          </div>

          {/* Divider */}
          <div
            className={`h-px ${isLight ? 'bg-gray-200' : 'bg-[var(--bw-border)]'}`}
          />

          {/* Provider list skeleton */}
          <div className="space-y-3">
            <Skeleton width={80} height={12} rounded="sm" className="opacity-60" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 p-2">
                <Skeleton width={8} height={8} rounded="full" />
                <Skeleton width={80 + Math.random() * 30} height={12} rounded="sm" />
              </div>
            ))}
          </div>

          {/* Bottom section */}
          <div className="mt-auto pt-4 space-y-2">
            <Skeleton width="100%" height={36} rounded="md" />
            <Skeleton width="100%" height={36} rounded="md" className="opacity-60" />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 h-full flex flex-col">
        {/* Header */}
        <div
          className={`
            h-14 border-b flex items-center justify-between px-4
            ${isLight ? 'bg-white border-gray-200' : 'bg-[var(--bw-card)] border-[var(--bw-border)]'}
          `}
        >
          <div className="flex items-center gap-3">
            <Skeleton width={24} height={24} rounded="sm" />
            <Skeleton width={150} height={18} rounded="sm" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton width={32} height={32} rounded="md" />
            <Skeleton width={32} height={32} rounded="md" />
            <Skeleton width={32} height={32} rounded="full" />
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 p-6 overflow-auto">
          {/* Stats cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className={`
                  p-4 rounded-lg border
                  ${isLight ? 'bg-white border-gray-200' : 'bg-[var(--bw-card)] border-[var(--bw-border)]'}
                `}
              >
                <Skeleton width={60} height={12} rounded="sm" className="opacity-50 mb-2" />
                <Shimmer>
                  <Skeleton width={80} height={24} rounded="sm" />
                </Shimmer>
              </div>
            ))}
          </div>

          {/* Main content grid */}
          <div className="grid grid-cols-2 gap-6">
            {/* Left column */}
            <div className="space-y-4">
              <Skeleton width={120} height={16} rounded="sm" className="mb-3" />
              {Array.from({ length: 3 }).map((_, i) => (
                <StreamItemSkeleton key={i} showProgress={i === 0} />
              ))}
            </div>

            {/* Right column */}
            <div className="space-y-4">
              <Skeleton width={100} height={16} rounded="sm" className="mb-3" />
              {Array.from({ length: 4 }).map((_, i) => (
                <MessageSkeleton
                  key={i}
                  size={i % 2 === 0 ? 'medium' : 'short'}
                  isUser={i % 2 === 1}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Status bar */}
        <div
          className={`
            h-8 border-t flex items-center justify-between px-4
            ${isLight ? 'bg-gray-50 border-gray-200' : 'bg-[var(--bw-surface)] border-[var(--bw-border)]'}
          `}
        >
          <div className="flex items-center gap-4">
            <Skeleton width={80} height={10} rounded="sm" className="opacity-50" />
            <Skeleton width={60} height={10} rounded="sm" className="opacity-50" />
          </div>
          <Skeleton width={100} height={10} rounded="sm" className="opacity-50" />
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// ADDITIONAL UTILITY SKELETONS
// =============================================================================

interface TextSkeletonProps {
  lines?: number;
  lastLineWidth?: string;
  className?: string;
}

/**
 * TextSkeleton - Multi-line text placeholder
 */
export const TextSkeleton: React.FC<TextSkeletonProps> = ({
  lines = 3,
  lastLineWidth = '60%',
  className = '',
}) => {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Shimmer key={i}>
          <Skeleton
            width={i === lines - 1 ? lastLineWidth : '100%'}
            height={14}
            rounded="sm"
          />
        </Shimmer>
      ))}
    </div>
  );
};

interface AvatarSkeletonProps {
  size?: 'sm' | 'md' | 'lg';
}

/**
 * AvatarSkeleton - Circular avatar placeholder
 */
export const AvatarSkeleton: React.FC<AvatarSkeletonProps> = ({
  size = 'md',
}) => {
  const sizes = {
    sm: 24,
    md: 40,
    lg: 56,
  };

  return (
    <Shimmer>
      <Skeleton
        width={sizes[size]}
        height={sizes[size]}
        rounded="full"
      />
    </Shimmer>
  );
};

interface ButtonSkeletonProps {
  width?: number | string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * ButtonSkeleton - Button placeholder
 */
export const ButtonSkeleton: React.FC<ButtonSkeletonProps> = ({
  width = 100,
  size = 'md',
}) => {
  const heights = {
    sm: 28,
    md: 36,
    lg: 44,
  };

  return (
    <Shimmer>
      <Skeleton
        width={width}
        height={heights[size]}
        rounded="md"
      />
    </Shimmer>
  );
};

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

/**
 * TableSkeleton - Table placeholder with header and rows
 */
export const TableSkeleton: React.FC<TableSkeletonProps> = ({
  rows = 5,
  columns = 4,
}) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  return (
    <div
      className={`
        rounded-lg border overflow-hidden
        ${isLight ? 'bg-white border-gray-200' : 'bg-[var(--bw-card)] border-[var(--bw-border)]'}
      `}
    >
      {/* Header */}
      <div
        className={`
          flex items-center gap-4 p-3 border-b
          ${isLight ? 'bg-gray-50 border-gray-200' : 'bg-[var(--bw-surface)] border-[var(--bw-border)]'}
        `}
      >
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="flex-1">
            <Skeleton width="70%" height={12} rounded="sm" />
          </div>
        ))}
      </div>

      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div
          key={rowIdx}
          className={`
            flex items-center gap-4 p-3 border-b last:border-0
            ${isLight ? 'border-gray-100' : 'border-[var(--bw-border)]'}
          `}
        >
          {Array.from({ length: columns }).map((_, colIdx) => (
            <div key={colIdx} className="flex-1">
              <Shimmer>
                <Skeleton
                  width={`${50 + Math.random() * 40}%`}
                  height={14}
                  rounded="sm"
                />
              </Shimmer>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

// =============================================================================
// COMPOSITE SKELETONS
// =============================================================================

/**
 * ChatInterfaceSkeleton - Full chat interface loading state
 */
export const ChatInterfaceSkeleton: React.FC = () => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 p-4 space-y-4 overflow-hidden">
        <MessageSkeleton size="short" isUser={false} />
        <MessageSkeleton size="long" isUser={true} />
        <MessageSkeleton size="medium" isUser={false} />
        <MessageSkeleton size="short" isUser={true} />
      </div>

      {/* Input area */}
      <div
        className={`
          p-4 border-t
          ${isLight ? 'bg-white border-gray-200' : 'bg-[var(--bw-card)] border-[var(--bw-border)]'}
        `}
      >
        <div
          className={`
            flex items-center gap-3 p-3 rounded-lg border
            ${isLight ? 'bg-gray-50 border-gray-200' : 'bg-[var(--bw-surface)] border-[var(--bw-border)]'}
          `}
        >
          <Skeleton width={32} height={32} rounded="md" className="flex-shrink-0" />
          <Skeleton width="100%" height={20} rounded="sm" className="flex-1" />
          <Skeleton width={32} height={32} rounded="md" className="flex-shrink-0" />
        </div>
      </div>
    </div>
  );
};

/**
 * ProviderListSkeleton - List of provider cards
 */
export const ProviderListSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <ProviderCardSkeleton key={i} showActions={i < 2} />
      ))}
    </div>
  );
};

// =============================================================================
// DEFAULT EXPORT
// =============================================================================

export default {
  // Base utilities
  Skeleton,
  Shimmer,
  Pulse,
  // Main skeletons
  MessageSkeleton,
  ProviderCardSkeleton,
  StreamItemSkeleton,
  SettingsSkeleton,
  DashboardSkeleton,
  // Additional utilities
  TextSkeleton,
  AvatarSkeleton,
  ButtonSkeleton,
  TableSkeleton,
  // Composite skeletons
  ChatInterfaceSkeleton,
  ProviderListSkeleton,
};
