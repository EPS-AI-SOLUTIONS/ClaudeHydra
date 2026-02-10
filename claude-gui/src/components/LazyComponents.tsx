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

import { lazy, type ReactNode, Suspense } from 'react';
import { SuspenseFallback } from './SuspenseFallback';

/**
 * Lazy-loaded SettingsView component
 * Heavy component due to extensive form fields and API key management
 */
const SettingsViewLazy = lazy(() =>
  import('./SettingsView').then((m) => ({
    default: m.SettingsView,
  })),
);

/**
 * Lazy-loaded Sidebar component (less critical, can load asynchronously)
 * Contains navigation and session management
 */
const SidebarLazy = lazy(() =>
  import('./Sidebar').then((m) => ({
    default: m.Sidebar,
  })),
);

/**
 * Lazy-loaded WelcomeView component
 * Home / welcome screen shown on startup
 */
const WelcomeViewLazy = lazy(() =>
  import('./WelcomeView').then((m) => ({
    default: m.WelcomeView,
  })),
);

interface LazyComponentWrapperProps {
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Wrapper component for lazy-loaded components with Suspense fallback
 * Provides consistent loading experience across all lazy components
 */
function LazyComponentWrapper({ children, fallback }: LazyComponentWrapperProps) {
  return <Suspense fallback={fallback || <SuspenseFallback />}>{children}</Suspense>;
}

/**
 * Higher-order component to wrap lazy-loaded components with Suspense
 * Usage: <WithSuspense component={MyLazyComponent} />
 */
interface WithSuspenseProps {
  component: React.ComponentType<Record<string, unknown>>;
  fallback?: ReactNode;
  [key: string]: unknown;
}

function WithSuspense({ component: Component, fallback, ...props }: WithSuspenseProps) {
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
  WelcomeViewLazy,
  // Utilities
  LazyComponentWrapper,
  WithSuspense,
};
