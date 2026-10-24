'use client';

import RouteErrorFallback from '../../../../components/error/RouteErrorFallback';

/** Route boundary for `/integrations/webhooks/dead-letter-queue` (#1879). */
export default function SegmentIntegrationsWebhooksDeadletterqueueError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorFallback error={error} reset={reset} route="/integrations/webhooks/dead-letter-queue" />;
}
