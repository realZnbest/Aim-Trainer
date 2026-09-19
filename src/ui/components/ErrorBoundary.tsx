import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Top-level error boundary with structured logging hook (Sentry optional). */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    // Structured log; wire to Sentry by setting window.__SENTRY_DSN__
    console.error(JSON.stringify({ scope: 'ui', error: error.message, stack: error.stack }));
    const dsn = (window as unknown as { __SENTRY_DSN__?: string }).__SENTRY_DSN__;
    if (dsn) {
      void fetch(dsn, {
        method: 'POST',
        body: JSON.stringify({ message: error.message }),
      }).catch(() => undefined);
    }
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="max-w-md text-sm opacity-70">{this.state.error.message}</p>
          <button
            className="rounded bg-cyan-500 px-4 py-2 font-semibold text-black"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
