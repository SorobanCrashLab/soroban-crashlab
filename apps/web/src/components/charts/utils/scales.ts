import type { ChartPoint } from '../types';

export interface PlotBounds {
  width: number;
  height: number;
  left: number;
  top: number;
}

export interface Domain {
  min: number;
  max: number;
}

export function numericX(value: ChartPoint['x']): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function getDomain(values: readonly number[], includeZero = false): Domain {
  if (values.length === 0) return { min: 0, max: 1 };
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
  if (includeZero) {
    min = Math.min(0, min);
    max = Math.max(0, max);
  }
  if (min === max) {
    const padding = Math.abs(min) * 0.05 || 1;
    min -= padding;
    max += padding;
  }
  return { min, max };
}

export function scaleX(value: number, domain: Domain, bounds: PlotBounds): number {
  if (domain.max === domain.min) return bounds.left + bounds.width / 2;
  return bounds.left + ((value - domain.min) / (domain.max - domain.min)) * bounds.width;
}

export function scaleY(value: number, domain: Domain, bounds: PlotBounds): number {
  if (domain.max === domain.min) return bounds.top + bounds.height / 2;
  return bounds.top + bounds.height - ((value - domain.min) / (domain.max - domain.min)) * bounds.height;
}

export function buildLinePath(points: readonly ChartPoint[], xDomain: Domain, yDomain: Domain, bounds: PlotBounds): string {
  return points.map((point, index) => {
    const command = index === 0 ? 'M' : 'L';
    return `${command}${scaleX(numericX(point.x), xDomain, bounds)},${scaleY(point.y, yDomain, bounds)}`;
  }).join(' ');
}
