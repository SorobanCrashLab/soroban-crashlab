'use client';

import RouteErrorFallback from '../../components/error/RouteErrorFallback';

export default function AnalyticsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorFallback error={error} reset={reset} route="/analytics" />;
}
