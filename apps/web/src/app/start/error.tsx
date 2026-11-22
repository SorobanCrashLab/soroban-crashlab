'use client';

import RouteErrorFallback from '../../components/error/RouteErrorFallback';

/** Route boundary for `/start` (#1879). */
export default function SegmentStartError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorFallback error={error} reset={reset} route="/start" />;
}
