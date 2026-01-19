/**
 * Component barrel exports
 *
 * Usage:
 *   import { Dashboard, MCPStatus, ChatHistory } from '@/components';
 *   import { MCPStatus, OllamaStatus } from '@/components/status';
 */

// Layout components
export * from './layout';

// Chat components
export * from './chat';

// Status components
export * from './status';

// Settings components
export * from './settings';

// Core components
export * from './core';

// Effects components
export * from './effects';

// UI components
export * from './ui';

// Direct exports for backwards compatibility
export { default as Dashboard } from './Dashboard';
export { default as Launcher } from './Launcher';
export { default as MultiTabChat } from './MultiTabChat';
export { default as ChatHistory } from './ChatHistory';
export { default as MCPStatus } from './MCPStatus';
export { default as OllamaStatus } from './OllamaStatus';
export { default as SettingsPanel } from './SettingsPanel';
export { default as StatusLine } from './StatusLine';
export { default as TabBar } from './TabBar';
export { default as YoloToggle } from './YoloToggle';
export { default as QueueStatus } from './QueueStatus';
export { default as BuildFreshness } from './BuildFreshness';
export { default as MultiInputDashboard } from './MultiInputDashboard';
export { default as StreamPanel } from './StreamPanel';
export type { StreamSource, StreamStatus, PanelStatus, StreamPanelProps } from './StreamPanel';

// Skeleton components
export {
  Skeleton,
  Shimmer,
  Pulse,
  MessageSkeleton,
  ProviderCardSkeleton,
  StreamItemSkeleton,
  SettingsSkeleton,
  DashboardSkeleton,
  TextSkeleton,
  AvatarSkeleton,
  ButtonSkeleton,
  TableSkeleton,
  ChatInterfaceSkeleton,
  ProviderListSkeleton,
} from './Skeletons';
