import dynamic from 'next/dynamic';

/**
 * Lazy-loaded recharts components. Each component is code-split to reduce the
 * main bundle size. The loading skeleton maintains layout dimensions to prevent
 * Cumulative Layout Shift (CLS).
 *
 * Usage:
 *   import { LazyLineChart, LazyLine, LazyXAxis } from '@/components/charts';
 *
 * These replace direct recharts imports:
 *   Before: import { LineChart, Line, XAxis } from 'recharts';
 *   After:  import { LazyLineChart, LazyLine, LazyXAxis } from '@/components/charts';
 */

const ChartSkeleton = () => (
  <div
    className="flex items-center justify-center bg-gray-50 dark:bg-gray-900/20 rounded animate-pulse"
    style={{ minHeight: '300px', width: '100%' }}
    role="status"
    aria-label="Loading chart"
  >
    <span className="text-sm text-gray-500 dark:text-gray-400">Loading chart...</span>
  </div>
);

export const LazyLineChart = dynamic(
  () => import('recharts').then((mod) => mod.LineChart),
  { loading: ChartSkeleton, ssr: false }
);

export const LazyAreaChart = dynamic(
  () => import('recharts').then((mod) => mod.AreaChart),
  { loading: ChartSkeleton, ssr: false }
);

export const LazyBarChart = dynamic(
  () => import('recharts').then((mod) => mod.BarChart),
  { loading: ChartSkeleton, ssr: false }
);

export const LazyLine = dynamic(
  () => import('recharts').then((mod) => mod.Line),
  { ssr: false }
);

export const LazyArea = dynamic(
  () => import('recharts').then((mod) => mod.Area),
  { ssr: false }
);

export const LazyBar = dynamic(
  () => import('recharts').then((mod) => mod.Bar),
  { ssr: false }
);

export const LazyXAxis = dynamic(
  () => import('recharts').then((mod) => mod.XAxis),
  { ssr: false }
);

export const LazyYAxis = dynamic(
  () => import('recharts').then((mod) => mod.YAxis),
  { ssr: false }
);

export const LazyCartesianGrid = dynamic(
  () => import('recharts').then((mod) => mod.CartesianGrid),
  { ssr: false }
);

export const LazyTooltip = dynamic(
  () => import('recharts').then((mod) => mod.Tooltip),
  { ssr: false }
);

export const LazyLegend = dynamic(
  () => import('recharts').then((mod) => mod.Legend),
  { ssr: false }
);

export const LazyResponsiveContainer = dynamic(
  () => import('recharts').then((mod) => mod.ResponsiveContainer),
  { ssr: false }
);
