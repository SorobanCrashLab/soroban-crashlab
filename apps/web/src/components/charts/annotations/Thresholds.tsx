import type { ChartThreshold } from '../types';

export interface ThresholdsProps {
  thresholds: readonly ChartThreshold[];
}

export function Thresholds({ thresholds }: ThresholdsProps) {
  return (
    <ul className="chart-threshold-list" aria-label="Chart thresholds">
      {thresholds.map((item) => (
        <li key={item.id}><strong>{item.label}:</strong> {item.value}</li>
      ))}
    </ul>
  );
}
