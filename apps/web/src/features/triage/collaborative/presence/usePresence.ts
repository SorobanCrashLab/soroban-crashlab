'use client';

/**
 * Hook for Yjs Awareness presence (#2192).
 *
 * Tracks local and remote presence states. Updates on awareness changes.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AwarenessManager, type PresenceState } from '../yjs/awareness';

export function usePresence(roomId: string) {
  const awarenessRef = useRef<AwarenessManager | null>(null);
  const [localState, setLocalState] = useState<PresenceState | null>(null);
  const [remoteStates, setRemoteStates] = useState<Map<string, PresenceState>>(new Map());

  useEffect(() => {
    const manager = new AwarenessManager();
    awarenessRef.current = manager;

    const unsub = manager.onStatesChange(() => {
      setLocalState(manager.getLocalState());
      setRemoteStates(manager.getRemoteStates());
    });

    return () => {
      unsub();
      manager.destroy();
      awarenessRef.current = null;
    };
  }, [roomId]);

  const setLocalState = useCallback((state: Partial<PresenceState>) => {
    awarenessRef.current?.setLocalState(state);
  }, []);

  const markActive = useCallback(() => {
    awarenessRef.current?.updateActivity();
  }, []);

  const markAway = useCallback(() => {
    awarenessRef.current?.markAway();
  }, []);

  return { localState, remoteStates, setLocalState, markActive, markAway };
}
