'use client';

import RouteErrorFallback from '../../../components/error/RouteErrorFallback';

/** Route boundary for `/integrations/api-errors` (#1879). */
export default function SegmentIntegrationsApierrorsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorFallback error={error} reset={reset} route="/integrations/api-errors" />;
}
