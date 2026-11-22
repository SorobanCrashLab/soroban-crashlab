import { ChartContainer, type ChartContainerProps } from '../core/ChartContainer';
import type { ChartPoint } from '../types';

export type ScatterChartProps<TPoint extends ChartPoint> = Omit<ChartContainerProps<TPoint>, 'kind'>;

export function ScatterChart<TPoint extends ChartPoint>(props: ScatterChartProps<TPoint>) {
  return <ChartContainer {...props} kind="scatter" />;
}
