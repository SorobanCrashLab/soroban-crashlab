'use client';

import RouteErrorFallback from '../../components/error/RouteErrorFallback';

/** Route boundary for `/campaign-milestone-timeline` (#1879). */
export default function SegmentCampaignmilestonetimelineError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorFallback error={error} reset={reset} route="/campaign-milestone-timeline" />;
}
