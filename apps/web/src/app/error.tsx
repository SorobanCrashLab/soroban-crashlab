'use client';

import RouteErrorFallback from '../components/error/RouteErrorFallback';

/**
 * Root error boundary — last resort when no segment boundary handles an error.
 * Route segments own their richer boundary; this one applies the same global
 * error taxonomy so even an unhandled failure is classed, recoverable and
 * reportable (#1879).
 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorFallback error={error} reset={reset} route="/" />;
}
