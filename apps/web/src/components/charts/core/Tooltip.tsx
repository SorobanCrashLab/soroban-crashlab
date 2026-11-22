import type { ChartPoint } from '../types';

export interface ChartTooltipProps {
  point: ChartPoint;
  seriesLabel: string;
  formatValue?: (value: number) => string;
}

export function ChartTooltip({ point, seriesLabel, formatValue = String }: ChartTooltipProps) {
  const x = point.x instanceof Date ? point.x.toISOString() : String(point.x);
  return (
    <span className="chart-point-tooltip">
      <strong>{seriesLabel}</strong>: {formatValue(point.y)} at {x}
    </span>
  );
}
