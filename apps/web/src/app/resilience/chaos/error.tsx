'use client';

import RouteErrorFallback from '../../../components/error/RouteErrorFallback';

export default function ChaosError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorFallback error={error} reset={reset} route="/resilience/chaos" />;
}
