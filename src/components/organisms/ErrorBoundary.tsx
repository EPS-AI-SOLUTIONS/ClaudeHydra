/** Jaskier Design System */
// src/components/organisms/ErrorBoundary.tsx
/**
 * Error Boundary — Unified across all Jaskier projects
 * =====================================================
 * React class-based error boundary with:
 *  - Dynamic import error detection + auto-reload (critical for lazy-loaded chunks)
 *  - Optional `fallback` prop for custom error UI
 *  - Default error card with AlertTriangle icon, error details, and retry button
 *  - Card atom + lucide-react icons for consistent styling
 */

import i18n from '@jaskier/i18n';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Card } from '@/components/atoms';

// ============================================================================
// TYPES
// ============================================================================

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  /** Called before resetting error state — used by QueryErrorResetBoundary to clear query cache errors */
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// ============================================================================
// HELPERS
// ============================================================================

/** Detect errors caused by stale chunk references after a new deployment. */
function isDynamicImportError(error: Error | null): boolean {
  if (!error) return false;
  const msg = error.message;
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('Loading chunk')
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo.componentStack);

    // Stale chunk after deploy — reload the page automatically
    if (isDynamicImportError(error)) {
      window.location.reload();
    }
  }

  handleRetry = (): void => {
    if (isDynamicImportError(this.state.error)) {
      window.location.reload();
      return;
    }
    this.props.onReset?.();
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--matrix-bg-primary)] p-6">
          <Card variant="elevated" padding="lg" className="max-w-md w-full">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-red-500/10 border border-red-500/20">
                <AlertTriangle size={28} className="text-red-400" />
              </div>

              <div>
                <h2 className="text-lg font-bold font-mono text-[var(--matrix-text-primary)]">
                  {i18n.t('common.somethingWentWrong')}
                </h2>
                <p className="text-sm text-[var(--matrix-text-dim)] mt-1">{i18n.t('common.unexpectedError')}</p>
              </div>

              {this.state.error && (
                <pre className="w-full text-xs text-red-400/80 bg-red-500/5 border border-red-500/10 rounded-lg p-3 overflow-auto max-h-32 text-left font-mono">
                  {this.state.error.message}
                </pre>
              )}

              <Button variant="primary" size="md" leftIcon={<RotateCcw size={16} />} onClick={this.handleRetry}>
                {i18n.t('common.tryAgain')}
              </Button>
            </div>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
