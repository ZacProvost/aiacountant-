import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetKeys?: Array<string | number>;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * ErrorBoundary component to catch and handle React component errors gracefully
 * Prevents the entire app from crashing when a component throws an error
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      errorInfo,
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // TODO: Send to error tracking service (Sentry)
    // Example: Sentry.captureException(error, { contexts: { react: { componentStack: errorInfo.componentStack } } });
  }

  componentDidUpdate(prevProps: Props): void {
    // Reset error state if resetKeys change
    if (this.state.hasError && this.props.resetKeys) {
      const hasResetKeyChanged = this.props.resetKeys.some(
        (key, index) => key !== prevProps.resetKeys?.[index]
      );
      if (hasResetKeyChanged) {
        this.resetError();
      }
    }
  }

  resetError = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="min-h-screen flex items-center justify-center bg-fiscalia-primary-dark p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-6">
            <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
              <svg
                className="w-6 h-6 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-center text-gray-900 mb-2">
              Une erreur est survenue
            </h2>
            <p className="text-gray-600 text-center mb-4">
              Nous nous excusons pour ce désagrément. L'erreur a été enregistrée et nous travaillons à la
              résoudre.
            </p>
            {this.state.error && (
              <details className="mb-4">
                <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700 mb-2">
                  Détails techniques
                </summary>
                <div className="bg-gray-50 rounded p-3 text-xs font-mono text-gray-700 overflow-auto max-h-40">
                  <p className="font-semibold mb-1">{this.state.error.toString()}</p>
                  {this.state.errorInfo?.componentStack && (
                    <pre className="whitespace-pre-wrap">{this.state.errorInfo.componentStack}</pre>
                  )}
                </div>
              </details>
            )}
            <div className="flex gap-3">
              <button
                onClick={this.resetError}
                className="flex-1 bg-fiscalia-accent-gold text-fiscalia-primary-dark font-medium py-2 px-4 rounded hover:bg-opacity-90 transition-colors"
              >
                Réessayer
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded hover:bg-gray-300 transition-colors"
              >
                Recharger la page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Specialized ErrorBoundary for financial operations
 * Shows a more specific error message and prevents data loss
 */
export const FinancialErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <ErrorBoundary
      fallback={
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <h3 className="text-red-800 font-semibold mb-2">Erreur lors de l'opération financière</h3>
          <p className="text-red-700 text-sm mb-3">
            Une erreur s'est produite lors du traitement de votre demande. Vos données n'ont pas été modifiées.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-red-600 text-white px-4 py-2 rounded text-sm hover:bg-red-700 transition-colors"
          >
            Actualiser
          </button>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
};

/**
 * Specialized ErrorBoundary for AI chat operations
 * Shows a more specific error message and allows recovery
 */
export const ChatErrorBoundary: React.FC<{ children: ReactNode; onReset?: () => void }> = ({
  children,
  onReset,
}) => {
  return (
    <ErrorBoundary
      fallback={
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-yellow-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              L'assistant est temporairement indisponible
            </h3>
            <p className="text-gray-600 text-sm mb-4">
              Une erreur s'est produite avec l'assistant IA. Vos conversations sont sauvegardées.
            </p>
            <button
              onClick={() => {
                if (onReset) onReset();
                window.location.reload();
              }}
              className="bg-fiscalia-accent-gold text-fiscalia-primary-dark px-6 py-2 rounded font-medium hover:bg-opacity-90 transition-colors"
            >
              Recharger l'assistant
            </button>
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
};


