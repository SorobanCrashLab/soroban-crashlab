'use client';

import { useEffect } from 'react';
import { safeStorage } from '../lib/local-storage';

/**
 * Session replay capture bootstrap (#2341).
 *
 * Mirrors `SentryClientBootstrap`: nothing is imported unless replay is
 * enabled for the deployment (`NEXT_PUBLIC_CRASHLAB_SESSION_REPLAY=on`, inlined
 * at build time) or this browser opted into replay developer mode. With
 * replay off the only cost is one storage read after hydration — the
 * recorder, transport and consent logic stay out of every bundle path.
 * Consent, privacy signals and sampling are decided inside the host.
 */
export function SessionReplayBootstrap() {
  useEffect(() => {
    const enabled = process.env.NEXT_PUBLIC_CRASHLAB_SESSION_REPLAY === 'on';
    if (!enabled && safeStorage.getItem('crashlab.replay.devMode') !== '1') return;
    let cancelled = false;
    void import('../features/session-replay/capture/host').then(({ startReplayCapture }) => {
      if (!cancelled) startReplayCapture();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
