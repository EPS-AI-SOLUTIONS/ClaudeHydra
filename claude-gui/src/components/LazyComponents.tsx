/**
 * Lazy-loaded components for code splitting and performance optimization
 * Uses React 19 patterns with proper Suspense integration
 *
 * Benefits:
 * - Reduces initial bundle size
 * - Code splitting at component level
 * - Better performance for users with slower connections
 * - Components only loaded when needed
 */

import { lazy, Suspense, ReactNode } from 'react';
import { SuspenseFallback } from './SuspenseFallback';

/**
 * Lazy-loaded SettingsView component
 * Heavy component due to extensive form fields and API key management
 */
const SettingsViewLazy = lazy(() =>
  import('./SettingsView').then((m) => ({
    default: m.SettingsView,
  }))
);

/**
 * Lazy-loaded Sidebar component (less critical, can load asynchronously)
 * Contains navigation and session management
 */
const SidebarLazy = lazy(() =>
  import('./Sidebar').then((m) => ({
    default: m.Sidebar,
  }))
);

/**
 * Lazy-loaded OllamaChatView component
 * Heavy due to markdown rendering and syntax highlighting
 */
const OllamaChatViewLazy = lazy(() =>
  import('./OllamaChatView').then((m) => ({
    default: m.OllamaChatView,
  }))
);

/**
 * Lazy-loaded ChatHistoryView component
 * Shows historical chat sessions
 */
const ChatHistoryViewLazy = lazy(() =>
  import('./ChatHistoryView').then((m) => ({
    default: m.ChatHistoryView,
  }))
);

/**
 * Lazy-loaded HistoryView component
 * Shows approval history
 */
const HistoryViewLazy = lazy(() =>
  import('./HistoryView').then((m) => ({
    default: m.HistoryView,
  }))
);

/**
 * Lazy-loaded RulesView component
 * Rules editor for auto-approval
 */
const RulesViewLazy = lazy(() =>
  import('./RulesView').then((m) => ({
    default: m.RulesView,
  }))
);

/**
 * Lazy-loaded LearningPanel component
 * AI learning dashboard
 */
const LearningPanelLazy = lazy(() =>
  import('./LearningPanel').then((m) => ({
    default: m.LearningPanel,
  }))
);

/**
 * Lazy-loaded DebugPanel component
 * Debug and monitoring interface
 */
const DebugPanelLazy = lazy(() =>
  import('./DebugPanel').then((m) => ({
    default: m.DebugPanel,
  }))
);

interface LazyComponentWrapperProps {
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Wrapper component for lazy-loaded components with Suspense fallback
 * Provides consistent loading experience across all lazy components
 */
function LazyComponentWrapper({
  children,
  fallback,
}: LazyComponentWrapperProps) {
  return (
    <Suspense fallback={fallback || <SuspenseFallback />}>
      {children}
    </Suspense>
  );
}

/**
 * Higher-order component to wrap lazy-loaded components with Suspense
 * Usage: <WithSuspense component={MyLazyComponent} />
 */
function WithSuspense({
  component: Component,
  fallback,
  ...props
}: any) {
  return (
    <LazyComponentWrapper fallback={fallback}>
      <Component {...props} />
    </LazyComponentWrapper>
  );
}

export {
  // Lazy components
  SettingsViewLazy,
  SidebarLazy,
  OllamaChatViewLazy,
  ChatHistoryViewLazy,
  HistoryViewLazy,
  RulesViewLazy,
  LearningPanelLazy,
  DebugPanelLazy,
  // Utilities
  LazyComponentWrapper,
  WithSuspense,
};
