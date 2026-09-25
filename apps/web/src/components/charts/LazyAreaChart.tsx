import dynamic from 'next/dynamic';
import type { AreaChartProps } from 'recharts';

/**
 * Lazy-loaded AreaChart wrapper that only loads recharts when the chart
 * component is rendered, reducing initial bundle size.
 *
 * Shows a skeleton placeholder while the chart library loads, matching the
 * final chart height to avoid layout shift (CLS).
 */

const AreaChartDynamic = dynamic(
  () => import('recharts').then((mod) => mod.AreaChart),
  {
    loading: () => (
      <div
        className="flex items-center justify-center bg-gray-50 dark:bg-gray-900/20 rounded animate-pulse"
        style={{ minHeight: '300px' }}
      >
        <span className="text-sm text-gray-500 dark:text-gray-400">Loading chart...</span>
      </div>
    ),
    ssr: false,
  }
);

export function LazyAreaChart(props: AreaChartProps) {
  return <AreaChartDynamic {...props} />;
}
