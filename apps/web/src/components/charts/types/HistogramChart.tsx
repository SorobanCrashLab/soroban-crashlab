import { useMemo } from 'react';
import { BarChart } from './BarChart';
import type { ChartPoint } from '../types';

export interface HistogramChartProps {
  values: readonly number[];
  bins?: number;
  title: string;
  description: string;
  id?: string;
}

export function HistogramChart({ values, bins = 20, ...props }: HistogramChartProps) {
  const series = useMemo(() => {
    if (!Number.isInteger(bins) || bins < 1) throw new RangeError('bins must be a positive integer');
    const finiteValues = values.filter(Number.isFinite);
    if (finiteValues.length === 0) return [{ id: 'frequency', label: 'Frequency', data: [] as ChartPoint[] }];
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const value of finiteValues) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    const width = max === min ? 1 : (max - min) / bins;
    const counts = Array.from({ length: bins }, () => 0);
    for (const value of finiteValues) {
      const index = Math.min(bins - 1, Math.floor((value - min) / width));
      counts[index] += 1;
    }
    return [{
      id: 'frequency',
      label: 'Frequency',
      data: counts.map((count, index) => ({
        x: max === min ? min : min + (index + 0.5) * width,
        y: count,
      })),
    }];
  }, [bins, values]);
  return <BarChart {...props} series={series} />;
}
