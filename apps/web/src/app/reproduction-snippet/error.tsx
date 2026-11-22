'use client';

import RouteErrorFallback from '../../components/error/RouteErrorFallback';

/** Route boundary for `/reproduction-snippet` (#1879). */
export default function SegmentReproductionsnippetError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorFallback error={error} reset={reset} route="/reproduction-snippet" />;
}
