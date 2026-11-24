"use client";

/**
 * React binding for synchronized cursor + brush range across charts that share
 * a `group` id (#2302). The store itself lives in `syncGroup.ts`.
 */

import { useCallback, useSyncExternalStore } from 'react';
import { getSyncGroup } from './syncGroup';

export function useSyncedCharts(groupId: string) {
  const group = getSyncGroup(groupId);
  const state = useSyncExternalStore(group.subscribe, group.get, group.get);
  const setCursor = useCallback((t: number | null) => group.setCursor(t), [group]);
  const setRange = useCallback((r: [number, number] | null) => group.setRange(r), [group]);
  const reset = useCallback(() => group.setRange(null), [group]);
  return { cursor: state.cursor, range: state.range, setCursor, setRange, reset };
}
