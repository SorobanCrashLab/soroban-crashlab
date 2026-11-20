'use client';

/**
 * Hook for tracking remote cursors (#2192).
 *
 * Monitors awareness state to track where remote users are positioned
 * in the collaborative document.
 */

import { useState, useEffect, useCallback } from 'react';
import type { AwarenessManager, PresenceState } from '../yjs/awareness';
import type { RemoteCursorData } from './RemoteCursor';

export function useRemoteCursors(roomId: string, awareness: AwarenessManager | null) {
  const [cursors, setCursors] = useState<RemoteCursorData[]>([]);

  useEffect(() => {
    if (!awareness) return;

    const unsub = awareness.onStatesChange(() => {
      const remoteStates = awareness.getRemoteStates();
      const newCursors: RemoteCursorData[] = [];
      remoteStates.forEach((state: PresenceState) => {
        if (state.cursor) {
          newCursors.push({
            userId: state.userId,
            userName: state.userName,
            color: state.color,
            field: state.cursor.field,
            position: state.cursor.position,
          });
        }
      });
      setCursors(newCursors);
    });

    return unsub;
  }, [awareness, roomId]);

  const updateLocalCursor = useCallback(
    (field: string, position: number) => {
      if (!awareness) return;
      const localState = awareness.getLocalState();
      if (localState) {
        awareness.setLocalState({ ...localState, cursor: { field, position } });
      }
    },
    [awareness],
  );

  return { cursors, updateLocalCursor };
}
