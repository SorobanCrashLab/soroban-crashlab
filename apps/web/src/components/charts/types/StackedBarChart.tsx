import { ChartContainer, type ChartContainerProps } from '../core/ChartContainer';
import type { ChartPoint } from '../types';

export type StackedBarChartProps<TPoint extends ChartPoint> = Omit<ChartContainerProps<TPoint>, 'kind'>;

export function StackedBarChart<TPoint extends ChartPoint>(props: StackedBarChartProps<TPoint>) {
  return <ChartContainer {...props} kind="stacked-bar" />;
}
