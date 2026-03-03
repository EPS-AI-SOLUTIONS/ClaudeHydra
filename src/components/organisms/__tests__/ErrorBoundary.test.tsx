import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '@/components/organisms/ErrorBoundary';

// ---------------------------------------------------------------------------
// Helper: component that throws on render
// ---------------------------------------------------------------------------

function ThrowError({ message }: { message: string }): never {
  throw new Error(message);
}

// Suppress console.error noise from React's error boundary logging
const originalConsoleError = console.error;
beforeEach(() => {
  console.error = vi.fn();
});
afterEach(() => {
  console.error = originalConsoleError;
});

// ===========================================================================
// TESTS
// ===========================================================================

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <p>Hello World</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('renders default fallback UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowError message="Test explosion" />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(
      screen.getByText('An unexpected error occurred. You can try again or refresh the page.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Test explosion')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('renders custom fallback when the fallback prop is provided', () => {
    render(
      <ErrorBoundary fallback={<div>Custom Error View</div>}>
        <ThrowError message="boom" />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Custom Error View')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('resets error state and re-renders children when Try Again is clicked', () => {
    let shouldThrow = true;

    function MaybeThrow() {
      if (shouldThrow) {
        throw new Error('Conditional error');
      }
      return <p>Recovered successfully</p>;
    }

    render(
      <ErrorBoundary>
        <MaybeThrow />
      </ErrorBoundary>,
    );

    // Error state is shown
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Fix the error condition and click retry
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    // Children render normally after reset
    expect(screen.getByText('Recovered successfully')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('calls window.location.reload for dynamic import errors', () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    });

    render(
      <ErrorBoundary>
        <ThrowError message="Failed to fetch dynamically imported module /chunk-abc123.js" />
      </ErrorBoundary>,
    );

    // Verify reload was triggered for dynamic import error
    expect(reloadMock).toHaveBeenCalled();
  });
});
