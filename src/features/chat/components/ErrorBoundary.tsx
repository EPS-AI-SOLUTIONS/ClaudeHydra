import { cn } from '@jaskier/ui';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/atoms';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
  className?: string;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[ErrorBoundary] Caught error in ${this.props.name || 'Component'}:`, error, errorInfo);

    // Telemetry - Graceful degradation logger
    try {
      const payload = JSON.stringify({
        event: 'client_error',
        name: this.props.name || 'Component',
        error: error.message,
        stack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
      });
      // Wyślij bez blokowania wątku
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/telemetry/error', new Blob([payload], { type: 'application/json' }));
      }
    } catch (e) {
      // Ignore telemetry errors to avoid infinite loops
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          className={cn(
            'flex flex-col items-center justify-center p-6 space-y-4 bg-red-950/20 border border-red-500/30 rounded-xl',
            this.props.className,
          )}
        >
          <div className="p-3 bg-red-500/20 rounded-full">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <div className="text-center space-y-2 max-w-md">
            <h3 className="text-lg font-semibold text-red-400">
              Coś poszło nie tak {this.props.name ? `w ${this.props.name}` : ''}
            </h3>
            <p className="text-sm text-red-400/80 break-words font-mono bg-black/40 p-2 rounded">
              {this.state.error?.message || 'Nieznany błąd'}
            </p>
          </div>
          <Button variant="ghost" onClick={this.handleReset} className="mt-4 text-red-400 hover:text-red-300">
            <RefreshCcw className="w-4 h-4 mr-2" />
            Spróbuj ponownie
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
