'use client';

import RouteErrorFallback from '../../../components/error/RouteErrorFallback';

/** Route boundary for `/integrations/ci-replay` (#1879). */
export default function SegmentIntegrationsCireplayError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorFallback error={error} reset={reset} route="/integrations/ci-replay" />;
}
