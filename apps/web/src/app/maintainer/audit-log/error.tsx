'use client';

import RouteErrorFallback from '../../../components/error/RouteErrorFallback';

/** Route boundary for `/maintainer/audit-log` (#1879). */
export default function SegmentMaintainerAuditlogError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorFallback error={error} reset={reset} route="/maintainer/audit-log" />;
}
