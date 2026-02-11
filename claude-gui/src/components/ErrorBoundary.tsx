import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="h-full flex items-center justify-center p-8">
          <div className="glass-panel p-6 max-w-md text-center space-y-4">
            <h2 className="text-lg font-semibold text-red-400">Wystąpił błąd</h2>
            <p className="text-sm text-matrix-text-dim">
              {this.state.error?.message || 'Nieznany błąd aplikacji'}
            </p>
            <button
              type="button"
              onClick={this.handleReset}
              className="px-4 py-2 rounded bg-matrix-accent/20 text-matrix-accent hover:bg-matrix-accent/30 transition-colors text-sm"
            >
              Spróbuj ponownie
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
