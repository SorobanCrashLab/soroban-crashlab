'use client';

import RouteErrorFallback from '../../../../components/error/RouteErrorFallback';

/** Route boundary for `/runs/[id]/replay-history` (#1879). */
export default function SegmentRunsIdReplayhistoryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorFallback error={error} reset={reset} route="/runs/[id]/replay-history" />;
}
