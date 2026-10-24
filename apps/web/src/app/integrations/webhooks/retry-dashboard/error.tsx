'use client';

import RouteErrorFallback from '../../../../components/error/RouteErrorFallback';

/** Route boundary for `/integrations/webhooks/retry-dashboard` (#1879). */
export default function SegmentIntegrationsWebhooksRetrydashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorFallback error={error} reset={reset} route="/integrations/webhooks/retry-dashboard" />;
}
