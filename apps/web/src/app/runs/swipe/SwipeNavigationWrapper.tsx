'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useSwipeGesture,
} from './use-swipe-gesture';
import {
  captureRunListContext,
  readRunListContext,
  resolveNeighbors,
} from './run-list-context';

export const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

interface SwipeNavigationWrapperProps {
  currentRunId: string;
  children: React.ReactNode;
}

export default function SwipeNavigationWrapper({ currentRunId, children }: SwipeNavigationWrapperProps) {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [neighbors, setNeighbors] = useState<{ prev: string | null; next: string | null }>({ prev: null, next: null });

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- hydrate gesture context once per run */
    setHydrated(true);
    const context = readRunListContext();
    setNeighbors(resolveNeighbors(currentRunId, context));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [currentRunId]);

  const navigateToRun = useCallback(
    (runId: string) => {
      router.push(`/runs/${runId}`);
    },
    [router],
  );

  const onSwipeLeft = useCallback(() => {
    if (neighbors.next) {
      navigateToRun(neighbors.next);
    }
  }, [neighbors, navigateToRun]);

  const onSwipeRight = useCallback(() => {
    if (neighbors.prev) {
      navigateToRun(neighbors.prev);
    }
  }, [neighbors, navigateToRun]);

  const hasNavigation = neighbors.prev !== null || neighbors.next !== null;

  const { gesture, handlers } = useSwipeGesture({
    onSwipeLeft,
    onSwipeRight,
    enabled: hasNavigation,
  });

  const transform = gesture.swiping
    ? gesture.direction === 'left'
      ? `translateX(${-gesture.distance}px)`
      : `translateX(${gesture.distance}px)`
    : undefined;

  const swipeIndicator = gesture.swiping
    ? gesture.direction === 'left' && !neighbors.next
      ? 'edge-end'
      : gesture.direction === 'right' && !neighbors.prev
        ? 'edge-start'
        : null
    : null;

  return (
    <div className="relative overflow-hidden">
      <div
        {...handlers}
        style={transform ? { transform, transition: 'transform 0.1s ease-out', willChange: 'transform' } : undefined}
        className="touch-pan-y select-none"
      >
        {children}
      </div>

      {gesture.swiping && gesture.direction === 'left' && neighbors.next && (
        <div
          className="absolute top-0 right-0 bottom-0 flex items-center justify-end pr-4 pointer-events-none z-10"
          style={{ opacity: Math.min(gesture.progress, 0.6) }}
        >
          <div className="bg-zinc-800/80 text-white text-xs font-medium px-3 py-1.5 rounded-full">
            Next →
          </div>
        </div>
      )}

      {gesture.swiping && gesture.direction === 'right' && neighbors.prev && (
        <div
          className="absolute top-0 left-0 bottom-0 flex items-center justify-start pl-4 pointer-events-none z-10"
          style={{ opacity: Math.min(gesture.progress, 0.6) }}
        >
          <div className="bg-zinc-800/80 text-white text-xs font-medium px-3 py-1.5 rounded-full">
            ← Previous
          </div>
        </div>
      )}

      {swipeIndicator === 'edge-end' && (
        <div className="absolute top-1/2 right-2 -translate-y-1/2 pointer-events-none z-10 opacity-40">
          <div className="text-xs text-zinc-400">No more runs</div>
        </div>
      )}
      {swipeIndicator === 'edge-start' && (
        <div className="absolute top-1/2 left-2 -translate-y-1/2 pointer-events-none z-10 opacity-40">
          <div className="text-xs text-zinc-400">No more runs</div>
        </div>
      )}

      {!hydrated && (
        <div className="absolute left-0 top-0 bottom-0 w-1 border-l border-zinc-200 dark:border-zinc-700 opacity-0 pointer-events-none" />
      )}
    </div>
  );
}

export { captureRunListContext };
