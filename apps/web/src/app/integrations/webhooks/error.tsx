'use client';

import RouteErrorFallback from '../../../components/error/RouteErrorFallback';

/** Route boundary for `/integrations/webhooks` (#1879). */
export default function SegmentIntegrationsWebhooksError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorFallback error={error} reset={reset} route="/integrations/webhooks" />;
}
