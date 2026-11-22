'use client';

import RouteErrorFallback from '../../components/error/RouteErrorFallback';

/** Route boundary for `/audit` (#1879). */
export default function SegmentAuditError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorFallback error={error} reset={reset} route="/audit" />;
}
