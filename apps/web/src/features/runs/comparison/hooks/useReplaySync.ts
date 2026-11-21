"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { ReplaySyncController } from "../sync/ReplaySyncController";
import type { CrashMatch } from "../types";

export function useReplaySync(runIds: string[]) {
  const key = runIds.join("|");
  const controller = useMemo(() => new ReplaySyncController(key ? key.split("|") : []), [key]);
  const state = useSyncExternalStore(
    useCallback((listener: () => void) => controller.subscribe(listener), [controller]),
    useCallback(() => controller.snapshot(), [controller]),
    useCallback(() => controller.snapshot(), [controller]),
  );

  return {
    state,
    seek: useCallback((ratio: number) => controller.seek(ratio), [controller]),
    advance: useCallback((elapsedMs: number) => controller.advance(elapsedMs), [controller]),
    setPlaying: useCallback((playing: boolean) => controller.setPlaying(playing), [controller]),
    setDurations: useCallback((durations: Record<string, number>) => controller.setDurations(durations), [controller]),
    setLinkedCrash: useCallback((match: CrashMatch | undefined) => controller.setLinkedCrash(match), [controller]),
    maxDurationMs: controller.maxDurationMs,
  };
}
