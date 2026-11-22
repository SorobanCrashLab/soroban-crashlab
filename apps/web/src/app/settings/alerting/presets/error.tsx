'use client';

import RouteErrorFallback from '../../../../components/error/RouteErrorFallback';

/** Route boundary for `/settings/alerting/presets` (#1879). */
export default function SegmentSettingsAlertingPresetsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorFallback error={error} reset={reset} route="/settings/alerting/presets" />;
}
