import { useMemo } from 'react';
import type { ChartPoint } from '../types';
import { downsampleMinMax } from '../utils/downsample';
import { buildLinePath, getDomain, numericX, type PlotBounds } from '../utils/scales';

export interface SparklineProps<TPoint extends ChartPoint> {
  data: readonly TPoint[];
  label: string;
  color?: string;
  width?: number;
  height?: number;
}

export function Sparkline<TPoint extends ChartPoint>({
  data,
  label,
  color = 'var(--ds-color-info-text, #1e40af)',
  width = 160,
  height = 40,
}: SparklineProps<TPoint>) {
  const path = useMemo(() => {
    const points = downsampleMinMax(data, Math.max(2, width));
    const bounds: PlotBounds = { left: 1, top: 1, width: Math.max(1, width - 2), height: Math.max(1, height - 2) };
    const categories = new Map<string, number>();
    for (const point of data) {
      if (typeof point.x === 'string' && Number.isNaN(Date.parse(point.x)) && !categories.has(point.x)) {
        categories.set(point.x, categories.size);
      }
    }
    const chartX = (value: ChartPoint['x']) =>
      typeof value === 'string' && Number.isNaN(Date.parse(value))
        ? categories.get(value) ?? 0
        : numericX(value);
    const numericPoints = points.map((point) => ({ ...point, x: chartX(point.x) }));
    const xDomain = getDomain(numericPoints.map((point) => numericX(point.x)));
    const yDomain = getDomain(points.map((point) => point.y));
    return buildLinePath(numericPoints, xDomain, yDomain, bounds);
  }, [data, height, width]);
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
      <path d={path} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
