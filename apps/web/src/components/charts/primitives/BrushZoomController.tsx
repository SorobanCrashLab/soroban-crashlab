"use client";

import { useCallback, useRef, useState } from 'react';

export interface BrushState {
  /** In-progress selection in chart pixel space, or null. */
  selection: [number, number] | null;
  onPointerDown: (e: React.PointerEvent<SVGElement>) => void;
  onPointerMove: (e: React.PointerEvent<SVGElement>) => void;
  onPointerUp: () => void;
  cancel: () => void;
}

/**
 * Drag-to-zoom controller. Converts a pixel drag across the plot area into a
 * time range via `pxToTime` and reports it through `onBrush`. Drags under
 * `minPx` are treated as clicks and ignored.
 */
export function useBrushZoom(options: {
  left: number;
  right: number;
  pxToTime: (x: number) => number;
  onBrush: (range: [number, number]) => void;
  minPx?: number;
}): BrushState {
  const { left, right, pxToTime, onBrush, minPx = 6 } = options;
  const [selection, setSelection] = useState<[number, number] | null>(null);
  const start = useRef<number | null>(null);

  const xOf = useCallback(
    (e: React.PointerEvent<SVGElement>) => {
      const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
      return Math.min(Math.max(e.clientX - rect.left, left), right);
    },
    [left, right],
  );

  return {
    selection,
    onPointerDown(e) {
      start.current = xOf(e);
      setSelection([start.current, start.current]);
    },
    onPointerMove(e) {
      if (start.current === null) return;
      setSelection([start.current, xOf(e)]);
    },
    onPointerUp() {
      if (selection && Math.abs(selection[1] - selection[0]) >= minPx) {
        const [a, b] = selection[0] < selection[1] ? selection : [selection[1], selection[0]];
        onBrush([pxToTime(a), pxToTime(b)]);
      }
      start.current = null;
      setSelection(null);
    },
    cancel() {
      start.current = null;
      setSelection(null);
    },
  };
}
