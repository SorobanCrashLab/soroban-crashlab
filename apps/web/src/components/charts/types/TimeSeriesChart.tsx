import { ChartContainer, type ChartContainerProps } from '../core/ChartContainer';
import type { ChartPoint } from '../types';

export type TimeSeriesChartProps<TPoint extends ChartPoint> = Omit<ChartContainerProps<TPoint>, 'kind'> & {
  area?: boolean;
};

export function TimeSeriesChart<TPoint extends ChartPoint>({ area = false, ...props }: TimeSeriesChartProps<TPoint>) {
  return <ChartContainer {...props} kind={area ? 'area' : 'line'} />;
}
