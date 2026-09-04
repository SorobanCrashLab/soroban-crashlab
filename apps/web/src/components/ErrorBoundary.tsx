import React, { Component, ErrorInfo, ReactNode } from 'react';
import {
  ErrorBoundaryState,
  initialErrorState,
  errorStateFromError,
  resetErrorState,
  haveResetKeysChanged,
} from './error-boundary-utils';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onReset?: () => void;
  onRetry?: () => void;
  resetKeys?: readonly unknown[];
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = initialErrorState;
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return errorStateFromError(error);
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.props.onError?.(error, errorInfo);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.hasError && haveResetKeysChanged(prevProps.resetKeys, this.props.resetKeys)) {
      this.reset();
    }
  }

  reset = () => {
    this.setState(resetErrorState());
    this.props.onReset?.();
    this.props.onRetry?.();
  };

  render(): ReactNode {
    const { hasError, error } = this.state;
    const { children, fallback } = this.props;

    if (hasError && error) {
      if (typeof fallback === 'function') {
        return fallback(error, this.reset);
      }
      if (fallback !== undefined) {
        return fallback;
      }
      return (
        <div>
          <h2>Something went wrong</h2>
          {error.message && <p>{error.message}</p>}
          <button onClick={this.reset}>Retry</button>
        </div>
      );
    }

    return children;
  }
}

export { ErrorBoundary };
export default ErrorBoundary;