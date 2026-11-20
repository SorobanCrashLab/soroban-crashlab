'use client';

/**
 * Registers the CrashLab service worker (#2260) and announces offline/online
 * transitions through the shared screen-reader announcer (#2259).
 * Deliberately tiny: it is mounted inside DeferredAppChrome so it never
 * affects a route's first-load JavaScript budget.
 */

import { useEffect } from 'react';
import { useAnnouncer } from '@/components/a11y/ScreenReaderAnnouncer';

export default function ServiceWorkerRegistrar() {
  const announcer = useAnnouncer();

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Registration failure is non-fatal: the app remains fully usable online.
    });

    const goOffline = () => announcer.announce('You are offline. Cached data is available.', { politeness: 'assertive' });
    const goOnline = () => announcer.announce('Connection restored.');
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);

    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, [announcer]);

  return null;
}
