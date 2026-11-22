'use client';

import { useEffect } from 'react';

export function SentryClientBootstrap() {
  useEffect(() => {
    let cancelled = false;
    // The Sentry SDK is not needed for first paint or hydration. Loading it
    // from the effect keeps ~50 kB out of every route's initial client chunk
    // while still starting error reporting immediately after hydration (#1881).
    void import('../lib/integrations/sentry-client').then(({ initSentryClient }) => {
      if (!cancelled) initSentryClient();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
