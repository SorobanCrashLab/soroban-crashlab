'use client';

import { useCallback, useRef, useState } from 'react';

export const DISTANCE_THRESHOLD = 80;
export const VELOCITY_THRESHOLD = 0.5;
export const LEFT_EDGE_EXCLUSION_PX = 24;

export type SwipeDirection = 'left' | 'right' | null;

export interface SwipeGestureState {
  direction: SwipeDirection;
  distance: number;
  progress: number;
  swiping: boolean;
}

interface PointerRecord {
  id: number;
  startX: number;
  startTime: number;
  currentX: number;
  currentY: number;
}

interface UseSwipeGestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  enabled?: boolean;
}

export function useSwipeGesture({ onSwipeLeft, onSwipeRight, enabled = true }: UseSwipeGestureOptions) {
  const pointerRef = useRef<PointerRecord | null>(null);
  const axisLockedRef = useRef<'horizontal' | 'vertical' | null>(null);
  const [gesture, setGesture] = useState<SwipeGestureState>({
    direction: null,
    distance: 0,
    progress: 0,
    swiping: false,
  });

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled) return;
      if (e.button !== 0 && e.button !== 1) return;

      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      if (relativeX < LEFT_EDGE_EXCLUSION_PX) return;

      pointerRef.current = {
        id: e.pointerId,
        startX: e.clientX,
        startTime: Date.now(),
        currentX: e.clientX,
        currentY: e.clientY,
      };
      axisLockedRef.current = null;

      target.setPointerCapture(e.pointerId);
    },
    [enabled],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const record = pointerRef.current;
      if (!record || record.id !== e.pointerId) return;

      record.currentX = e.clientX;
      record.currentY = e.clientY;

      const dx = e.clientX - record.startX;
      const dy = e.clientY - record.startY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (!axisLockedRef.current) {
        if (absDx < 10 && absDy < 10) return;
        axisLockedRef.current = absDx > absDy ? 'horizontal' : 'vertical';
      }

      if (axisLockedRef.current === 'vertical') return;

      const direction: SwipeDirection = dx > 0 ? 'right' : 'left';
      const resistance = 0.4;
      const distance = absDx;
      const rawProgress = distance / DISTANCE_THRESHOLD;
      const clampedProgress = Math.min(rawProgress, 1);
      const dampenedProgress = clampedProgress * (1 - clampedProgress * 0.25);
      const dampenedDistance = distance * resistance + distance * (1 - resistance) * dampenedProgress;

      setGesture({
        direction,
        distance: dampenedDistance,
        progress: dampenedProgress,
        swiping: true,
      });
    },
    [],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const record = pointerRef.current;
      if (!record || record.id !== e.pointerId) {
        return;
      }

      const dx = record.currentX - record.startX;
      const dy = record.currentY - record.startY;
      const elapsed = Date.now() - record.startTime;
      const velocity = Math.abs(dx) / Math.max(elapsed, 1);
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      const lockedAxis = axisLockedRef.current;

      pointerRef.current = null;
      axisLockedRef.current = null;

      const triggered =
        lockedAxis === 'horizontal' ||
        (absDx > absDy && absDx >= DISTANCE_THRESHOLD && velocity >= VELOCITY_THRESHOLD);

      if (triggered) {
        if (dx < 0 && onSwipeLeft) {
          onSwipeLeft();
        } else if (dx > 0 && onSwipeRight) {
          onSwipeRight();
        }
      }

      setGesture({ direction: null, distance: 0, progress: 0, swiping: false });
    },
    [onSwipeLeft, onSwipeRight],
  );

  const onPointerCancel = useCallback(() => {
    pointerRef.current = null;
    axisLockedRef.current = null;
    setGesture({ direction: null, distance: 0, progress: 0, swiping: false });
  }, []);

  return {
    gesture,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
  };
}
