'use client';

import RouteErrorFallback from '../../../components/error/RouteErrorFallback';

export default function SessionReplayError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorFallback error={error} reset={reset} route="/support/session-replay" />;
}
