import { ChartContainer, type ChartContainerProps } from '../core/ChartContainer';
import type { ChartPoint } from '../types';

export type BarChartProps<TPoint extends ChartPoint> = Omit<ChartContainerProps<TPoint>, 'kind'>;

export function BarChart<TPoint extends ChartPoint>(props: BarChartProps<TPoint>) {
  return <ChartContainer {...props} kind="bar" />;
}
