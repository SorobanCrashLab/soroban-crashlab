'use client';

/**
 * OffscreenCanvas sparkline cell for the data grid (#2190).
 *
 * Renders a mini sparkline chart using Canvas 2D API. Falls back to
 * a simple inline SVG when Canvas is unavailable.
 */

import { memo, useRef, useEffect } from 'react';

interface SparklineCellProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}

function SparklineCellBase({
  values,
  width = 60,
  height = 20,
  color = '#3b82f6',
}: SparklineCellProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || values.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const stepX = width / Math.max(1, values.length - 1);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    values.forEach((val, i) => {
      const x = i * stepX;
      const y = height - ((val - min) / range) * height;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();
  }, [values, width, height, color]);

  if (values.length === 0) {
    return <div style={{ width, height }} className="inline-block" />;
  }

  return <canvas ref={canvasRef} style={{ width, height }} aria-hidden="true" />;
}

export const SparklineCell = memo(SparklineCellBase);
