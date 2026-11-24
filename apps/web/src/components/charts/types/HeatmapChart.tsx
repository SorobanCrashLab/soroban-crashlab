import type { CSSProperties } from 'react';

export interface HeatmapCell {
  label: string;
  value: number;
  description?: string;
}

export interface HeatmapRow {
  id: string;
  label: string;
  cells: readonly HeatmapCell[];
}

export interface HeatmapChartProps {
  title: string;
  description: string;
  columns: readonly string[];
  rows: readonly HeatmapRow[];
  min?: number;
  max: number;
  formatValue?: (value: number) => string;
}

export function HeatmapChart({
  title,
  description,
  columns,
  rows,
  min = 0,
  max,
  formatValue = String,
}: HeatmapChartProps) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    throw new RangeError('Heatmap requires finite bounds and max greater than min');
  }
  return (
    <figure className="chart-container">
      <figcaption className="chart-heading">
        <div>
          <h3 className="chart-title">{title}</h3>
          <p className="chart-description">{description}</p>
        </div>
      </figcaption>
      <div className="chart-table-scroll">
        <table className="chart-data-table chart-heatmap">
          <caption>{title}</caption>
          <thead><tr><th scope="col">Series</th>{columns.map((column) => <th scope="col" key={column}>{column}</th>)}</tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">{row.label}</th>
                {row.cells.map((cell, index) => {
                  const intensity = Math.round(Math.max(0, Math.min(1, (cell.value - min) / (max - min))) * 100);
                  return (
                    <td key={`${row.id}-${columns[index] ?? index}`} title={cell.description}>
                      <span className="chart-heatmap-value">{formatValue(cell.value)}</span>
                      <span className="chart-heatmap-track" aria-hidden="true">
                        <span style={{ '--heatmap-intensity': `${intensity}%` } as CSSProperties} />
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
