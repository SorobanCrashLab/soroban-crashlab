'use client';

import { useEffect } from 'react';
import { initSentryClient } from '../lib/integrations/sentry-client';

export function SentryClientBootstrap() {
  useEffect(() => {
    initSentryClient();
  }, []);

  return null;
}
