'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getResponsiveRunColumns,
  getViewportBreakpoint,
  type RunTableBreakpoint,
} from './run-table-columns-utils';

/**
 * Returns the current run-table breakpoint, derived from the viewport width.
 *
 * SSR-safe: it starts at `'desktop'` so the server-rendered markup matches the
 * first client render, then reconciles to the real viewport after mount. This
 * avoids React hydration mismatches while still adapting columns to phone and
 * portrait-tablet layouts. Resize is coalesced through requestAnimationFrame.
 */
export function useRunTableBreakpoint(): RunTableBreakpoint {
  const [breakpoint, setBreakpoint] = useState<RunTableBreakpoint>('desktop');

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let raf = 0;
    const compute = () => setBreakpoint(getViewportBreakpoint(window.innerWidth));
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    };

    compute();
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return breakpoint;
}

/**
 * Resolves the columns to render for the current viewport. Until the
 * breakpoint is known after mount it returns the caller's base list unchanged,
 * so the first paint always matches the server render.
 */
export function useResponsiveRunColumns(baseColumns: string[]): string[] {
  const breakpoint = useRunTableBreakpoint();
  return useMemo(
    () => getResponsiveRunColumns(baseColumns, breakpoint),
    [baseColumns, breakpoint],
  );
}