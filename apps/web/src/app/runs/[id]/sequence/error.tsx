'use client';

import RouteErrorFallback from '../../../../components/error/RouteErrorFallback';

/** Route boundary for `/runs/[id]/sequence` (#1879). */
export default function SegmentRunsIdSequenceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorFallback error={error} reset={reset} route="/runs/[id]/sequence" />;
}
