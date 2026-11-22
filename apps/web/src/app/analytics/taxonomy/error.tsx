'use client';

import RouteErrorFallback from '../../../components/error/RouteErrorFallback';

/** Route boundary for `/analytics/taxonomy` (#1879). */
export default function SegmentAnalyticsTaxonomyError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorFallback error={error} reset={reset} route="/analytics/taxonomy" />;
}
