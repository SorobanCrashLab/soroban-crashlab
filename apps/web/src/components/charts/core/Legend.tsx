'use client';

import type { ChartSeries } from '../types';
import { resolveSeriesColor } from '../ChartTheme';

export interface ChartLegendProps {
  series: readonly ChartSeries[];
  hiddenSeries: ReadonlySet<string>;
  onToggle: (id: string) => void;
}

export function ChartLegend({ series, hiddenSeries, onToggle }: ChartLegendProps) {
  return (
    <ul className="chart-legend" aria-label="Chart series">
      {series.map((item, index) => {
        const hidden = hiddenSeries.has(item.id);
        const color = resolveSeriesColor(item.color, index);
        return (
          <li key={item.id}>
            <button
              type="button"
              className="chart-legend-toggle"
              aria-pressed={!hidden}
              onClick={() => onToggle(item.id)}
            >
              <span className="chart-legend-swatch" style={{ backgroundColor: color }} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
