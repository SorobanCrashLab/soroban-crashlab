'use client';

import RouteErrorFallback from '../../components/error/RouteErrorFallback';

/** Route boundary for `/heatmap-calendar` (#1879). */
export default function SegmentHeatmapcalendarError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorFallback error={error} reset={reset} route="/heatmap-calendar" />;
}
