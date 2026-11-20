'use client';

import RouteErrorFallback from '../components/error/RouteErrorFallback';

/** Root error boundary: applies the shared error taxonomy to the app shell. */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorFallback error={error} reset={reset} route="/" />;
}
