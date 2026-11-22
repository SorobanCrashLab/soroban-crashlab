'use client';

import RouteErrorFallback from '../../components/error/RouteErrorFallback';

/** Route boundary for `/campaign-comparison` (#1879). */
export default function SegmentCampaigncomparisonError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorFallback error={error} reset={reset} route="/campaign-comparison" />;
}
