'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

const THRESHOLD = 72; // px to pull before triggering refresh
const RESISTANCE = 0.4; // how much the pull slows down as you drag

export interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  /** Element to attach touch listeners to; defaults to window */
  containerRef?: RefObject<HTMLElement | null>;
  disabled?: boolean;
}

export interface UsePullToRefreshResult {
  isPulling: boolean;
  isRefreshing: boolean;
  pullDistance: number;
}

export function usePullToRefresh({
  onRefresh,
  containerRef,
  disabled = false,
}: UsePullToRefreshOptions): UsePullToRefreshResult {
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);

  const startYRef = useRef(0);
  const currentDistanceRef = useRef(0);
  const isRefreshingRef = useRef(false);

  const canPull = useCallback(() => {
    if (disabled || isRefreshingRef.current) return false;
    // Only allow pull when page is scrolled to top
    const scrollTop =
      containerRef?.current?.scrollTop ?? window.scrollY ?? document.documentElement.scrollTop;
    return scrollTop <= 0;
  }, [disabled, containerRef]);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!canPull()) return;
      startYRef.current = e.touches[0].clientY;
    },
    [canPull],
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!canPull() && currentDistanceRef.current === 0) return;

      const delta = e.touches[0].clientY - startYRef.current;
      if (delta <= 0) {
        if (currentDistanceRef.current > 0) {
          currentDistanceRef.current = 0;
          setIsPulling(false);
          setPullDistance(0);
        }
        return;
      }

      // Apply resistance so it feels springy
      const distance = Math.min(delta * RESISTANCE, THRESHOLD * 1.5);
      currentDistanceRef.current = distance;

      if (distance > 4) {
        // Prevent the page from scrolling while pulling
        e.preventDefault();
        setIsPulling(true);
        setPullDistance(distance);
      }
    },
    [canPull],
  );

  const handleTouchEnd = useCallback(async () => {
    const distance = currentDistanceRef.current;
    currentDistanceRef.current = 0;

    if (distance < THRESHOLD) {
      setIsPulling(false);
      setPullDistance(0);
      return;
    }

    // Triggered — animate back to spinner position then refresh
    setIsPulling(false);
    setIsRefreshing(true);
    isRefreshingRef.current = true;
    setPullDistance(0);

    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
      isRefreshingRef.current = false;
    }
  }, [onRefresh]);

  useEffect(() => {
    const target = containerRef?.current ?? window;

    target.addEventListener('touchstart', handleTouchStart as EventListener, { passive: true });
    target.addEventListener('touchmove', handleTouchMove as EventListener, { passive: false });
    target.addEventListener('touchend', handleTouchEnd as EventListener, { passive: true });

    return () => {
      target.removeEventListener('touchstart', handleTouchStart as EventListener);
      target.removeEventListener('touchmove', handleTouchMove as EventListener);
      target.removeEventListener('touchend', handleTouchEnd as EventListener);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, containerRef]);

  return { isPulling, isRefreshing, pullDistance };
}
